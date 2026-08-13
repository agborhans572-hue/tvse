import { headers } from "next/headers";
import { getD1 } from "../db";
import { createId } from "./ids";
import { HttpError } from "./http";
import { operationsServiceKey, publicBaseUrl, runtimeEnv } from "./runtime";
import { createServiceHeaders, sha256Hex } from "./service-auth";

export async function enforcePublicRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyHashes = await Promise.all([
    sha256Hex(`${scope}:ip:${ip}`),
    sha256Hex(`${scope}:identity:${identity.trim().toLowerCase()}`),
  ]);
  if (runtimeEnv.OPERATIONS_API_URL) {
    for (const keyHash of keyHashes) {
      let response: Response;
      try {
        const url = `${runtimeEnv.OPERATIONS_API_URL.replace(/\/$/u, "")}/v2/public/rate-limit`;
        const body = JSON.stringify({ scope, keyHash });
        const serviceHeaders = await createServiceHeaders("POST", url, body, operationsServiceKey());
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: new URL(publicBaseUrl()).origin, ...serviceHeaders },
          body,
          cache: "no-store",
        });
      } catch {
        throw new HttpError("Request protection is temporarily unavailable. Please try again.", 503);
      }
      if (response.status === 429) throw new HttpError("Too many requests. Please wait and try again.", 429, { "Retry-After": response.headers.get("Retry-After") ?? "60" });
      if (!response.ok) throw new HttpError("Request protection is temporarily unavailable. Please try again.", 503);
    }
    return;
  }
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  for (const keyHash of keyHashes) {
    const row = await getD1().prepare(`
      INSERT INTO rate_limits (id, scope, key_hash, bucket_start, count, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(scope, key_hash, bucket_start)
      DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
      RETURNING count
    `).bind(createId("rl"), scope, keyHash, bucketStart, now).first<{ count: number }>();
    if ((row?.count ?? limit + 1) > limit) throw new HttpError("Too many requests. Please wait and try again.", 429, { "Retry-After": String(Math.max(1, Math.ceil((bucketStart + windowMs - now) / 1000))) });
  }
}

export async function verifyTurnstile(token: string | undefined, expectedAction: "magic-link" | "contact" | "trip-request") {
  const requestHeaders = await headers();
  const requestHost = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "").split(":")[0];
  const { insecureLocalDevelopmentAllowed } = await import("./runtime");
  if (!runtimeEnv.TURNSTILE_SECRET_KEY) {
    if (insecureLocalDevelopmentAllowed(requestHost)) return;
    throw new HttpError("Bot protection is temporarily unavailable.", 503);
  }
  if (!token) throw new HttpError("Bot verification is required.", 400);
  const form = new FormData();
  form.set("secret", runtimeEnv.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) form.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
    .then((response) => response.json() as Promise<{ success?: boolean; hostname?: string; action?: string }>)
    .catch(() => null);
  const expectedHostname = runtimeEnv.TURNSTILE_EXPECTED_HOSTNAME?.trim() || new URL(publicBaseUrl()).hostname;
  if (!result?.success || result.hostname !== expectedHostname || result.action !== expectedAction) throw new HttpError("Bot verification failed. Please try again.", 400);
}
