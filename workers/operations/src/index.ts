import { authenticate } from "./auth";
import { verifyServiceRequest } from "../../../lib/service-auth";
import { hashValue, resolveTenantRoute, shardDatabase, tenantKeyForActor } from "./database";
import { consumeRateLimit, DocumentNumberAllocator, RateLimiter } from "./durable-objects";
import { ApiError, assertAllowedOrigin, corsHeaders, failure, jsonResponse, logEvent, readJson, success } from "./http";
import { consumeJobs } from "./jobs";
import { handleCoreList, handleList, handleOverview, handleReports } from "./lists";
import { runScheduledMaintenance } from "./maintenance";
import { handleBackfill, handleShadowComparison, initializeDocumentNumbers, updateTenantRoutes } from "./migration";
import { actorMayUseTenant, createAnonymousLead, createAnonymousTripRequest, createMessage, createTripRequest, recordPayment, sendQuote } from "./mutations";
import { completeUpload, downloadFile, initializeDownload, initializeUpload, streamUpload } from "./uploads";
import type { Env, JobMessage, RequestContext } from "./types";

export { DocumentNumberAllocator, RateLimiter };

const worker: ExportedHandler<Env, JobMessage> = {
  async fetch(request, env, execution): Promise<Response> {
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID(); const startedAt = Date.now();
    let tenant: string | null = null; let shard: number | null = null; let response: Response;
    try {
      response = await route(request, env, execution, requestId, startedAt, (value) => { tenant = value.tenantKey; shard = value.shard; });
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(error);
      response = failure(request, env, error, requestId);
    }
    logEvent({ requestId, route: new URL(request.url).pathname, method: request.method, tenant, shard, status: response.status, durationMs: Date.now() - startedAt,replicaRegion:(request.cf as {colo?:string}|undefined)?.colo??null,d1RowsRead:numberHeader(response,"X-TVSE-D1-Rows-Read"),d1RowsWritten:numberHeader(response,"X-TVSE-D1-Rows-Written") });
    response.headers.set("X-Request-Id", requestId);
    return response;
  },
  queue(batch, env) { return consumeJobs(batch, env); },
  scheduled(event, env, execution) { execution.waitUntil(runScheduledMaintenance(event, env)); },
};

