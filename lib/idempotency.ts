import { getD1 } from "../db";
import type { Actor } from "./travel";
import { createId, sha256 } from "./ids";
import { HttpError } from "./http";

const TTL_MS = 24 * 60 * 60 * 1000;

async function runWithPrincipal<T>(scope: string, key: string | null, principal: string, work: () => Promise<T>): Promise<T> {
  if (!key) return work();
  const db = getD1();
  const now = Date.now();
  const keyHash = await sha256(`${principal}:${scope}:${key}`);
  const id = createId("idem");
  const claimed = await db.prepare(`INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`)
    .bind(id, principal, scope, keyHash, now + TTL_MS, now, now).run();

  if ((claimed.meta?.changes ?? 0) !== 1) {
    const existing = await db.prepare("SELECT status, response_json, updated_at FROM idempotency_records WHERE actor_id=? AND scope=? AND key_hash=?")
      .bind(principal, scope, keyHash).first<{ status: string; response_json: string | null; updated_at: number }>();
    if (existing?.status === "completed" && existing.response_json) return JSON.parse(existing.response_json) as T;
    if (existing && now - existing.updated_at < 60_000) throw new HttpError("This request is already being processed", 409);
    await db.prepare("DELETE FROM idempotency_records WHERE actor_id=? AND scope=? AND key_hash=? AND status='pending'").bind(principal, scope, keyHash).run();
    return runWithPrincipal(scope, key, principal, work);
  }

  try {
    const value = await work();
    await db.prepare("UPDATE idempotency_records SET status='completed', response_json=?, updated_at=? WHERE id=?")
      .bind(JSON.stringify(value), Date.now(), id).run();
    return value;
  } catch (error) {
    await db.prepare("DELETE FROM idempotency_records WHERE id=? AND status='pending'").bind(id).run();
    throw error;
  }
}

export function runIdempotent<T>(scope: string, key: string | null, actor: Actor, work: () => Promise<T>): Promise<T> {
  return runWithPrincipal(scope, key, actor.id, work);
}

export async function runPublicIdempotent<T>(scope: string, key: string | null, identity: string, work: () => Promise<T>): Promise<T> {
  const identityHash = await sha256(identity.trim().toLowerCase());
  return runWithPrincipal(scope, key, `public:${identityHash}`, work);
}
