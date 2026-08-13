import { anonymousTenantKey, resolveTenantRoute, shardDatabase } from "./database";
import { ApiError, logEvent, readJson, success } from "./http";
import type { Env, RequestContext, ShardNumber } from "./types";

type ChangeEvent = { id: string; tenant_key: string; entity_type: string; entity_id: string; operation: "upsert" | "delete"; row_version: number; attempts: number };
type Row = Record<string, unknown>;

const columns: Record<string, readonly string[]> = {
  leads: ["id","user_id","type","status","name","email","phone","company","message","source","source_path","marketing_context_json","consent_at","consent_version","assigned_agent_id","converted_trip_request_id","created_at","updated_at"],
  trip_requests: ["id","request_number","user_id","organization_id","kind","status","approval_status","approver_id","assigned_agent_id","contact_name","contact_email","contact_phone","origin","destination","departure_date","return_date","traveler_count","budget_minor","currency","interests_json","notes","source","source_path","marketing_context_json","consent_at","consent_version","created_at","updated_at"],
  trip_request_travelers: ["id","trip_request_id","user_id","full_name","traveler_type","created_at"],
  approvals: ["id","entity_type","entity_id","approver_id","status","comment","decided_at","created_at"],
  quotes: ["id","quote_number","trip_request_id","user_id","organization_id","status","current","current_version","currency","exchange_rate","expires_at","sent_at","approved_at","created_at","updated_at"],
  quote_versions: ["id","quote_id","version","subtotal_minor","fees_minor","tax_minor","total_minor","notes","snapshot_json","pdf_key","created_by","created_at"],
  quote_items: ["id","quote_version_id","supplier_id","category","description","service_date","quantity","unit_price_minor","markup_minor","tax_minor","total_minor","position"],
  bookings: ["id","booking_number","quote_id","trip_request_id","user_id","organization_id","status","destination","departure_date","return_date","traveler_count","itinerary_pdf_key","created_at","updated_at"],
  itinerary_days: ["id","booking_id","day_number","date","title","description","location"],
  booking_segments: ["id","booking_id","type","supplier_id","confirmation_code","start_at","end_at","details_json","status"],
  service_assignments: ["id","booking_id","supplier_id","status","service_type","traveler_summary","service_details_json","partner_note","confirmed_at","created_at","updated_at"],
  invoices: ["id","invoice_number","booking_id","user_id","organization_id","status","current","currency","exchange_rate","subtotal_minor","tax_minor","total_minor","paid_minor","due_minor","issue_date","due_date","pdf_key","created_at","updated_at"],
  invoice_items: ["id","invoice_id","description","quantity","unit_price_minor","tax_minor","total_minor","position"],
  payments: ["id","receipt_number","invoice_id","amount_minor","currency","method","reference","paid_at","recorded_by","receipt_key","note","created_at"],
  support_tickets: ["id","ticket_number","user_id","organization_id","booking_id","subject","status","priority","assigned_agent_id","created_at","updated_at"],
  messages: ["id","ticket_id","sender_id","body","internal","created_at"],
  media_assets: ["id","owner_user_id","entity_type","entity_id","r2_key","filename","content_type","size_bytes","visibility","created_at"],
  notifications: ["id","user_id","channel","template","destination","status","payload_json","provider_id","dedupe_key","attempts","last_error","sent_at","created_at"],
  webhook_events: ["id","provider","event_id","event_type","payload_json","processed_at"],
  activity_logs: ["id","actor_id","organization_id","entity_type","entity_id","action","metadata_json","created_at"],
};

const shardTable = (table: string) => table === "activity_logs" ? "audit_events" : table;

