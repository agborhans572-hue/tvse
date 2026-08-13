import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";

const smoke = process.argv.includes("--smoke");
const target = smoke
  ? { users: 40, organizations: 8, requests: 400, bookings: 200, tickets: 100, messages: 1_000 }
  : { users: 1_500, organizations: 100, requests: 100_000, bookings: 50_000, tickets: 25_000, messages: 250_000 };
const root = resolve(process.cwd(), ".scale-fixtures"); const archiveRoot = join(root, "archives");
if (!archiveRoot.startsWith(`${root}${sep}`)) throw new Error("Fixture archive path escaped its output directory");
if (existsSync(root)) rmSync(root, { recursive: true, force: true });
mkdirSync(archiveRoot, { recursive: true });

function sqlDirectory(path: string): string {
  return readdirSync(path).filter((name) => name.endsWith(".sql")).sort().map((name) => readFileSync(join(path, name), "utf8")).join("\n");
}

function transaction(database: DatabaseSync, work: () => void) {
  database.exec("BEGIN IMMEDIATE");
  try { work(); database.exec("COMMIT"); } catch (error) { database.exec("ROLLBACK"); throw error; }
}

const now = Date.now(); const day = 86_400_000;
const corePath = join(root, "core.sqlite"); const core = new DatabaseSync(corePath);
core.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=OFF");
core.exec(sqlDirectory(resolve("drizzle")));
const addOrganization = core.prepare("INSERT OR IGNORE INTO organizations(id,name,slug,type,status,billing_email,default_currency,travel_policy_json,created_at,updated_at) VALUES(?,?,?,'corporate','active',?,'KES','{}',?,?)");
const addUser = core.prepare("INSERT OR IGNORE INTO users(id,email,full_name,kind,role,status,created_at,updated_at,auth_version) VALUES(?,?,?,'traveler','corporate_requester','active',?,?,1)");
const addRoute = core.prepare("INSERT OR IGNORE INTO tenant_routes(id,tenant_key,tenant_type,organization_id,shard,read_mode,mirror_writes,assigned_at,updated_at) VALUES(?,?,'organization',?,?,'shard',1,?,?)");
const addMembership=core.prepare("INSERT OR IGNORE INTO memberships(id,organization_id,user_id,role,created_at) VALUES(?,?,?,'requester',?)");
const addSession=core.prepare("INSERT OR IGNORE INTO sessions(id,user_id,token_hash,expires_at,last_seen_at,user_agent,created_at) VALUES(?,?,?,?,?,'tvse-k6-fixture',?)");
const loadSessions:string[]=[];
transaction(core, () => {
  for (let index=0;index<target.organizations;index+=1) {
    const id=`org_scale_${index.toString().padStart(4,"0")}`; addOrganization.run(id,`Scale Organization ${index}`,`scale-org-${index}`,`billing-${index}@example.test`,now,now);
    addRoute.run(`route_${id}`,`org:${id}`,id,index%4,now,now);
  }
  for (let index=0;index<target.users;index+=1) {
    const userId=`usr_scale_${index.toString().padStart(5,"0")}`;const organizationId=`org_scale_${(index%target.organizations).toString().padStart(4,"0")}`;
    const rawToken=createHash("sha256").update(`tvse-load-session:${index}:2026-08`).digest("hex");const tokenHash=createHash("sha256").update(rawToken).digest("base64url");
    addUser.run(userId,`scale-user-${index}@example.test`,`Scale User ${index}`,now,now);
    addMembership.run(`mem_scale_${index.toString().padStart(5,"0")}`,organizationId,userId,now);
    addSession.run(`ses_scale_${index.toString().padStart(5,"0")}`,userId,tokenHash,now+7*day,now,now);
    loadSessions.push(rawToken);
  }
});
core.close();
writeFileSync(join(root,"load-session-cookies.json"),JSON.stringify(loadSessions));

const shardSql = sqlDirectory(resolve("workers/operations/migrations/shards"));
const shardDatabases = Array.from({ length: 4 }, (_, shard) => {
  const database = new DatabaseSync(join(root, `ops-${shard}.sqlite`));
  database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=OFF"); database.exec(shardSql); return database;
});

