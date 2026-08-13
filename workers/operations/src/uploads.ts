import { canAccessResource, canOverrideTenant, resourceForUploadEntity } from "../../../lib/authorization";
import { uploadCompleteSchema, uploadInitializeSchema } from "../../../lib/validation";
import { hashValue, primaryConsistencyToken, resolveTenantRoute, shardDatabase } from "./database";
import { ApiError, readJson, requireIdempotencyKey, success } from "./http";
import type { Env, RequestContext } from "./types";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const encoder = new TextEncoder();

type UploadToken = { version: 1; mediaId: string; tenantKey: string; r2Key: string; contentType: string; size: number; filename: string; visibility: "private" | "public"; exp: number; purpose: "upload" | "download" };

export async function initializeUpload(request: Request, env: Env, context: RequestContext): Promise<Response> {
  const parsed = parseUploadInput(await readJson<unknown>(request));
  const filename = cleanFilename(parsed.filename);const { contentType,size,entityType,entityId }=parsed;
  if (parsed.visibility === "public") throw new ApiError(403, "PUBLIC_UPLOAD_DENIED", "Public uploads must use the validated content-image path");
  const visibility = "private" as const;
  const tenantKey = parsed.tenantKey ?? context.tenantKey;
  assertUploadAccess(context,entityType,tenantKey,"write");
  const route = await resolveTenantRoute(env, tenantKey, null); const database = shardDatabase(env, route.shard);
  await assertEntityOwnership(database, tenantKey, entityType, entityId);
  const id = crypto.randomUUID(); const now = Date.now(); const expiresAt = now + 15 * 60_000;
  const r2Key = `${visibility}/${tenantKey.replaceAll(":", "/")}/${entityType}/${entityId}/${id}-${filename}`;
  const token = await signToken({ version: 1, mediaId: id, tenantKey, r2Key, contentType, size, filename, visibility, exp: Math.floor(expiresAt / 1_000), purpose: "upload" }, env.UPLOAD_TOKEN_SECRET);
  const keyHash = await hashValue(requireIdempotencyKey(request)); const idempotencyId = crypto.randomUUID(); const auditId = crypto.randomUUID();
  const data = { id, uploadUrl: `/v2/uploads/${id}/body`, uploadToken: token, expiresAt, contentType, size };
  const results = await database.batch([
    database.prepare("INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, 'uploads:initialize', ?, 'pending', ?, ?, ?)").bind(idempotencyId, context.actor.sub, keyHash, now + 48 * 60 * 60_000, now, now),
    database.prepare(`INSERT INTO media_assets (id, tenant_key, owner_user_id, entity_type, entity_id, r2_key, filename, content_type, size_bytes, visibility, status, upload_expires_at, row_version, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM idempotency_records WHERE id = ?)`).bind(id, tenantKey, context.actor.sub, entityType, entityId, r2Key, filename, contentType, size, visibility, expiresAt, now, now, now, idempotencyId),
    database.prepare("INSERT INTO audit_events (id, tenant_key, actor_id, entity_type, entity_id, action, metadata_json, row_version, created_at) SELECT ?, ?, ?, 'media_asset', ?, 'upload_initialized', ?, 1, ? WHERE EXISTS (SELECT 1 FROM media_assets WHERE id = ?)").bind(auditId, tenantKey, context.actor.sub, id, JSON.stringify({ entityType, entityId, contentType, size }), now, id),
    database.prepare("UPDATE idempotency_records SET status = 'completed', response_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM media_assets WHERE id = ?)").bind(JSON.stringify({ data, jobs: [] }), now, idempotencyId, id),
  ]);
  if ((results[1].meta.changes ?? 0) === 0) {
    const existing = await database.prepare("SELECT response_json FROM idempotency_records WHERE actor_id = ? AND scope = 'uploads:initialize' AND key_hash = ? AND status = 'completed'").bind(context.actor.sub, keyHash).first<{ response_json: string }>();
    if (!existing) throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "This upload initialization is already processing");
    const replay = JSON.parse(existing.response_json) as { data: unknown; jobs: unknown[] };
    return success(request, env, context, replay.data, { jobs: replay.jobs, headers: { "Idempotent-Replayed": "true" } });
  }
  return success(request, env, context, data, { status: 201, jobs: [], consistencyToken:await primaryConsistencyToken(database,route.shard) });
}