async function route(request: Request, env: Env, execution: ExecutionContext, requestId: string, startedAt: number, onContext: (context: RequestContext) => void): Promise<Response> {
  const url = new URL(request.url); const path = url.pathname.replace(/\/+$/u, "") || "/";
  if (request.method === "OPTIONS") { assertAllowedOrigin(request, env); return new Response(null, { status: 204, headers: corsHeaders(request, env) }); }
  if (request.method === "GET" && path === "/health/live") return Response.json({ status: "ok", service: "tvse-operations", requestId });
  if (request.method === "GET" && path === "/health/ready") return readiness(env, requestId);
  if (request.method === "GET" && path.match(/^\/v2\/files\/[^/]+$/u)) return downloadFile(request, env, path.split("/").at(-1)!);
  if (path.startsWith("/internal/migrations/")) {
    const context = systemContext(requestId, startedAt); onContext(context);
    if (request.method === "POST" && path === "/internal/migrations/backfill") return handleBackfill(request, env, context);
    if (request.method === "GET" && path === "/internal/migrations/shadow") return handleShadowComparison(request, env, context);
    if (request.method === "POST" && path === "/internal/migrations/initialize-numbers") return initializeDocumentNumbers(request,env,context);
    if (request.method === "POST" && path === "/internal/migrations/routes") return updateTenantRoutes(request,env,context);
  }
  if (request.method === "POST" && path === "/v2/public/trip-requests") {
    await requireServiceAuthentication(request, env); assertAllowedOrigin(request, env);
    const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const body = await readJson<{ contactEmail?: string; turnstileToken?: string }>(request.clone() as unknown as Request);
    const identityHash = await hashValue(String(body.contactEmail ?? "").trim().toLowerCase());
    await consumeRateLimit(env.RATE_LIMITER, `public:trip:${address}`, { capacity: 10, refillPerSecond: 1 / 60 });
    await consumeRateLimit(env.RATE_LIMITER, `public:trip:identity:${identityHash}`, { capacity: 5, refillPerSecond: 5 / 3_600 });
    await verifyTurnstile(body.turnstileToken, "trip-request", env, address);
    return createAnonymousTripRequest(request, env, execution, requestId);
  }
  if (request.method === "POST" && path === "/v2/public/contact") {
    await requireServiceAuthentication(request,env);assertAllowedOrigin(request,env);const address=request.headers.get("CF-Connecting-IP")??"unknown";
    const body=await readJson<{email?:string;turnstileToken?:string}>(request.clone() as unknown as Request);const identityHash=await hashValue(String(body.email??"").trim().toLowerCase());
    await consumeRateLimit(env.RATE_LIMITER,`public:contact:${address}`,{capacity:10,refillPerSecond:1/60});
    await consumeRateLimit(env.RATE_LIMITER,`public:contact:identity:${identityHash}`,{capacity:5,refillPerSecond:5/3_600});
    await verifyTurnstile(body.turnstileToken,"contact",env,address);
    return createAnonymousLead(request,env,execution,requestId);
  }
  if (request.method === "POST" && path === "/v2/public/rate-limit") {
    await requireServiceAuthentication(request, env); assertAllowedOrigin(request, env);
    const body = await readJson<{ scope?: string; keyHash?: string }>(request);
    const scope = String(body.scope ?? ""); const keyHash = String(body.keyHash ?? "");
    const limits: Record<string, { capacity: number; refillPerSecond: number }> = {
      contact: { capacity: 5, refillPerSecond: 5 / 3600 },
      "trip-request": { capacity: 5, refillPerSecond: 5 / 3600 },
      "magic-link": { capacity: 5, refillPerSecond: 5 / 900 },
      upload: { capacity: 20, refillPerSecond: 20 / 3600 },
    };
    if (!limits[scope] || !/^[a-f0-9]{64}$/u.test(keyHash)) throw new ApiError(400, "RATE_LIMIT_KEY_INVALID", "The rate-limit key is invalid");
    await consumeRateLimit(env.RATE_LIMITER, `edge:${scope}:${keyHash}`, limits[scope]);
    return jsonResponse(request, env, { data: { allowed: true }, requestId });
  }
  if (request.method === "GET" && path === "/v2/public/catalog") { await requireServiceAuthentication(request, env); assertAllowedOrigin(request, env); return publicCatalog(request, env, requestId,execution); }

  if (!path.startsWith("/v2/")) throw new ApiError(404, "ROUTE_NOT_FOUND", "The endpoint does not exist");
  if(request.method==="GET"&&env.V2_FORCE_CORE_READS==="true"&&["/v2/overview","/v2/reports",...Object.keys({requests:1,quotes:1,bookings:1,invoices:1,support:1,notifications:1,audit:1,leads:1,approvals:1,assignments:1}).map((resource)=>`/v2/${resource}`)].includes(path))throw new ApiError(409,"CORE_FALLBACK","Operational reads are temporarily routed to the core service");
  const mutation = request.method !== "GET";
  const actor = await authenticate(request, env);
  const tenantKey = await tenantKeyForActor(actor);
  const tenantRoute = await resolveTenantRoute(env, tenantKey, { type: actor.organizationId ? "organization" : "user", organizationId: actor.organizationId, userId: actor.sub });
  const context: RequestContext = { requestId, startedAt, actor, tenantKey, shard: tenantRoute.shard }; onContext(context);
  await consumeRateLimit(env.RATE_LIMITER, `identity:${actor.sub}`, { capacity: mutation ? 40 : 180, refillPerSecond: mutation ? 4 : 30 });

  if (request.method === "GET" && path === "/v2/overview") return handleOverview(request, env, context);
  if (request.method === "GET" && path === "/v2/reports") return handleReports(request, env, context);
  const resource = path.slice(4);
  if (request.method === "GET" && ["requests","quotes","bookings","invoices","support","notifications","audit","leads","approvals","assignments"].includes(resource)) return handleList(request, env, context, resource);
  if (request.method === "GET" && ["users","organizations","suppliers","content"].includes(resource)) return handleCoreList(request, env, context, resource);
  if (request.method === "POST" && (path === "/v2/requests" || path === "/v2/trip-requests")) return createTripRequest(request, env, context, execution);
  const quoteSend = path.match(/^\/v2\/quotes\/([^/]+)\/send$/u); if (request.method === "POST" && quoteSend) return sendQuote(request, env, context, execution, quoteSend[1]);
  const messages = path.match(/^\/v2\/support\/([^/]+)\/messages$/u); if (request.method === "POST" && messages) return createMessage(request, env, context, execution, messages[1]);
  const payments = path.match(/^\/v2\/invoices\/([^/]+)\/payments$/u); if (request.method === "POST" && payments) return recordPayment(request, env, context, execution, payments[1]);
  if (request.method === "POST" && path === "/v2/uploads") { const uploadLimit={ capacity:20,refillPerSecond:20/3600 };await Promise.all([consumeRateLimit(env.RATE_LIMITER,`upload:identity:${context.actor.sub}`,uploadLimit),consumeRateLimit(env.RATE_LIMITER,`upload:ip:${request.headers.get("CF-Connecting-IP")??"unknown"}`,uploadLimit)]);return initializeUpload(request, env, context); }
  const uploadBody = path.match(/^\/v2\/uploads\/([^/]+)\/body$/u); if (request.method === "PUT" && uploadBody) return streamUpload(request, env, context, uploadBody[1]);
  const uploadComplete = path.match(/^\/v2\/uploads\/([^/]+)\/complete$/u); if (request.method === "POST" && uploadComplete) return completeUpload(request, env, context, uploadComplete[1]);
  const download = path.match(/^\/v2\/uploads\/([^/]+)\/download$/u); if (request.method === "GET" && download) return initializeDownload(request, env, context, download[1]);
  const job = path.match(/^\/v2\/jobs\/([^/]+)$/u); if (request.method === "GET" && job) return jobStatus(request, env, context, job[1]);
  throw new ApiError(404, "ROUTE_NOT_FOUND", "The endpoint does not exist");
}

