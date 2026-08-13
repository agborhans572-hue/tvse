import { ApiError } from "./http";

type Bucket = { tokens: number; updatedAt: number };

export class RateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const input = await readInternalJson<{ capacity?: number; refillPerSecond?: number; cost?: number }>(request);
    if([input.capacity,input.refillPerSecond,input.cost].some((value)=>value!==undefined&&!Number.isFinite(value)))throw new ApiError(400,"INVALID_RATE_LIMIT_REQUEST","Rate-limit values must be finite numbers");
    const capacity = Math.max(1, Math.min(1_000, input.capacity ?? 30));
    const refillPerSecond = Math.max(1 / 86_400, Math.min(1_000, input.refillPerSecond ?? 0.5));
    const cost = Math.max(1, input.cost ?? 1);
    const now = Date.now();
    const { allowed, remaining } = await this.state.storage.transaction(async (transaction) => {
      const current = (await transaction.get<Bucket>("bucket")) ?? { tokens: capacity, updatedAt: now };
      const available = Math.min(capacity, current.tokens + ((now - current.updatedAt) / 1_000) * refillPerSecond);
      const allowed = available >= cost;
      const remaining = allowed ? available - cost : available;
      await transaction.put("bucket", { tokens: remaining, updatedAt: now });
      return { allowed, remaining };
    });
    const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((cost - remaining) / refillPerSecond));
    return Response.json({ allowed, remaining: Math.floor(remaining), retryAfter });
  }
}

export class DocumentNumberAllocator {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const input = await readInternalJson<{ action: "initialize" | "next"; maximum?: number; prefix?: string; year?: number }>(request);
    if (input.action === "initialize") {
      const existing = await this.state.storage.get<number>("value");
      const value = Math.max(existing ?? 0, input.maximum ?? 0);
      await this.state.storage.put("value", value);
      return Response.json({ value });
    }
    if (input.action !== "next" || !input.prefix) throw new ApiError(400, "INVALID_ALLOCATOR_REQUEST", "A document prefix is required");
    const value = await this.state.storage.transaction(async (transaction) => {
      const next = ((await transaction.get<number>("value")) ?? 0) + 1;
      await transaction.put("value", next);
      return next;
    });
    const year = input.year ?? new Date().getUTCFullYear();
    return Response.json({ value, number: `${input.prefix}-${year}-${String(value).padStart(5, "0")}` });
  }
}

export async function consumeRateLimit(namespace: DurableObjectNamespace, key: string, options: { capacity: number; refillPerSecond: number; cost?: number }): Promise<void> {
  const id = namespace.idFromName(key);
  const response = await namespace.get(id).fetch("https://rate-limit.internal/consume", { method: "POST", body: JSON.stringify(options) });
  const result = await response.json<{ allowed: boolean; retryAfter: number }>();
  if (!result.allowed) throw new ApiError(429, "RATE_LIMITED", `Too many requests. Retry in ${result.retryAfter} seconds.`);
}

export async function allocateDocumentNumber(namespace: DurableObjectNamespace, kind: string, prefix: string): Promise<string> {
  const response = await namespace.get(namespace.idFromName(kind)).fetch("https://numbers.internal/next", {
    method: "POST",
    body: JSON.stringify({ action: "next", prefix }),
  });
  if (!response.ok) throw new ApiError(503, "NUMBER_ALLOCATION_FAILED", "A reference number could not be allocated");
  return (await response.json<{ number: string }>()).number;
}

async function readInternalJson<T>(request:Request):Promise<T>{const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.byteLength>2_048)throw new ApiError(413,"PAYLOAD_TOO_LARGE","The internal request is too large");try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)) as T;}catch{throw new ApiError(400,"INVALID_JSON","The internal request must be valid JSON");}}
