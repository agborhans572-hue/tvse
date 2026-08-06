import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("../drizzle/0000_soft_sentry.sql", import.meta.url), "utf8");

test("D1 migration contains the complete operational model", () => {
  const tables = ["users","sessions","magic_links","organizations","memberships","trip_requests","approvals","quotes","quote_versions","quote_items","bookings","itinerary_days","booking_segments","service_assignments","invoices","invoice_items","payments","support_tickets","messages","notifications","webhook_events","destinations","packages","content_entries","media_assets","activity_logs","sequences"];
  for (const table of tables) assert.ok(sql.includes("CREATE TABLE `" + table + "`"), `${table} should be migrated`);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_quotes_number`/);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_bookings_number`/);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_invoices_number`/);
  assert.match(sql, /INSERT INTO `destinations`/);
  assert.match(sql, /INSERT INTO `packages`/);
});

test("money and historical exchange snapshots use integer/real database fields", () => {
  assert.match(sql, /`total_minor` integer/);
  assert.match(sql, /`paid_minor` integer/);
  assert.match(sql, /`due_minor` integer/);
  assert.match(sql, /`exchange_rate` real/);
  assert.match(sql, /`snapshot_json` text/);
});
