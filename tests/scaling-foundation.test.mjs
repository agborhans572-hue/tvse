import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { initialShardForTenant, parseCursor, signCursor } from "../workers/operations/src/database.ts";
import { signOperationsAccessToken, verifyOperationsAccessToken } from "../lib/operations-token.ts";

const shardDirectory = new URL("../workers/operations/migrations/shards/", import.meta.url);
const shardSql = (await Promise.all((await readdir(shardDirectory)).filter((name)=>name.endsWith(".sql")).sort().map((name)=>readFile(new URL(name,shardDirectory),"utf8")))).join("\n");

test("operational shard migration installs tenant-local hot indexes", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(shardSql);
  const plan = database.prepare("EXPLAIN QUERY PLAN SELECT id,request_number,status,created_at FROM trip_requests WHERE tenant_key=? AND status=? ORDER BY created_at DESC,id DESC LIMIT 26").all("org:test","submitted");
  const detail = plan.map((row)=>String(row.detail)).join(" ");
  assert.match(detail,/idx_trip_requests_tenant_status_created/);
  assert.doesNotMatch(detail,/USE TEMP B-TREE|SCAN trip_requests/i);
  for (const table of ["async_jobs","daily_aggregates","migration_applied_events","audit_events","media_assets"]) assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
  database.close();
});

test("defined list hot queries avoid table scans and temporary sorts", () => {
  const database = new DatabaseSync(":memory:"); database.exec(shardSql);
  const cases = [
    ["tenant requests", "SELECT id,request_number,status,created_at FROM trip_requests WHERE tenant_key=? ORDER BY created_at DESC,id DESC LIMIT 26", ["org:test"]],
    ["staff requests", "SELECT id,request_number,status,created_at FROM trip_requests WHERE 1=1 ORDER BY created_at DESC,id DESC LIMIT 26", []],
    ["tenant invoices", "SELECT id,invoice_number,status,created_at FROM invoices WHERE tenant_key=? AND status=? ORDER BY created_at DESC,id DESC LIMIT 26", ["org:test","issued"]],
    ["tenant support", "SELECT id,ticket_number,status,created_at FROM support_tickets WHERE tenant_key=? ORDER BY created_at DESC,id DESC LIMIT 26", ["org:test"]],
    ["job recovery", "SELECT id FROM async_jobs WHERE state='pending' AND available_at<=? ORDER BY available_at LIMIT 100", [Date.now()]],
  ];
  for (const [name, sql, bindings] of cases) {
    const detail=database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...bindings).map((row)=>String(row.detail)).join(" ");
    assert.doesNotMatch(detail,/SCAN (trip_requests|invoices|support_tickets|async_jobs)(?! USING (?:COVERING )?INDEX)|USE TEMP B-TREE FOR ORDER BY/i,`${name}: ${detail}`);
  }
  database.close();
});

test("signed keyset cursors reject tampering", async () => {
  const secret="cursor-secret-that-is-long-enough-for-tests";
  const cursor=await signCursor({version:1,createdAt:123,id:"trp_1"},secret);
  assert.deepEqual(await parseCursor(cursor,secret),{version:1,createdAt:123,id:"trp_1"});
  await assert.rejects(()=>parseCursor(`${cursor.slice(0,-1)}x`,secret),/cursor is invalid/i);
});

test("five-minute access tokens support current and previous rotation keys", async () => {
  const current="current-secret-that-is-at-least-thirty-two-characters";
  const previous="previous-secret-that-is-at-least-thirty-two-characters";
  const base={sub:"usr_1",email:"traveler@example.com",role:"traveler",organizationId:null,source:"magic_link",authVersion:3};
  const signed=await signOperationsAccessToken(base,{secret:previous,kid:"previous",now:1_000});
  const claims=await verifyOperationsAccessToken(signed.token,{current,previous},1_100);
  assert.equal(claims.sub,"usr_1"); assert.equal(claims.authVersion,3); assert.equal(claims.exp,1_300);
  await assert.rejects(()=>verifyOperationsAccessToken(signed.token,{current},1_100),/Unknown signing key/);
  await assert.rejects(()=>verifyOperationsAccessToken(signed.token,{current,previous},1_301),/Expired/);
});

test("tenant routes remain permanent when the shard pool grows", () => {
  const database=new DatabaseSync(":memory:");
  database.exec("CREATE TABLE tenant_routes(tenant_key TEXT PRIMARY KEY,shard INTEGER NOT NULL); INSERT INTO tenant_routes VALUES ('org:a',2)");
  database.prepare("INSERT OR IGNORE INTO tenant_routes VALUES (?,?)").run("org:a",4);
  assert.equal(database.prepare("SELECT shard FROM tenant_routes WHERE tenant_key='org:a'").get().shard,2);
  database.close();
});