export async function applyCoreChangeEvents(env: Env): Promise<void> {
  const events = await env.CORE_DB.prepare("SELECT id, tenant_key, entity_type, entity_id, operation, row_version, attempts FROM core_change_events WHERE status = 'pending' AND available_at <= ? ORDER BY created_at LIMIT 100").bind(Date.now()).all<ChangeEvent>();
  for (const event of events.results) {
    try {
      await applyEvent(env, event);
      await env.CORE_DB.prepare("UPDATE core_change_events SET status = 'applied', published_at = ?, last_error = NULL WHERE id = ?").bind(Date.now(), event.id).run();
    } catch (error) {
      const attempts = event.attempts + 1; const dead = attempts >= 8;
      await env.CORE_DB.prepare("UPDATE core_change_events SET status = ?, attempts = ?, available_at = ?, last_error = ? WHERE id = ?").bind(dead ? "dead" : "pending", attempts, Date.now() + Math.min(3_600_000, 60_000 * 2 ** attempts), safeError(error), event.id).run();
      logEvent({event:"change_event_failed",eventId:event.id,entityType:event.entity_type,retryCount:attempts,jobOutcome:dead?"dead":"retryable",alert:dead,error:safeError(error)});
    }
  }
}

async function applyEvent(env: Env, event: ChangeEvent): Promise<void> {
  const tableColumns = columns[event.entity_type];
  if (!tableColumns) throw new Error(`Unsupported change entity ${event.entity_type}`);
  const tenantKey = await normalizeTenantKey(event.tenant_key);
  const route = await resolveTenantRoute(env, tenantKey, routeCreation(tenantKey));
  const database = shardDatabase(env, route.shard); const table = shardTable(event.entity_type);
  if (event.operation === "delete") {
    await database.batch([
      database.prepare(`DELETE FROM ${table} WHERE id = ? AND tenant_key = ?`).bind(event.entity_id, tenantKey),
      database.prepare("INSERT OR IGNORE INTO migration_applied_events (event_id, entity_type, entity_id, row_version, applied_at) VALUES (?, ?, ?, ?, ?)").bind(event.id, event.entity_type, event.entity_id, event.row_version, Date.now()),
    ]);
    return;
  }
  const row = await env.CORE_DB.prepare(`SELECT ${tableColumns.join(",")} FROM ${event.entity_type} WHERE id = ? LIMIT 1`).bind(event.entity_id).first<Row>();
  if (!row) return;
  await database.batch([
    upsertStatement(database, table, tableColumns, row, tenantKey, event.row_version),
    database.prepare("INSERT OR IGNORE INTO migration_applied_events (event_id, entity_type, entity_id, row_version, applied_at) VALUES (?, ?, ?, ?, ?)").bind(event.id, event.entity_type, event.entity_id, event.row_version, Date.now()),
  ]);
}

export async function handleBackfill(request: Request, env: Env, context: RequestContext): Promise<Response> {
  assertMigrationToken(request, env);
  const input = await readJson<{ table?: string; cursor?: string; limit?: number }>(request);
  const table = input.table ?? "trip_requests"; const tableColumns = columns[table];
  if (!tableColumns) throw new ApiError(400, "INVALID_BACKFILL_TABLE", "This table cannot be backfilled");
  const limit = Math.max(1, Math.min(1_000, Math.floor(input.limit ?? 1_000)));
  const result = await env.CORE_DB.prepare(`${backfillSelect(table, tableColumns)} AND source.id > ? ORDER BY source.id LIMIT ?`).bind(input.cursor ?? "", limit).all<Row>();
  const routed: Array<{ row: Row; tenantKey: string; shard: ShardNumber; version: number }> = [];
  for (const row of result.results) {
    const tenantKey = await normalizeTenantKey(String(row.__tenant_key));
    const route = await resolveTenantRoute(env, tenantKey, routeCreation(tenantKey));
    routed.push({ row, tenantKey, shard: route.shard, version: Number(row.updated_at ?? row.created_at ?? Date.now()) });
  }
  for (const shard of [0, 1, 2, 3] as ShardNumber[]) {
    const rows = routed.filter((item) => item.shard === shard); const database = shardDatabase(env, shard);
    for (let offset = 0; offset < rows.length; offset += 100) await database.batch(rows.slice(offset, offset + 100).map((item) => upsertStatement(database, shardTable(table), tableColumns, item.row, item.tenantKey, item.version)));
  }
  const nextCursor = result.results.length === limit ? String(result.results.at(-1)?.id) : null;
  await env.CORE_DB.prepare("INSERT INTO migration_state (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").bind(`backfill:${table}`, JSON.stringify({ cursor: nextCursor, copied: result.results.length }), Date.now()).run();
  return success(request, env, context, { table, copied: result.results.length, nextCursor, complete: !nextCursor });
}

