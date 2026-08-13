import type { Env, RequestContext } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly headers?: HeadersInit,
  ) { super(message); }
}

export function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean));
}

export function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key, X-TVSE-Consistency, X-Upload-Token, X-TVSE-Service-Key, X-TVSE-Service-Timestamp, X-TVSE-Service-Content-SHA256, X-TVSE-Service-Signature",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins(env).has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function assertAllowedOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).has(origin)) throw new ApiError(403, "ORIGIN_DENIED", "The request origin is not allowed");
}

export function jsonResponse(request: Request, env: Env, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if(!headers.has("Cache-Control"))headers.set("Cache-Control","private, no-store");
  headers.set("X-Content-Type-Options","nosniff");
  for (const [key, value] of corsHeaders(request, env)) headers.set(key, value);
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function success(
  request: Request,
  env: Env,
  context: Pick<RequestContext, "requestId">,
  data: unknown,
  options: { status?: number; jobs?: unknown[]; consistencyToken?: string | null; headers?: HeadersInit } = {},
): Response {
  return jsonResponse(request, env, {
    data,
    ...(options.jobs ? { jobs: options.jobs } : {}),
    consistencyToken: options.consistencyToken ?? null,
    requestId: context.requestId,
  }, { status: options.status ?? 200, headers: options.headers });
}

export function failure(request: Request, env: Env, error: unknown, requestId: string): Response {
  const apiError = error instanceof ApiError ? error : new ApiError(500, "INTERNAL_ERROR", "The operation could not be completed");
  const headers = new Headers(apiError.headers);
  if (apiError.status === 429 && !headers.has("Retry-After")) headers.set("Retry-After", "60");
  return jsonResponse(request, env, { error: { code: apiError.code, message: apiError.message, ...(apiError.fields ? { fields: apiError.fields } : {}), requestId } }, { status: apiError.status, headers });
}

export async function readJson<T>(request: Request, maxBytes = 64_000): Promise<T> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) throw new ApiError(415, "CONTENT_TYPE_REQUIRED", "The request body must use application/json");
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new ApiError(413, "PAYLOAD_TOO_LARGE", "The request body is too large"); }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new ApiError(400, "INVALID_JSON", "The request body must be valid JSON"); }
  return value as T;
}

export function pageSize(url: URL): number {
  const requested = Number(url.searchParams.get("limit") ?? 25);
  return Number.isFinite(requested) ? Math.max(1, Math.min(50, Math.floor(requested))) : 25;
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("Idempotency-Key")?.trim();
  if (!key || key.length < 8 || key.length > 200) throw new ApiError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required");
  return key;
}

export function logEvent(event: Record<string, unknown>): void {
  console.log(JSON.stringify({ service: "tvse-operations", timestamp: new Date().toISOString(), d1RowsRead:null,d1RowsWritten:null,replicaRegion:null,queueLagMs:null,retryCount:null,jobOutcome:null,...event }));
}