export async function streamUpload(request: Request, env: Env, context: RequestContext, mediaId: string): Promise<Response> {
  const token = await verifyToken(request.headers.get("X-Upload-Token") ?? "", env.UPLOAD_TOKEN_SECRET, "upload");
  if (token.mediaId !== mediaId) throw new ApiError(403, "UPLOAD_TOKEN_DENIED", "The upload token does not match this file");
  const contentLength = Number(request.headers.get("Content-Length"));
  const contentType = (request.headers.get("Content-Type") ?? "").split(";", 1)[0].toLowerCase();
  if (contentLength !== token.size || contentLength > MAX_UPLOAD_BYTES) throw new ApiError(400, "UPLOAD_SIZE_MISMATCH", "The upload size does not match the initialized file");
  if (contentType !== token.contentType || !allowedTypes.has(contentType)) throw new ApiError(415, "UPLOAD_TYPE_MISMATCH", "The upload content type does not match the initialized file");
  if (!request.body) throw new ApiError(400, "EMPTY_UPLOAD", "The upload body is empty");
  const route = await resolveTenantRoute(env, token.tenantKey, null); const database = shardDatabase(env, route.shard);
  const asset = await database.prepare("SELECT status, r2_key, entity_type FROM media_assets WHERE id = ? AND tenant_key = ? AND upload_expires_at > ?").bind(mediaId, token.tenantKey, Date.now()).first<{ status: string; r2_key: string; entity_type: string }>();
  if (!asset || asset.r2_key !== token.r2Key) throw new ApiError(404, "UPLOAD_NOT_FOUND", "The upload session is missing or expired");
  assertUploadAccess(context,asset.entity_type,token.tenantKey,"write");
  if (asset.status === "complete") return success(request, env, context, { id: mediaId, status: "complete" }, { headers: { "Idempotent-Replayed": "true" } });

  const { prefix, stream } = await peekStream(request.body, 16, token.size);
  if (!matchesSignature(contentType, prefix)) throw new ApiError(415, "INVALID_FILE_SIGNATURE", "The file content does not match its declared type");
  try { await env.UPLOADS.put(token.r2Key, stream, { httpMetadata: { contentType, contentDisposition: `attachment; filename="${token.filename}"` }, customMetadata: { mediaId, tenantKey: token.tenantKey } }); }
  catch { throw new ApiError(400, "UPLOAD_SIZE_MISMATCH", "The uploaded bytes do not match the initialized size"); }
  const uploadedAt=Date.now();
  await database.prepare("UPDATE media_assets SET status = 'uploaded', updated_at = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?").bind(uploadedAt,uploadedAt, mediaId, token.tenantKey).run();
  return success(request, env, context, { id: mediaId, status: "uploaded" },{consistencyToken:await primaryConsistencyToken(database,route.shard)});
}

export async function completeUpload(request: Request, env: Env, context: RequestContext, mediaId: string): Promise<Response> {
  const body = uploadCompleteSchema.safeParse(await readJson<unknown>(request));if(!body.success)throw new ApiError(422,"VALIDATION_FAILED","The completion request is invalid");
  const tenantKey = body.data.tenantKey ?? context.tenantKey;
  const token=await verifyToken(request.headers.get("X-Upload-Token")??"",env.UPLOAD_TOKEN_SECRET,"upload");
  if(token.mediaId!==mediaId||token.tenantKey!==tenantKey)throw new ApiError(403,"UPLOAD_TOKEN_DENIED","The upload token does not match this file");
  const route = await resolveTenantRoute(env, tenantKey, null); const database = shardDatabase(env, route.shard);
  const asset = await database.prepare("SELECT r2_key, size_bytes, content_type, status, entity_type FROM media_assets WHERE id = ? AND tenant_key = ?").bind(mediaId, tenantKey).first<{ r2_key: string; size_bytes: number; content_type: string; status: string; entity_type: string }>();
  if (!asset) throw new ApiError(404, "UPLOAD_NOT_FOUND", "The upload was not found");
  assertUploadAccess(context,asset.entity_type,tenantKey,"write");
  const object = await env.UPLOADS.head(asset.r2_key);
  if (!object || object.size !== asset.size_bytes) throw new ApiError(409, "UPLOAD_INCOMPLETE", "The uploaded object is incomplete");
  const completedAt=Date.now();
  await database.prepare("UPDATE media_assets SET status = 'complete', upload_expires_at = NULL, updated_at = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?").bind(completedAt,completedAt, mediaId, tenantKey).run();
  return success(request, env, context, { id: mediaId, status: "complete" },{consistencyToken:await primaryConsistencyToken(database,route.shard)});
}

