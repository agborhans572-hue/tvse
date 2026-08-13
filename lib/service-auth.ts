export const serviceAuthHeaders = {
  keyId: "X-TVSE-Service-Key",
  timestamp: "X-TVSE-Service-Timestamp",
  bodyHash: "X-TVSE-Service-Content-SHA256",
  signature: "X-TVSE-Service-Signature",
} as const;

export type ServiceSigningKey = { id: string; secret: string };

const encoder = new TextEncoder();

export async function sha256Hex(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  const data = typeof value === "string"
    ? encoder.encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(data).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalRequest(method: string, url: string | URL, timestamp: string, bodyHash: string): string {
  const parsed = typeof url === "string" ? new URL(url) : url;
  return [method.toUpperCase(), `${parsed.pathname}${parsed.search}`, timestamp, bodyHash].join("\n");
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validKey(key: ServiceSigningKey | undefined): key is ServiceSigningKey {
  return !!key && /^[A-Za-z0-9._-]{1,64}$/u.test(key.id) && encoder.encode(key.secret).byteLength >= 32;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

export async function createServiceHeaders(
  method: string,
  url: string | URL,
  body: string | ArrayBuffer | Uint8Array,
  key: ServiceSigningKey,
  now = Date.now(),
): Promise<Record<string, string>> {
  if (!validKey(key)) throw new Error("Operations service signing requires a valid key ID and a secret of at least 32 bytes");
  const timestamp = Math.floor(now / 1000).toString();
  const bodyHash = await sha256Hex(body);
  const signature = await hmacHex(key.secret, canonicalRequest(method, url, timestamp, bodyHash));
  return {
    [serviceAuthHeaders.keyId]: key.id,
    [serviceAuthHeaders.timestamp]: timestamp,
    [serviceAuthHeaders.bodyHash]: bodyHash,
    [serviceAuthHeaders.signature]: signature,
  };
}

export type ServiceVerificationFailure = "missing" | "configuration" | "stale" | "body_hash" | "signature";

export async function verifyServiceRequest(
  request: Request,
  keys: readonly (ServiceSigningKey | undefined)[],
  options: { now?: number; maxAgeSeconds?: number; maxBodyBytes?: number } = {},
): Promise<{ ok: true; keyId: string } | { ok: false; reason: ServiceVerificationFailure }> {
  const usableKeys = keys.filter(validKey);
  if (usableKeys.length === 0) return { ok: false, reason: "configuration" };
  const keyId = request.headers.get(serviceAuthHeaders.keyId) ?? "";
  const timestamp = request.headers.get(serviceAuthHeaders.timestamp) ?? "";
  const suppliedBodyHash = request.headers.get(serviceAuthHeaders.bodyHash) ?? "";
  const suppliedSignature = request.headers.get(serviceAuthHeaders.signature) ?? "";
  if (!keyId || !timestamp || !/^[a-f0-9]{64}$/u.test(suppliedBodyHash) || !/^[a-f0-9]{64}$/u.test(suppliedSignature)) {
    return { ok: false, reason: "missing" };
  }
  const parsedTimestamp = Number(timestamp);
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(parsedTimestamp) || Math.abs(nowSeconds - parsedTimestamp) > (options.maxAgeSeconds ?? 300)) {
    return { ok: false, reason: "stale" };
  }
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) return { ok: false, reason: "body_hash" };
  const body = new Uint8Array(await request.clone().arrayBuffer());
  if (body.byteLength > maxBodyBytes) return { ok: false, reason: "body_hash" };
  const actualBodyHash = await sha256Hex(body);
  if (!constantTimeEqual(actualBodyHash, suppliedBodyHash)) return { ok: false, reason: "body_hash" };
  const selected = usableKeys.find((key) => constantTimeEqual(key.id, keyId));
  if (!selected) {
    // Keep the expensive comparison path for unknown IDs to reduce key probing signals.
    await hmacHex(usableKeys[0].secret, canonicalRequest(request.method, request.url, timestamp, suppliedBodyHash));
    return { ok: false, reason: "signature" };
  }
  const expected = await hmacHex(selected.secret, canonicalRequest(request.method, request.url, timestamp, suppliedBodyHash));
  return constantTimeEqual(expected, suppliedSignature) ? { ok: true, keyId: selected.id } : { ok: false, reason: "signature" };
}