export async function handleShadowComparison(request: Request, env: Env, context: RequestContext): Promise<Response> {
  assertMigrationToken(request, env);
  const url = new URL(request.url); const table = url.searchParams.get("table") ?? "trip_requests";
  if (!columns[table]) throw new ApiError(400, "INVALID_BACKFILL_TABLE", "This table cannot be compared");
  const rawTenant = url.searchParams.get("tenant"); if (!rawTenant) throw new ApiError(400, "TENANT_REQUIRED", "A tenant key is required");
  const tenantKey = await normalizeTenantKey(rawTenant); const route = await resolveTenantRoute(env, tenantKey, null);
  const coreWhere = coreTenantPredicate(table);
  const monetary = table === "invoices" ? "COALESCE(SUM(total_minor),0)" : "0";
  const versionColumn = columns[table].includes("updated_at") ? "updated_at" : columns[table].includes("created_at") ? "created_at" : "0";
  const core = await env.CORE_DB.prepare(`SELECT COUNT(*) AS count, ${monetary} AS monetary_total, COALESCE(SUM(length(id) + ${versionColumn}),0) AS row_hash FROM ${table} WHERE ${coreWhere.sql}`).bind(...coreWhere.bindings(tenantKey)).first<Record<string, unknown>>();
  const shard = await shardDatabase(env, route.shard).prepare(`SELECT COUNT(*) AS count, ${monetary} AS monetary_total, COALESCE(SUM(length(id) + ${versionColumn}),0) AS row_hash FROM ${shardTable(table)} WHERE tenant_key = ?`).bind(tenantKey).first<Record<string, unknown>>();
  const match = JSON.stringify(core) === JSON.stringify(shard);
  logEvent({event:"shadow_comparison",tenant:tenantKey,shard:route.shard,entityType:table,match,alert:!match});
  return success(request, env, context, { table, tenantKey, shard: route.shard, match, core, operational: shard });
}

export async function initializeDocumentNumbers(request:Request,env:Env,context:RequestContext):Promise<Response>{assertMigrationToken(request,env);const year=new Date().getUTCFullYear();const mapping=[...["REQ","Q","B","INV","RCT","TKT"]].map(String);const initialized:Record<string,number>={};for(const kind of mapping){const row=await env.CORE_DB.prepare("SELECT current_value FROM sequences WHERE id=?").bind(`${kind}:${year}`).first<{current_value:number}>();const stub=env.DOCUMENT_NUMBERS.get(env.DOCUMENT_NUMBERS.idFromName(kind==="REQ"?"trip-request":kind==="RCT"?"receipt":kind.toLowerCase()));const response=await stub.fetch("https://numbers.internal/initialize",{method:"POST",body:JSON.stringify({action:"initialize",maximum:row?.current_value??0})});initialized[kind]=(await response.json<{value:number}>()).value;}return success(request,env,context,{year,initialized});}

