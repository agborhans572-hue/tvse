import { recoverJobs } from "./jobs";
import { logEvent } from "./http";
import { shardDatabase } from "./database";
import type { Env, ShardNumber } from "./types";
import { applyCoreChangeEvents } from "./migration";

const DAY = 24 * 60 * 60_000;

export async function runScheduledMaintenance(event: ScheduledController, env: Env): Promise<void> {
  if (event.cron === "* * * * *") {
    await Promise.all([recoverJobs(env), applyCoreChangeEvents(env)]);
    return;
  }
  await cleanupCore(env);
  for (const shard of [0, 1, 2, 3] as ShardNumber[]) {
    await refreshDailyAggregates(env, shard);
    await cleanupShard(env, shard);
  }
}

async function refreshDailyAggregates(env:Env,shard:ShardNumber):Promise<void>{
  const database=shardDatabase(env,shard);const now=Date.now();const cutoff=new Date(now-31*DAY).toISOString().slice(0,10);
  const metric=(name:string,value:string)=>database.prepare(`INSERT INTO daily_aggregates(id,tenant_key,day,metric,currency,value_integer,updated_at)
    SELECT 'agg:'||tenant_key||':'||issue_date||':${name}:'||currency,tenant_key,issue_date,'${name}',currency,${value},?
    FROM invoices WHERE issue_date>=? GROUP BY tenant_key,issue_date,currency
    ON CONFLICT(tenant_key,day,metric,currency) DO UPDATE SET value_integer=excluded.value_integer,updated_at=excluded.updated_at`).bind(now,cutoff);
  await database.batch([
    database.prepare(`INSERT INTO daily_aggregates(id,tenant_key,day,metric,currency,value_integer,updated_at)
      SELECT 'agg:'||tenant_key||':'||date(created_at/1000,'unixepoch')||':request_count:',tenant_key,date(created_at/1000,'unixepoch'),'request_count','',COUNT(*),?
      FROM trip_requests WHERE created_at>=? GROUP BY tenant_key,date(created_at/1000,'unixepoch')
      ON CONFLICT(tenant_key,day,metric,currency) DO UPDATE SET value_integer=excluded.value_integer,updated_at=excluded.updated_at`).bind(now,now-31*DAY),
    database.prepare(`INSERT INTO daily_aggregates(id,tenant_key,day,metric,currency,value_integer,updated_at)
      SELECT 'agg:'||tenant_key||':'||date(created_at/1000,'unixepoch')||':booking_count:',tenant_key,date(created_at/1000,'unixepoch'),'booking_count','',COUNT(*),?
      FROM bookings WHERE created_at>=? GROUP BY tenant_key,date(created_at/1000,'unixepoch')
      ON CONFLICT(tenant_key,day,metric,currency) DO UPDATE SET value_integer=excluded.value_integer,updated_at=excluded.updated_at`).bind(now,now-31*DAY),
    metric("invoice_count","COUNT(*)"),metric("invoice_total","SUM(total_minor)"),metric("invoice_paid","SUM(paid_minor)"),metric("invoice_due","SUM(due_minor)"),
  ]);
  logEvent({event:"daily_aggregates_refreshed",shard,windowDays:31,jobOutcome:"completed"});
}

async function cleanupCore(env: Env): Promise<void> {
  const now = Date.now();
  await env.CORE_DB.batch([
    env.CORE_DB.prepare("DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at < ? LIMIT 500)").bind(now - 7 * DAY),
    env.CORE_DB.prepare("DELETE FROM magic_links WHERE id IN (SELECT id FROM magic_links WHERE expires_at < ? LIMIT 500)").bind(now - DAY),
  ]);
}