test("initial tenant routing distributes a concurrent onboarding wave",async()=>{
  const counts=[0,0,0,0];
  for(let index=0;index<1_500;index+=1)counts[await initialShardForTenant(`org:load-${index}`)]+=1;
  assert.equal(counts.reduce((sum,value)=>sum+value,0),1_500);
  assert.ok(Math.max(...counts)-Math.min(...counts)<100,`unexpected shard distribution ${counts.join(",")}`);
});

test("shard constraints prevent duplicate side effects, stale replay, and payment races",()=>{
  const database=new DatabaseSync(":memory:");database.exec(shardSql);const now=Date.now();
  database.prepare("INSERT INTO trip_requests(id,tenant_key,request_number,contact_name,contact_email,origin,destination,departure_date,return_date,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("req_1","org:a","TVSE-REQ-2026-00001","Amina","amina@example.test","Nairobi","Mombasa","2099-01-01","2099-01-05",now,now,now);
  database.prepare("INSERT INTO trip_requests(id,tenant_key,request_number,contact_name,contact_email,origin,destination,departure_date,return_date,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("req_2","org:b","TVSE-REQ-2026-00002","Ben","ben@example.test","Nairobi","Kigali","2099-02-01","2099-02-05",now,now,now);
  assert.deepEqual(database.prepare("SELECT id FROM trip_requests WHERE tenant_key=? ORDER BY id").all("org:a").map((row)=>row.id),["req_1"]);

  const replay=database.prepare("INSERT OR IGNORE INTO idempotency_records(id,actor_id,scope,key_hash,status,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)");
  assert.equal(replay.run("idem_1","usr_1","payments:create","same-key","pending",now+1_000,now,now).changes,1);
  assert.equal(replay.run("idem_2","usr_1","payments:create","same-key","pending",now+1_000,now,now).changes,0);

  database.prepare("INSERT INTO quotes(id,tenant_key,quote_number,trip_request_id,current_version,currency,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run("quote_1","org:a","TVSE-Q-2026-00001","req_1",1,"KES",now,now,now);
  const version=database.prepare("INSERT INTO quote_versions(id,tenant_key,quote_id,version,created_by,row_version,created_at) VALUES(?,?,?,?,?,?,?)");
  version.run("qv_1","org:a","quote_1",1,"usr_1",now,now);
  assert.throws(()=>version.run("qv_2","org:a","quote_1",1,"usr_1",now+1,now+1),/UNIQUE/i);

  database.prepare("INSERT INTO bookings(id,tenant_key,booking_number,quote_id,trip_request_id,destination,departure_date,return_date,row_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run("book_1","org:a","TVSE-B-2026-00001","quote_1","req_1","Mombasa","2099-01-01","2099-01-05",now,now);
  database.prepare("INSERT INTO invoices(id,tenant_key,invoice_number,booking_id,currency,total_minor,paid_minor,due_minor,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run("inv_1","org:a","TVSE-INV-2026-00001","book_1","KES",1_000,0,1_000,now,now,now);
  const conditionalPayment=database.prepare("INSERT INTO payments(id,tenant_key,receipt_number,invoice_id,amount_minor,currency,method,reference,paid_at,recorded_by,row_version,created_at) SELECT ?,tenant_key,?,id,?,currency,'mobile_money',?,?,?, ?,? FROM invoices WHERE id=? AND due_minor>=?");
  assert.equal(conditionalPayment.run("pay_1","TVSE-RCT-2026-00001",600,"MPESA-1",now,"usr_1",now,now,"inv_1",600).changes,1);
  database.prepare("UPDATE invoices SET paid_minor=paid_minor+600,due_minor=due_minor-600 WHERE id='inv_1'").run();
  assert.equal(conditionalPayment.run("pay_2","TVSE-RCT-2026-00002",600,"MPESA-2",now,"usr_1",now+1,now+1,"inv_1",600).changes,0);
  assert.throws(()=>database.prepare("INSERT INTO payments(id,tenant_key,receipt_number,invoice_id,amount_minor,currency,method,reference,paid_at,recorded_by,row_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run("pay_3","org:a","TVSE-RCT-2026-00003","inv_1",100,"KES","mobile_money","MPESA-1",now,"usr_1",now,now),/UNIQUE/i);

  database.prepare("UPDATE trip_requests SET status='approved',row_version=? WHERE id='req_1'").run(now+100);
  database.prepare("INSERT INTO trip_requests(id,tenant_key,request_number,contact_name,contact_email,origin,destination,departure_date,return_date,status,row_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,row_version=excluded.row_version WHERE excluded.row_version>trip_requests.row_version")
    .run("req_1","org:a","TVSE-REQ-2026-00001","Amina","amina@example.test","Nairobi","Mombasa","2099-01-01","2099-01-05","closed",now,now,now);
  assert.equal(database.prepare("SELECT status FROM trip_requests WHERE id='req_1'").get().status,"approved");
  database.close();
});