export async function updateTenantRoutes(request:Request,env:Env,context:RequestContext):Promise<Response>{
  assertMigrationToken(request,env);const input=await readJson<{tenantKeys?:string[];readMode?:"core"|"shadow"|"shard";mirrorWrites?:boolean}>(request);
  const tenantKeys=[...new Set((input.tenantKeys??[]).map((value)=>String(value).trim()).filter(Boolean))];
  if(!tenantKeys.length||tenantKeys.length>500)throw new ApiError(400,"TENANT_KEYS_INVALID","Provide between one and 500 tenant keys");
  if(!input.readMode||!["core","shadow","shard"].includes(input.readMode))throw new ApiError(400,"READ_MODE_INVALID","Choose core, shadow, or shard");
  const now=Date.now();const statements=tenantKeys.map((tenantKey)=>env.CORE_DB.prepare("UPDATE tenant_routes SET read_mode=?, mirror_writes=COALESCE(?,mirror_writes), updated_at=? WHERE tenant_key=?").bind(input.readMode,input.mirrorWrites===undefined?null:input.mirrorWrites?1:0,now,tenantKey));
  const results=await env.CORE_DB.batch(statements);await Promise.all(tenantKeys.map((tenantKey)=>env.ROUTING_CACHE.delete(`route:${tenantKey}`)));
  return success(request,env,context,{readMode:input.readMode,mirrorWrites:input.mirrorWrites??null,requested:tenantKeys.length,updated:results.reduce((sum,result)=>sum+Number(result.meta.changes??0),0)});
}

function upsertStatement(database: D1Database, table: string, tableColumns: readonly string[], row: Row, tenantKey: string, rowVersion: number): D1PreparedStatement {
  const names = ["tenant_key", ...tableColumns, "row_version"];
  const update = names.filter((name) => name !== "id" && name !== "tenant_key").map((name) => `${name}=excluded.${name}`).join(",");
  const values = [tenantKey, ...tableColumns.map((name) => row[name] ?? null), rowVersion];
  return database.prepare(`INSERT INTO ${table} (${names.join(",")}) VALUES (${names.map(() => "?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${update} WHERE excluded.row_version > ${table}.row_version`).bind(...values);
}

function backfillSelect(table: string, tableColumns: readonly string[]): string {
  const tenant = coreTenantExpression(table);
  return `SELECT ${tableColumns.map((column) => `source.${column}`).join(",")}, ${tenant} AS __tenant_key FROM ${table} source ${backfillJoin(table)} WHERE ${tenant} IS NOT NULL`;
}

function backfillJoin(table: string): string {
  if (table === "quotes") return "JOIN trip_requests request ON request.id=source.trip_request_id";
  if (table === "bookings") return "JOIN trip_requests request ON request.id=source.trip_request_id";
  if (table === "invoices") return "JOIN bookings booking ON booking.id=source.booking_id JOIN trip_requests request ON request.id=booking.trip_request_id";
  if (table === "support_tickets") return "LEFT JOIN bookings booking ON booking.id=source.booking_id LEFT JOIN trip_requests request ON request.id=booking.trip_request_id";
  if (["quote_versions"].includes(table)) return "JOIN quotes root ON root.id=source.quote_id JOIN trip_requests request ON request.id=root.trip_request_id";
  if (table === "quote_items") return "JOIN quote_versions version ON version.id=source.quote_version_id JOIN quotes root ON root.id=version.quote_id JOIN trip_requests request ON request.id=root.trip_request_id";
  if (["itinerary_days","booking_segments"].includes(table)) return "JOIN bookings root ON root.id=source.booking_id JOIN trip_requests request ON request.id=root.trip_request_id";
  if (table === "invoice_items" || table === "payments") return "JOIN invoices root ON root.id=source.invoice_id JOIN bookings booking ON booking.id=root.booking_id JOIN trip_requests request ON request.id=booking.trip_request_id";
  if (table === "messages") return "JOIN support_tickets root ON root.id=source.ticket_id LEFT JOIN bookings booking ON booking.id=root.booking_id LEFT JOIN trip_requests request ON request.id=booking.trip_request_id";
  return "";
}

