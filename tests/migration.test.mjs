import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const initialSql = await readFile(new URL("../drizzle/0000_soft_sentry.sql", import.meta.url), "utf8");
const launchSql = await readFile(new URL("../drizzle/0001_blushing_colonel_america.sql", import.meta.url), "utf8");
const sql = `${initialSql}\n${launchSql}`;

test("D1 migration contains the complete operational model", () => {
  const tables = ["users","sessions","magic_links","organizations","memberships","traveler_profiles","leads","trip_requests","trip_request_travelers","approvals","quotes","quote_versions","quote_items","bookings","itinerary_days","booking_segments","service_assignments","invoices","invoice_items","payments","support_tickets","messages","notifications","webhook_events","destinations","packages","content_entries","media_assets","activity_logs","sequences","settings","idempotency_records","rate_limits"];
  for (const table of tables) assert.ok(sql.includes("CREATE TABLE `" + table + "`"), `${table} should be migrated`);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_quotes_number`/);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_bookings_number`/);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_invoices_number`/);
  assert.match(sql, /INSERT INTO `destinations`/);
  assert.match(sql, /INSERT INTO `packages`/);
});

test("all migrations apply cleanly to isolated SQLite and install launch invariants", () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  database.exec(initialSql);
  database.exec(launchSql);
  const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
  for (const name of ["idx_quotes_request_current","idx_bookings_request","idx_invoices_booking_current","idx_payments_invoice_reference","idx_notifications_dedupe","idx_idempotency_actor_scope_key","idx_rate_limits_scope_key_bucket"]) assert.ok(indexes.includes(name), `${name} should exist`);
  const quoteColumns = database.prepare("PRAGMA table_info(quotes)").all().map((row) => row.name);
  assert.ok(quoteColumns.includes("current"));
  const requestColumns = database.prepare("PRAGMA table_info(trip_requests)").all().map((row) => row.name);
  for (const column of ["source_path","marketing_context_json","consent_at","consent_version"]) assert.ok(requestColumns.includes(column));
  database.prepare("INSERT INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run("idem_public", "public:hashed-identity", "contact:create", "hashed-key", "pending", Date.now() + 60_000, Date.now(), Date.now());
  database.close();
});

test("money and historical exchange snapshots use integer/real database fields", () => {
  assert.match(sql, /`total_minor` integer/);
  assert.match(sql, /`paid_minor` integer/);
  assert.match(sql, /`due_minor` integer/);
  assert.match(sql, /`exchange_rate` real/);
  assert.match(sql, /`snapshot_json` text/);
});