export async function initializeDownload(request: Request, env: Env, context: RequestContext, mediaId: string): Promise<Response> {
  const url = new URL(request.url); const tenantKey = url.searchParams.get("tenant") ?? context.tenantKey;
  const route = await resolveTenantRoute(env, tenantKey, null); const database = shardDatabase(env, route.shard);
  const asset = await database.prepare("SELECT r2_key, content_type, size_bytes, filename, visibility, entity_type FROM media_assets WHERE id = ? AND tenant_key = ? AND status = 'complete'").bind(mediaId, tenantKey).first<{ r2_key: string; content_type: string; size_bytes: number; filename: string; visibility: "private"|"public"; entity_type:string }>();
  if (!asset) throw new ApiError(404, "FILE_NOT_FOUND", "The file was not found");
  assertUploadAccess(context,asset.entity_type,tenantKey,"read");
  const exp = Math.floor(Date.now() / 1_000) + 300;
  const token = await signToken({ version: 1, mediaId, tenantKey, r2Key: asset.r2_key, contentType: asset.content_type, size: asset.size_bytes, filename:cleanFilename(asset.filename)||"download",visibility:asset.visibility, exp, purpose: "download" }, env.UPLOAD_TOKEN_SECRET);
  const downloadUrl = new URL(`/v2/files/${mediaId}`, request.url); downloadUrl.searchParams.set("token", token);
  return success(request, env, context, { url: downloadUrl.toString(), expiresAt: exp * 1_000 });
}

export async function downloadFile(request: Request, env: Env, mediaId: string): Promise<Response> {
  const token = await verifyToken(new URL(request.url).searchParams.get("token") ?? "", env.UPLOAD_TOKEN_SECRET, "download");
  if (token.mediaId !== mediaId) throw new ApiError(403, "DOWNLOAD_TOKEN_DENIED", "The download token does not match this file");
  const object = await env.UPLOADS.get(token.r2Key);
  if (!object) throw new ApiError(404, "FILE_NOT_FOUND", "The file was not found");
  const headers = new Headers(); object.writeHttpMetadata(headers); headers.set("Cache-Control", "private, no-store"); headers.set("Content-Length", String(object.size));headers.set("X-Content-Type-Options","nosniff");headers.set("Referrer-Policy","no-referrer");
  const isImage=token.contentType.startsWith("image/");headers.set("Content-Disposition",`${token.visibility==="public"&&isImage?"inline":"attachment"}; filename="${token.filename}"`);if(!isImage)headers.set("Content-Security-Policy","sandbox; default-src 'none'; frame-ancestors 'none'");
  return new Response(object.body, { headers });
}

async function assertEntityOwnership(database: D1Database, tenantKey: string, entityType: string, entityId: string): Promise<void> {
  const tables: Record<string, string> = { trip_request: "trip_requests", quote: "quotes", booking: "bookings", invoice: "invoices", support_ticket: "support_tickets", profile: "trip_requests" };
  const table = tables[entityType]; if (!table) throw new ApiError(400, "INVALID_ENTITY_TYPE", "Uploads are not supported for this entity type");
  const row = await database.prepare(`SELECT id FROM ${table} WHERE id = ? AND tenant_key = ? LIMIT 1`).bind(entityId, tenantKey).first();
  if (!row) throw new ApiError(404, "ENTITY_NOT_FOUND", "The upload owner record was not found");
}

async function peekStream(body: ReadableStream<Uint8Array>, bytes: number, expectedBytes: number): Promise<{ prefix: Uint8Array; stream: ReadableStream<Uint8Array> }> {
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let collected = 0;
  while (collected < bytes) { const result = await reader.read(); if (result.done) break; chunks.push(result.value); collected += result.value.byteLength;if(collected>expectedBytes)throw new ApiError(400,"UPLOAD_SIZE_MISMATCH","The uploaded bytes exceed the initialized size"); }
  const prefix = new Uint8Array(Math.min(collected, bytes)); let offset = 0;
  for (const chunk of chunks) { const take = Math.min(chunk.byteLength, prefix.byteLength - offset); prefix.set(chunk.subarray(0, take), offset); offset += take; if (offset >= prefix.byteLength) break; }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); },
    async pull(controller) { const result = await reader.read(); if (result.done) { if(collected!==expectedBytes)controller.error(new Error("size mismatch"));else controller.close(); } else {collected+=result.value.byteLength;if(collected>expectedBytes)controller.error(new Error("size mismatch"));else controller.enqueue(result.value);} },
    cancel(reason) { return reader.cancel(reason); },
  });
  return { prefix, stream };
}

