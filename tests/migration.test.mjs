import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationDirectory = new URL("../drizzle/", import.meta.url);
const migrationFiles = (await readdir(migrationDirectory)).filter((name)=>name.endsWith(".sql")).sort();
const migrations = await Promise.all(migrationFiles.map((name)=>readFile(new URL(name,migrationDirectory),"utf8")));
const [initialSql] = migrations;
const sql = migrations.join("\n");

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
  for (const migration of migrations.slice(1)) database.exec(migration);
  const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name);
  for (const name of ["idx_quotes_request_current","idx_bookings_request","idx_invoices_booking_current","idx_payments_invoice_reference","idx_notifications_dedupe","idx_idempotency_actor_scope_key","idx_rate_limits_scope_key_bucket"]) assert.ok(indexes.includes(name), `${name} should exist`);
  const quoteColumns = database.prepare("PRAGMA table_info(quotes)").all().map((row) => row.name);
  assert.ok(quoteColumns.includes("current"));
  const userColumns = database.prepare("PRAGMA table_info(users)").all().map((row) => row.name);
  assert.ok(userColumns.includes("auth_version"));
  for (const table of ["tenant_routes","core_change_events","migration_state","content_search_terms"]) assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  const triggers = database.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map((row)=>row.name);
  assert.ok(triggers.includes("trg_requests_scale_insert"));
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

test("membership remediation keeps one compatible organization and revokes affected sessions", () => {
  const database = new DatabaseSync(":memory:");database.exec("PRAGMA foreign_keys=ON");
  database.exec(initialSql);for(const migration of migrations.slice(1,-1))database.exec(migration);
  const now=Date.now();
  database.prepare("INSERT INTO organizations (id,name,slug,type,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("org_c","Corporate","corporate","corporate","active",now,now);
  database.prepare("INSERT INTO organizations (id,name,slug,type,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").run("org_p","Partner","partner","partner","active",now,now);
  database.prepare("INSERT INTO users (id,email,kind,role,status,created_at,updated_at,auth_version) VALUES (?,?,?,?,?,?,?,?)").run("user_c","corp@example.com","corporate","corporate_requester","active",now,now,1);
  database.prepare("INSERT INTO users (id,email,kind,role,status,created_at,updated_at,auth_version) VALUES (?,?,?,?,?,?,?,?)").run("user_missing","missing@example.com","partner","partner","active",now,now,1);
  database.prepare("INSERT INTO memberships (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)").run("old_bad","org_p","user_c","partner_user",now-10);
  database.prepare("INSERT INTO memberships (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)").run("new_good","org_c","user_c","requester",now);
  database.prepare("INSERT INTO sessions (id,user_id,token_hash,expires_at,last_seen_at,created_at) VALUES (?,?,?,?,?,?)").run("session_c","user_c","hash-c",now+10000,now,now);
  database.exec(migrations.at(-1));
  const membership=database.prepare("SELECT id,organization_id FROM memberships WHERE user_id='user_c'").get();assert.equal(membership.id,"new_good");assert.equal(membership.organization_id,"org_c");
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='user_c'").get().count,0);
  assert.equal(database.prepare("SELECT status FROM users WHERE id='user_missing'").get().status,"suspended");
  assert.throws(()=>database.prepare("INSERT INTO memberships (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)").run("duplicate","org_p","user_c","partner_user",now+1),/UNIQUE/u);
  database.close();
});
