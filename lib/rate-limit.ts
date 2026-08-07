import { headers } from "next/headers";
import { getD1 } from "../db";
import { createId, sha256 } from "./ids";
import { HttpError } from "./http";

export async function enforcePublicRateLimit(scope: string, identity: string, limit: number, windowMs: number) {
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyHash = await sha256(`${scope}:${identity.trim().toLowerCase()}:${ip}`);
  const now = Date.now();
  const bucketStart = Math.floor(now / windowMs) * windowMs;
  const row = await getD1().prepare(`
    INSERT INTO rate_limits (id, scope, key_hash, bucket_start, count, updated_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(scope, key_hash, bucket_start)
    DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    RETURNING count
  `).bind(createId("rl"), scope, keyHash, bucketStart, now).first<{ count: number }>();
  if ((row?.count ?? limit + 1) > limit) throw new HttpError("Too many requests. Please wait and try again.", 429);
}