async function jobStatus(request: Request, env: Env, context: RequestContext, jobId: string): Promise<Response> {
  const url = new URL(request.url); const tenantKey = url.searchParams.get("tenant") ?? context.tenantKey;
  if(!actorMayUseTenant(context.actor.role,context.tenantKey,tenantKey))throw new ApiError(403,"TENANT_DENIED","The requested tenant is outside your account");
  const route = await resolveTenantRoute(env, tenantKey, null);
  const job = await shardDatabase(env, route.shard).prepare("SELECT id, type, state, attempts, available_at, last_error, result_json, created_at, updated_at, completed_at FROM async_jobs WHERE id = ? AND tenant_key = ? LIMIT 1").bind(jobId, tenantKey).first<Record<string, unknown>>();
  if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "The asynchronous job was not found");
  return success(request, env, context, job);
}

async function readiness(env: Env, requestId: string): Promise<Response> {
  const checks = await Promise.allSettled([env.CORE_DB, env.OPS_0, env.OPS_1, env.OPS_2, env.OPS_3].map((database) => database.prepare("SELECT 1 AS ok").first()));
  const storage=await Promise.allSettled([env.ROUTING_CACHE.get("health:probe"),env.UPLOADS.head("health/probe")]);
  const secrets={token:env.TOKEN_CURRENT_SECRET?.length>=32,service:env.OPERATIONS_SERVICE_SECRET?.length>=32,cursor:env.CURSOR_SECRET?.length>=32,upload:env.UPLOAD_TOKEN_SECRET?.length>=32,migration:(env.MIGRATION_ADMIN_TOKEN?.length??0)>=32,turnstile:Boolean(env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_EXPECTED_HOSTNAME),origins:Boolean(env.ALLOWED_ORIGINS)};
  const bindings={queue:Boolean(env.JOBS&&env.JOBS_DLQ),rateLimiter:Boolean(env.RATE_LIMITER),numberAllocator:Boolean(env.DOCUMENT_NUMBERS)};
  const ready = checks.every((check) => check.status === "fulfilled")&&storage.every((check)=>check.status==="fulfilled")&&Object.values(secrets).every(Boolean)&&Object.values(bindings).every(Boolean);
  if (!ready) logEvent({ event: "readiness_failed", requestId, databases: checks.map((check) => check.status), storage: storage.map((check) => check.status), secrets, bindings });
  return Response.json({ status: ready ? "ready" : "unavailable", service: "tvse-operations", requestId }, { status: ready ? 200 : 503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"} });
}

async function publicCatalog(request: Request, env: Env, requestId: string,execution:ExecutionContext): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;const keyedUrl=new URL(request.url);keyedUrl.searchParams.set("_origin",request.headers.get("Origin")??"");const cacheKey = new Request(keyedUrl, { method: "GET" }); const cached = await cache.match(cacheKey); if (cached) {const payload=await cached.json<Record<string,unknown>>();return jsonResponse(request,env,{...payload,requestId},{headers:{"Cache-Control":cached.headers.get("Cache-Control")??"public, max-age=60, stale-while-revalidate=300","X-TVSE-Cache":"HIT"}});}
  let destinations:D1Result;let packages:D1Result;try{[destinations, packages] = await env.CORE_DB.batch([
    env.CORE_DB.prepare("SELECT id, slug, name, country, region, summary, image_path AS hero_image_url, status, featured AS sort_order FROM destinations WHERE status = 'published' ORDER BY featured DESC, name LIMIT 50"),
    env.CORE_DB.prepare("SELECT id, slug, title, summary, duration_days, from_price_minor, currency, image_path AS hero_image_url, featured, status FROM packages WHERE status = 'published' ORDER BY featured DESC, title LIMIT 50"),
  ]);}catch{throw new ApiError(503,"CATALOG_UNAVAILABLE","The travel catalog is temporarily unavailable");}
  const response = jsonResponse(request,env,{ data: { destinations: destinations.results, packages: packages.results }, consistencyToken: null, requestId }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300","X-TVSE-Cache":"MISS" } });
  execution.waitUntil(cache.put(cacheKey,response.clone()));return response;
}

async function verifyTurnstile(tokenValue: string | undefined, expectedAction: "contact" | "trip-request", env: Env, remoteip: string): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME) {
    const localHosts=[...new Set(env.ALLOWED_ORIGINS.split(",").map((origin) => { try { return new URL(origin.trim()).hostname; } catch { return ""; } }).filter(Boolean))];
    if (env.ALLOW_INSECURE_LOCAL_DEV === "true" && localHosts.length>0 && localHosts.every(isLoopback)) return;
    throw new ApiError(503, "TURNSTILE_CONFIGURATION_UNAVAILABLE", "Bot protection is temporarily unavailable");
  }
  const token = String(tokenValue ?? "");
  if (!token) throw new ApiError(400, "TURNSTILE_REQUIRED", "Bot verification is required");
  const form = new FormData(); form.set("secret", env.TURNSTILE_SECRET_KEY); form.set("response", token); form.set("remoteip", remoteip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form }).then((response) => response.json<{ success: boolean; hostname?: string; action?: string }>());
  if (!result.success || result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME || result.action !== expectedAction) throw new ApiError(400, "TURNSTILE_FAILED", "Bot verification failed");
}