async function cleanupShard(env: Env, shard: ShardNumber): Promise<void> {
  const database = shardDatabase(env, shard); const now = Date.now();
  await database.batch([
    database.prepare("DELETE FROM idempotency_records WHERE id IN (SELECT id FROM idempotency_records WHERE status = 'completed' AND updated_at < ? LIMIT 500)").bind(now - 48 * 60 * 60_000),
    database.prepare("DELETE FROM idempotency_records WHERE id IN (SELECT id FROM idempotency_records WHERE status = 'pending' AND updated_at < ? LIMIT 500)").bind(now - 60 * 60_000),
    database.prepare("UPDATE webhook_events SET payload_json = NULL WHERE id IN (SELECT id FROM webhook_events WHERE payload_json IS NOT NULL AND created_at < ? LIMIT 500)").bind(now - 30 * DAY),
    database.prepare("UPDATE notifications SET payload_json = '{}', updated_at = ? WHERE id IN (SELECT id FROM notifications WHERE payload_json <> '{}' AND created_at < ? LIMIT 500)").bind(now, now - 90 * DAY),
  ]);

  const abandoned = await database.prepare("SELECT id, r2_key FROM media_assets WHERE status IN ('pending','uploaded') AND created_at < ? LIMIT 500").bind(now - 7 * DAY).all<{ id: string; r2_key: string }>();
  for (const row of abandoned.results) await env.UPLOADS.delete(row.r2_key);
  if (abandoned.results.length) await deleteIds(database, "media_assets", abandoned.results.map((row) => row.id));
  await archiveAudit(env, database, shard, now - 365 * DAY);
  await archiveFinance(env, database, shard, now - 365 * DAY);
}

async function archiveAudit(env: Env, database: D1Database, shard: ShardNumber, cutoff: number): Promise<void> {
  const rows = await database.prepare("SELECT id, tenant_key, actor_id, organization_id, entity_type, entity_id, action, metadata_json, created_at FROM audit_events WHERE created_at < ? ORDER BY created_at LIMIT 500").bind(cutoff).all<Record<string, unknown>>();
  if (!rows.results.length) return;
  const key = await writeArchive(env, `archives/audit/shard-${shard}`, rows.results);
  await deleteIds(database, "audit_events", rows.results.map((row) => String(row.id)));
  logEvent({ event: "archive_completed", archiveType: "audit", shard, count: rows.results.length, key });
}

async function archiveFinance(env: Env, database: D1Database, shard: ShardNumber, cutoff: number): Promise<void> {
  const invoices = await database.prepare("SELECT * FROM invoices WHERE status IN ('paid','void') AND updated_at < ? ORDER BY updated_at LIMIT 100").bind(cutoff).all<Record<string, unknown>>();
  if (!invoices.results.length) return;
  const ids = invoices.results.map((row) => String(row.id)); const placeholders = ids.map(() => "?").join(",");
  const [items, payments] = await database.batch([
    database.prepare(`SELECT * FROM invoice_items WHERE invoice_id IN (${placeholders})`).bind(...ids),
    database.prepare(`SELECT * FROM payments WHERE invoice_id IN (${placeholders})`).bind(...ids),
  ]);
  const key = await writeArchive(env, `archives/finance/shard-${shard}`, { invoices: invoices.results, items: items.results, payments: payments.results });
  await deleteRowsById(database,"payments",payments.results.map((row)=>String((row as Record<string,unknown>).id)));
  await deleteRowsById(database,"invoice_items",items.results.map((row)=>String((row as Record<string,unknown>).id)));
  await deleteRowsById(database,"invoices",ids);
  logEvent({ event: "archive_completed", archiveType: "finance", shard, count: ids.length, key });
}

async function writeArchive(env: Env, prefix: string, value: unknown): Promise<string> {
  const serialized = encoder.encode(JSON.stringify({ schemaVersion: 1, archivedAt: new Date().toISOString(), records: value }));
  const checksum = [...new Uint8Array(await crypto.subtle.digest("SHA-256", serialized))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const compressed = new Blob([serialized]).stream().pipeThrough(new CompressionStream("gzip"));
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${Date.now()}-${crypto.randomUUID()}.json.gz`;
  await env.UPLOADS.put(key, compressed, { httpMetadata: { contentType: "application/gzip" }, customMetadata: { sha256: checksum, retentionDays: env.ARCHIVE_RETENTION_DAYS ?? "2557" } });
  return key;
}

async function deleteIds(database: D1Database, table: "media_assets" | "audit_events", ids: string[]): Promise<void> {
  return deleteRowsById(database,table,ids);
}

async function deleteRowsById(database:D1Database,table:"media_assets"|"audit_events"|"payments"|"invoice_items"|"invoices",ids:string[]):Promise<void>{
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100); const placeholders = batch.map(() => "?").join(",");
    await database.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders})`).bind(...batch).run();
  }
}

const encoder = new TextEncoder();