function coreTenantExpression(table: string): string {
  if (["trip_requests"].includes(table)) return tenantCase("source");
  if (["quotes","bookings","invoices","support_tickets"].includes(table)) return `COALESCE(CASE WHEN source.organization_id IS NOT NULL THEN 'org:'||source.organization_id WHEN source.user_id IS NOT NULL THEN 'user:'||source.user_id END,${tenantCase("request")})`;
  if (table === "leads") return "CASE WHEN source.user_id IS NOT NULL THEN 'user:'||source.user_id ELSE 'anonymous-email:'||lower(source.email) END";
  if (["quote_versions","quote_items","itinerary_days","booking_segments","invoice_items","payments","messages"].includes(table)) return tenantCase("request");
  if (table === "service_assignments") return "(SELECT tenant_key FROM core_change_events WHERE entity_type='bookings' AND entity_id=source.booking_id ORDER BY row_version DESC LIMIT 1)";
  if (table === "trip_request_travelers") return "(SELECT tenant_key FROM core_change_events WHERE entity_type='trip_requests' AND entity_id=source.trip_request_id ORDER BY row_version DESC LIMIT 1)";
  if (table === "approvals") return "(SELECT tenant_key FROM core_change_events WHERE entity_id=source.entity_id ORDER BY row_version DESC LIMIT 1)";
  if (table === "media_assets") return "CASE WHEN source.owner_user_id IS NOT NULL THEN 'user:'||source.owner_user_id ELSE (SELECT tenant_key FROM core_change_events WHERE entity_id=source.entity_id ORDER BY row_version DESC LIMIT 1) END";
  if (table === "notifications") return "CASE WHEN source.user_id IS NOT NULL THEN 'user:'||source.user_id ELSE NULL END";
  if (table === "webhook_events") return "'system:webhooks'";
  if (table === "activity_logs") return "COALESCE('org:'||source.organization_id,'user:'||source.actor_id)";
  return "NULL";
}

function tenantCase(alias: string): string { return `CASE WHEN ${alias}.organization_id IS NOT NULL THEN 'org:'||${alias}.organization_id WHEN ${alias}.user_id IS NOT NULL THEN 'user:'||${alias}.user_id ELSE 'anonymous-email:'||lower(${alias}.contact_email) END`; }

function coreTenantPredicate(table: string): { sql: string; bindings: (tenantKey: string) => unknown[] } {
  if (["trip_requests","quotes","bookings","invoices","support_tickets"].includes(table)) return { sql: "((? LIKE 'org:%' AND organization_id=substr(?,5)) OR (? LIKE 'user:%' AND user_id=substr(?,6)))", bindings: (key) => [key,key,key,key] };
  return { sql: "id IN (SELECT entity_id FROM core_change_events WHERE tenant_key=? AND entity_type=?)", bindings: (key) => [key,table] };
}

async function normalizeTenantKey(key: string): Promise<string> { return key.startsWith("anonymous-email:") ? anonymousTenantKey(key.slice("anonymous-email:".length)) : key; }
function routeCreation(key: string) { if (key.startsWith("org:")) return { type: "organization" as const, organizationId: key.slice(4) }; if (key.startsWith("user:")) return { type: "user" as const, userId: key.slice(5) }; return { type: "anonymous" as const }; }
function assertMigrationToken(request: Request, env: Env): void { const secret=env.MIGRATION_ADMIN_TOKEN??"";if(new TextEncoder().encode(secret).byteLength<32)throw new ApiError(503,"MIGRATION_CONFIGURATION_UNAVAILABLE","Migration controls are unavailable");const supplied=request.headers.get("X-Migration-Token")??"";let difference=secret.length^supplied.length;for(let index=0;index<Math.max(secret.length,supplied.length);index+=1)difference|=(secret.charCodeAt(index)||0)^(supplied.charCodeAt(index)||0);if(difference!==0)throw new ApiError(403, "MIGRATION_DENIED", "Migration access is denied"); }
function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 500) : "Unknown migration error"; }