async function requireServiceAuthentication(request: Request, env: Env): Promise<void> {
  if(!/^[A-Za-z0-9._-]{1,64}$/u.test(env.OPERATIONS_SERVICE_KID??"")||new TextEncoder().encode(env.OPERATIONS_SERVICE_SECRET??"").byteLength<32)throw new ApiError(503,"SERVICE_AUTH_UNAVAILABLE","Service authentication is unavailable");
  const result = await verifyServiceRequest(request, [
    { id: env.OPERATIONS_SERVICE_KID, secret: env.OPERATIONS_SERVICE_SECRET },
    env.OPERATIONS_SERVICE_PREVIOUS_KID && env.OPERATIONS_SERVICE_PREVIOUS_SECRET ? { id: env.OPERATIONS_SERVICE_PREVIOUS_KID, secret: env.OPERATIONS_SERVICE_PREVIOUS_SECRET } : undefined,
  ], { maxAgeSeconds: 300, maxBodyBytes: 100_000 });
  if (!result.ok) throw result.reason === "configuration"
    ? new ApiError(503, "SERVICE_AUTH_UNAVAILABLE", "Service authentication is unavailable")
    : new ApiError(401, "SERVICE_AUTH_INVALID", "The service request is unsigned, stale, or invalid");
}

function isLoopback(hostname: string): boolean { const value=hostname.replace(/^\[|\]$/gu,"").toLowerCase();return value==="localhost"||value==="127.0.0.1"||value==="::1"; }

function systemContext(requestId: string, startedAt: number): RequestContext {
  return { requestId, startedAt, tenantKey: "system:migration", shard: 0, actor: { sub: "system:migration", email: "", role: "owner", organizationId: null, source: "platform", authVersion: 1, iss: "tvse-sites", aud: "tvse-operations", iat: 0, exp: 0, jti: requestId, kid: "internal" } };
}

function numberHeader(response:Response,name:string):number|null{const value=response.headers.get(name);return value===null||!Number.isFinite(Number(value))?null:Number(value);}

export default worker;
