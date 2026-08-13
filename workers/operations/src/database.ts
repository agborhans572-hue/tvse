import { ApiError } from "./http";
import type { Env, ListCursor, ShardNumber, TenantRoute } from "./types";

const encoder = new TextEncoder();

export function shardDatabase(env: Env, shard: ShardNumber): D1Database {
  return [env.OPS_0, env.OPS_1, env.OPS_2, env.OPS_3][shard];
}

export function readSession(database: D1Database, request: Request,shard?:ShardNumber): D1DatabaseSession {
  const token = request.headers.get("X-TVSE-Consistency");
  if (!token) return database.withSession("first-unconstrained");
  try {
    const decoded = JSON.parse(decodeBase64Url(token)) as { bookmark?: string;bookmarks?:Partial<Record<ShardNumber,string>> };
    return database.withSession((shard===undefined?decoded.bookmark:decoded.bookmarks?.[shard]) || "first-unconstrained");
  } catch {
    throw new ApiError(400, "INVALID_CONSISTENCY_TOKEN", "The consistency token is invalid");
  }
}

export function multiConsistencyToken(sessions:Partial<Record<ShardNumber,D1DatabaseSession>>):string|null{const bookmarks:Partial<Record<ShardNumber,string>>={};for(const shard of [0,1,2,3] as ShardNumber[]){const bookmark=sessions[shard]?.getBookmark();if(bookmark)bookmarks[shard]=bookmark;}return Object.keys(bookmarks).length?encodeBase64Url(JSON.stringify({version:1,bookmarks})):null;}

export function consistencyToken(session: D1DatabaseSession | null): string | null {
  const bookmark = session?.getBookmark();
  return bookmark ? encodeBase64Url(JSON.stringify({ version: 1, bookmark })) : null;
}

export async function primaryConsistencyToken(database:D1Database,shard?:ShardNumber):Promise<string|null>{const session=database.withSession("first-primary");await session.prepare("SELECT 1 AS committed").first();const bookmark=session.getBookmark();if(!bookmark)return null;return shard===undefined?encodeBase64Url(JSON.stringify({version:1,bookmark})):encodeBase64Url(JSON.stringify({version:1,bookmarks:{[shard]:bookmark}}));}

export async function resolveTenantRoute(env: Env, tenantKey: string, create: { type: "organization" | "user" | "anonymous"; organizationId?: string | null; userId?: string | null } | null): Promise<TenantRoute> {
  const cacheKey = `route:${tenantKey}`;
  const cached = await env.ROUTING_CACHE.get<TenantRoute>(cacheKey, "json");
  if (cached) return cached;

  let route = await env.CORE_DB.prepare("SELECT tenant_key, shard, read_mode, mirror_writes FROM tenant_routes WHERE tenant_key = ? LIMIT 1").bind(tenantKey).first<TenantRoute>();
  if (!route && create) {
    const shard = await initialShardForTenant(tenantKey);
    const now = Date.now();
    await env.CORE_DB.prepare(`INSERT OR IGNORE INTO tenant_routes
      (id, tenant_key, tenant_type, organization_id, user_id, shard, read_mode, mirror_writes, assigned_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'core', 1, ?, ?)`).bind(crypto.randomUUID(), tenantKey, create.type, create.organizationId ?? null, create.userId ?? null, shard, now, now).run();
    route = await env.CORE_DB.prepare("SELECT tenant_key, shard, read_mode, mirror_writes FROM tenant_routes WHERE tenant_key = ? LIMIT 1").bind(tenantKey).first<TenantRoute>();
  }
  if (!route) throw new ApiError(404, "TENANT_ROUTE_NOT_FOUND", "No operational route exists for this tenant");
  if (![0, 1, 2, 3].includes(route.shard)) throw new ApiError(503, "INVALID_TENANT_ROUTE", "The tenant route is unavailable");
  await env.ROUTING_CACHE.put(cacheKey, JSON.stringify(route), { expirationTtl: 300 });
  return route;
}

export async function initialShardForTenant(tenantKey:string):Promise<ShardNumber>{
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(tenantKey)));
  return ((((digest[0]??0)<<8)|(digest[1]??0))%4) as ShardNumber;
}

export async function tenantKeyForActor(actor: { sub: string; organizationId: string | null }): Promise<string> {
  return actor.organizationId ? `org:${actor.organizationId}` : `user:${actor.sub}`;
}

export async function anonymousTenantKey(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(normalized));
  return `anonymous:${toHex(new Uint8Array(digest))}`;
}

export async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

export async function signCursor(cursor: ListCursor, secret: string): Promise<string> {
  assertCursorSecret(secret);
  const body = encodeBase64Url(JSON.stringify(cursor));
  return `${body}.${await hmac(body, secret)}`;
}

export async function parseCursor(value: string | null, secret: string): Promise<ListCursor | null> {
  assertCursorSecret(secret);
  if (!value) return null;
  const [body, supplied, extra] = value.split(".");
  if (!body || !supplied || extra || !(await constantTimeEqual(supplied, await hmac(body, secret)))) throw new ApiError(400, "INVALID_CURSOR", "The pagination cursor is invalid");
  try {
    const cursor = JSON.parse(decodeBase64Url(body)) as ListCursor;
    if (cursor.version !== 1 || !Number.isFinite(cursor.createdAt) || !cursor.id) throw new Error();
    return cursor;
  } catch { throw new ApiError(400, "INVALID_CURSOR", "The pagination cursor is invalid"); }
}

function encodeBase64Url(value: string): string {
  let binary = "";
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)));
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return different === 0;
}

function toHex(bytes: Uint8Array): string { return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function assertCursorSecret(secret:string):void{if(encoder.encode(secret??"").byteLength<32)throw new ApiError(503,"CURSOR_CONFIGURATION_UNAVAILABLE","Pagination is temporarily unavailable");}