function matchesSignature(type: string, bytes: Uint8Array): boolean {
  if (type === "image/png") return starts(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if (type === "image/jpeg") return starts(bytes, [0xff,0xd8,0xff]);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0,5)) === "%PDF-";
  return false;
}
function starts(value: Uint8Array, prefix: number[]) { return prefix.every((byte, index) => value[index] === byte); }
function cleanFilename(value: string): string { return value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 120); }

async function signToken(payload: UploadToken, secret: string): Promise<string> { assertTokenSecret(secret);const body = base64(JSON.stringify(payload)); return `${body}.${await signature(body, secret)}`; }
async function verifyToken(token: string, secret: string, purpose: UploadToken["purpose"]): Promise<UploadToken> {
  assertTokenSecret(secret);
  const [body, supplied, extra] = token.split("."); if (!body || !supplied || extra || !constantTimeEqual(supplied,await signature(body, secret))) throw new ApiError(403, "INVALID_FILE_TOKEN", "The file token is invalid");
  let payload: UploadToken; try { payload = JSON.parse(unbase64(body)) as UploadToken; } catch { throw new ApiError(403, "INVALID_FILE_TOKEN", "The file token is invalid"); }
  if (payload.version !== 1 || payload.purpose !== purpose || payload.exp <= Math.floor(Date.now() / 1_000)) throw new ApiError(403, "EXPIRED_FILE_TOKEN", "The file token is invalid or expired"); return payload;
}
async function signature(value: string, secret: string): Promise<string> { const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))].map((byte) => byte.toString(16).padStart(2,"0")).join(""); }
function base64(value: string): string { let binary="";for(const byte of encoder.encode(value))binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/u,""); }
function unbase64(value: string): string { const padded=value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=");return new TextDecoder().decode(Uint8Array.from(atob(padded),(character)=>character.charCodeAt(0))); }
function constantTimeEqual(left:string,right:string):boolean{if(left.length!==right.length)return false;let different=0;for(let index=0;index<left.length;index+=1)different|=left.charCodeAt(index)^right.charCodeAt(index);return different===0;}

function assertTokenSecret(secret:string):void{if(encoder.encode(secret??"").byteLength<32)throw new ApiError(503,"UPLOAD_CONFIGURATION_UNAVAILABLE","Upload protection is unavailable");}
function parseUploadInput(value:unknown):ReturnType<typeof uploadInitializeSchema.parse>{const parsed=uploadInitializeSchema.safeParse(value);if(parsed.success)return parsed.data;const fields:Record<string,string>={};for(const issue of parsed.error.issues)fields[String(issue.path[0]??"body")]=issue.message;throw new ApiError(422,"VALIDATION_FAILED","Please check the upload information",fields);}
function assertUploadAccess(context:RequestContext,entityType:string,tenantKey:string,action:"read"|"write"):void{const resource=resourceForUploadEntity(entityType);if(!resource)throw new ApiError(400,"INVALID_ENTITY_TYPE","Uploads are not supported for this entity type");const internal=["owner","admin","agent","finance","content"].includes(context.actor.role);const allowed=internal?canAccessResource(context.actor.role,resource,action==="read"?"read":"update"):action==="read"?canAccessResource(context.actor.role,resource):["trip_request","booking","support_ticket"].includes(entityType)&&canAccessResource(context.actor.role,resource);if(!allowed)throw new ApiError(403,"ROLE_DENIED","You do not have permission for this file");if(!internal&&tenantKey!==context.tenantKey)throw new ApiError(403,"TENANT_DENIED","The requested tenant is outside your account");if(internal&&tenantKey!==context.tenantKey&&!canOverrideTenant(context.actor.role))throw new ApiError(403,"TENANT_DENIED","Tenant overrides are limited to travel-management roles");}