for (let shard=0;shard<4;shard+=1) {
  const database=shardDatabases[shard];
  const request=database.prepare("INSERT INTO trip_requests(id,tenant_key,request_number,user_id,organization_id,kind,status,approval_status,contact_name,contact_email,origin,destination,departure_date,return_date,traveler_count,budget_minor,currency,created_at,updated_at) VALUES(?,?,?,?,?,'corporate',?,'approved',?,?,? ,?,'2026-10-01','2026-10-08',2,250000,'KES',?,?)");
  const quote=database.prepare("INSERT INTO quotes(id,tenant_key,quote_number,trip_request_id,user_id,organization_id,status,current,current_version,currency,exchange_rate,pdf_status,delivery_status,created_at,updated_at) VALUES(?,?,?,?,?,?,'approved',1,1,'KES',1,'completed','delivered',?,?)");
  const version=database.prepare("INSERT INTO quote_versions(id,tenant_key,quote_id,version,subtotal_minor,total_minor,snapshot_json,created_by,created_at) VALUES(?,?,?,1,200000,200000,'{}','usr_scale_00000',?)");
  const booking=database.prepare("INSERT INTO bookings(id,tenant_key,booking_number,quote_id,trip_request_id,user_id,organization_id,status,destination,departure_date,return_date,traveler_count,pdf_status,delivery_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'confirmed',?,'2026-10-01','2026-10-08',2,'completed','delivered',?,?)");
  const invoice=database.prepare("INSERT INTO invoices(id,tenant_key,invoice_number,booking_id,user_id,organization_id,status,current,currency,subtotal_minor,total_minor,paid_minor,due_minor,issue_date,due_date,pdf_status,delivery_status,created_at,updated_at) VALUES(?,?,?,?,?,?,'issued',1,'KES',200000,200000,100000,100000,'2026-08-01','2026-09-01','completed','delivered',?,?)");
  const ticket=database.prepare("INSERT INTO support_tickets(id,tenant_key,ticket_number,user_id,organization_id,subject,status,priority,created_at,updated_at) VALUES(?,?,?,?,?,'Scale-test support conversation','open','normal',?,?)");
  const message=database.prepare("INSERT INTO messages(id,tenant_key,ticket_id,sender_id,body,internal,created_at) VALUES(?,?,?,?,?,0,?)");
  const audit=database.prepare("INSERT INTO audit_events(id,tenant_key,actor_id,organization_id,entity_type,entity_id,action,metadata_json,created_at) VALUES(?,?,?,?, 'trip_request',?,'fixture_created','{}',?)");
  transaction(database,()=>{
    for(let index=shard;index<target.requests;index+=4){const orgIndex=index%target.organizations;const orgId=`org_scale_${orgIndex.toString().padStart(4,"0")}`;const tenant=`org:${orgId}`;const userId=`usr_scale_${(index%target.users).toString().padStart(5,"0")}`;const id=`tr_scale_${index.toString().padStart(7,"0")}`;const timestamp=now-(index%365)*day;request.run(id,tenant,`REQ-2026-${index.toString().padStart(7,"0")}`,userId,orgId,["submitted","qualified","quoted","approved"][index%4],`Traveler ${index}`,`traveler-${index}@example.test`,index%2?"Nairobi":"Mombasa",index%3?"Zanzibar":"Cape Town",timestamp,timestamp);if(index%10===0)audit.run(`aud_scale_${index}`,tenant,userId,orgId,id,timestamp);}
    for(let index=shard;index<target.bookings;index+=4){const orgIndex=index%target.organizations;const orgId=`org_scale_${orgIndex.toString().padStart(4,"0")}`;const tenant=`org:${orgId}`;const userId=`usr_scale_${(index%target.users).toString().padStart(5,"0")}`;const tripId=`tr_scale_${index.toString().padStart(7,"0")}`;const quoteId=`quo_scale_${index.toString().padStart(7,"0")}`;const bookingId=`bok_scale_${index.toString().padStart(7,"0")}`;const timestamp=now-(index%365)*day;quote.run(quoteId,tenant,`Q-2026-${index.toString().padStart(7,"0")}`,tripId,userId,orgId,timestamp,timestamp);version.run(`qv_scale_${index}`,tenant,quoteId,timestamp);booking.run(bookingId,tenant,`B-2026-${index.toString().padStart(7,"0")}`,quoteId,tripId,userId,orgId,index%3?"Zanzibar":"Cape Town",timestamp,timestamp);invoice.run(`inv_scale_${index}`,tenant,`INV-2026-${index.toString().padStart(7,"0")}`,bookingId,userId,orgId,timestamp,timestamp);}
    for(let index=shard;index<target.tickets;index+=4){const orgIndex=index%target.organizations;const orgId=`org_scale_${orgIndex.toString().padStart(4,"0")}`;const tenant=`org:${orgId}`;const userId=`usr_scale_${(index%target.users).toString().padStart(5,"0")}`;const ticketId=`tkt_scale_${index.toString().padStart(7,"0")}`;const timestamp=now-(index%365)*day;ticket.run(ticketId,tenant,`TKT-2026-${index.toString().padStart(7,"0")}`,userId,orgId,timestamp,timestamp);}
    for(let index=shard;index<target.messages;index+=4){const ticketIndex=index%target.tickets;const orgIndex=ticketIndex%target.organizations;const orgId=`org_scale_${orgIndex.toString().padStart(4,"0")}`;const tenant=`org:${orgId}`;const userId=`usr_scale_${(ticketIndex%target.users).toString().padStart(5,"0")}`;message.run(`msg_scale_${index.toString().padStart(8,"0")}`,tenant,`tkt_scale_${ticketIndex.toString().padStart(7,"0")}`,userId,`Production-like fixture message ${index}`,now-(index%365)*day);}
  });
  database.exec("ANALYZE"); database.close();
}

const archives: Array<{ key:string;sha256:string;bytes:number }> = [];
for(let month=0;month<84;month+=1){const date=new Date(Date.UTC(2026,7-month,1));const key=`audit-${date.toISOString().slice(0,7)}.ndjson.gz`;const rows=Array.from({length:100},(_,index)=>JSON.stringify({id:`archive-${month}-${index}`,tenantKey:`org:org_scale_${(index%target.organizations).toString().padStart(4,"0")}`,action:"historical_fixture",createdAt:date.getTime()+index})).join("\n");const compressed=gzipSync(rows);writeFileSync(join(archiveRoot,key),compressed);archives.push({key,sha256:createHash("sha256").update(compressed).digest("hex"),bytes:compressed.byteLength});}
writeFileSync(join(root,"manifest.json"),JSON.stringify({generatedAt:new Date().toISOString(),smoke,target,shards:4,sessions:loadSessions.length,archives},null,2));
console.log(JSON.stringify({output:root,...target,sessions:loadSessions.length,archives:archives.length},null,2));
