import { canAccessResource, canOverrideTenant, reportScopeForRole, type SecurityResource } from "../../../lib/authorization";
import { isInternal } from "./auth";
import { consistencyToken, multiConsistencyToken, parseCursor, readSession, resolveTenantRoute, shardDatabase, signCursor, tenantKeyForActor } from "./database";
import { ApiError, pageSize, success } from "./http";
import type { Env, ListCursor, RequestContext, ShardNumber } from "./types";

type ListDefinition = { table: string; columns: string; search: readonly string[]; statuses?: readonly string[];tenantColumn?:string;createdColumn?:string;idColumn?:string;statusColumn?:string };

const operationalLists: Record<string, ListDefinition> = {
  requests: { table: "trip_requests", columns: "id, tenant_key, request_number, kind, status, approval_status, contact_name, origin, destination, departure_date, return_date, traveler_count, budget_minor, currency, created_at, updated_at", search: ["request_number", "contact_email", "destination"], statuses: ["submitted", "qualified", "quoting", "quoted", "approved", "declined", "converted", "closed"] },
  quotes: { table: "quotes q JOIN quote_versions qv ON qv.quote_id=q.id AND qv.version=q.current_version JOIN trip_requests tr ON tr.id=q.trip_request_id", columns: "q.id,q.tenant_key,q.quote_number,q.trip_request_id,q.status,q.current_version,q.currency,q.expires_at,q.sent_at,q.approved_at,q.pdf_status,q.delivery_status,q.last_error,q.created_at,q.updated_at,qv.total_minor,qv.pdf_key,tr.destination,tr.departure_date,tr.return_date,tr.contact_name", search: ["q.quote_number","tr.destination"], statuses: ["draft", "sending", "sent", "viewed", "approved", "declined", "expired", "superseded", "send_failed"],tenantColumn:"q.tenant_key",createdColumn:"q.created_at",idColumn:"q.id",statusColumn:"q.status" },
  bookings: { table: "bookings b JOIN quotes q ON q.id=b.quote_id", columns: "b.id,b.tenant_key,b.booking_number,b.quote_id,b.trip_request_id,b.status,b.destination,b.departure_date,b.return_date,b.traveler_count,b.itinerary_pdf_key,b.pdf_status,b.delivery_status,b.last_error,b.created_at,b.updated_at,q.quote_number", search: ["b.booking_number", "b.destination"], statuses: ["pending", "confirmed", "in_progress", "completed", "cancelled"],tenantColumn:"b.tenant_key",createdColumn:"b.created_at",idColumn:"b.id",statusColumn:"b.status" },
  invoices: { table: "invoices i JOIN bookings b ON b.id=i.booking_id", columns: "i.id,i.tenant_key,i.invoice_number,i.booking_id,i.status,i.currency,i.total_minor,i.paid_minor,i.due_minor,i.issue_date,i.due_date,i.pdf_key,i.pdf_status,i.delivery_status,i.last_error,i.created_at,i.updated_at,b.booking_number,b.destination", search: ["i.invoice_number","b.booking_number"], statuses: ["draft", "issued", "partially_paid", "paid", "overdue", "void"],tenantColumn:"i.tenant_key",createdColumn:"i.created_at",idColumn:"i.id",statusColumn:"i.status" },
  support: { table: "support_tickets t", columns: "t.id,t.tenant_key,t.ticket_number,t.booking_id,t.subject,t.status,t.priority,t.assigned_agent_id,t.created_at,t.updated_at,(SELECT substr(body,1,180) FROM messages WHERE ticket_id=t.id AND internal=0 ORDER BY created_at DESC LIMIT 1) AS latest_message", search: ["t.ticket_number", "t.subject"], statuses: ["open", "waiting_customer", "waiting_tvse", "resolved", "closed"],tenantColumn:"t.tenant_key",createdColumn:"t.created_at",idColumn:"t.id",statusColumn:"t.status" },
  notifications: { table: "notifications", columns: "id, tenant_key, channel, template, destination, status, provider_id, attempts, last_error, sent_at, created_at, updated_at", search: ["destination", "template"], statuses: ["pending", "sending", "sent", "delivered", "failed", "bounced"] },
  audit: { table: "audit_events", columns: "id, tenant_key, actor_id, organization_id, entity_type, entity_id, action, created_at", search: ["entity_type", "entity_id", "action"] },
  leads: { table: "leads", columns: "id, tenant_key, type, status, name, email, phone, company, source, assigned_agent_id, created_at, updated_at", search: ["email", "name", "company"], statuses: ["new", "contacted", "qualified", "converted", "closed"] },
  approvals: { table: "approvals", columns: "id, tenant_key, entity_type, entity_id, approver_id, status, comment, decided_at, created_at, updated_at", search: ["entity_id"], statuses: ["pending", "approved", "declined"] },
  assignments: { table: "service_assignments", columns: "id, tenant_key, booking_id, supplier_id, status, service_type, traveler_summary, confirmed_at, created_at, updated_at", search: ["service_type", "supplier_id"], statuses: ["assigned", "accepted", "declined", "completed"] },
};

const coreLists: Record<string, ListDefinition> = {
  users: { table: "users", columns: "id, email, full_name, phone, kind, role, status, created_at, updated_at", search: ["email", "full_name"], statuses: ["active", "invited", "suspended"] },
  organizations: { table: "organizations", columns: "id, name, slug, type, status, billing_email, default_currency, created_at, updated_at", search: ["name", "slug", "billing_email"], statuses: ["active", "prospect", "suspended"] },
  suppliers: { table: "suppliers", columns: "id, organization_id, name, category, email, phone, country, status, created_at, updated_at", search: ["name", "category", "email"], statuses: ["active", "pending", "suspended"] },
  content: { table: "content_entries", columns: "id, type, slug, title, excerpt, image_path AS hero_image_url, status, published_at, created_at, updated_at", search: ["title", "slug"], statuses: ["draft", "published", "archived"] },
};

export async function handleList(request: Request, env: Env, context: RequestContext, resource: string): Promise<Response> {
  const definition = operationalLists[resource];
  if (!definition) throw new ApiError(404, "ROUTE_NOT_FOUND", "The resource does not exist");
  if (!canAccessResource(context.actor.role, resource as SecurityResource)) throw new ApiError(403, "ROLE_DENIED", "You do not have permission to read this resource");
  const url = new URL(request.url);
  const limit = pageSize(url);
  const cursor = await parseCursor(url.searchParams.get("cursor"), env.CURSOR_SECRET);
  const tenantOverride = url.searchParams.get("tenant");

  if (isInternal(context.actor.role) && !tenantOverride) return staffWideList(request, env, context, definition, limit, cursor, url);
  const tenantKey = tenantOverride ?? await tenantKeyForActor(context.actor);
  if (tenantOverride && !canOverrideTenant(context.actor.role)) throw new ApiError(403, "TENANT_DENIED", "Tenant overrides are limited to travel-management roles");
  if (!isInternal(context.actor.role) && tenantKey !== context.tenantKey) throw new ApiError(403, "TENANT_DENIED", "The requested tenant is outside your account");
  const route = await resolveTenantRoute(env, tenantKey, null);
  const session = readSession(shardDatabase(env, route.shard), request,route.shard);
  let objectClause: { sql: string; bindings: unknown[] } | undefined;
  if (resource === "approvals" && context.actor.role === "corporate_approver") objectClause = { sql: "approver_id = ?", bindings: [context.actor.sub] };
  if (resource === "assignments" && context.actor.role === "partner") {
    const supplier = await env.CORE_DB.prepare("SELECT id FROM suppliers WHERE organization_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(context.actor.organizationId).first<{ id: string }>();
    objectClause = supplier ? { sql: "supplier_id = ?", bindings: [supplier.id] } : { sql: "1 = 0", bindings: [] };
  }
  const { sql, bindings } = listSql(definition, limit, cursor, url, true, objectClause);
  const result = await session.prepare(sql).bind(tenantKey, ...bindings).all<Record<string, unknown>>();
  const items = result.results.slice(0, limit);
  const nextCursor = result.results.length > limit && items.length ? await signCursor({ version: 1, createdAt: Number(items.at(-1)?.created_at), id: String(items.at(-1)?.id) }, env.CURSOR_SECRET) : null;
  return success(request, env, context, { items, nextCursor, hasMore: result.results.length > limit }, { consistencyToken: consistencyToken(session),headers:{"X-TVSE-D1-Rows-Read":String(result.meta.rows_read??items.length)} });
}

export async function handleCoreList(request: Request, env: Env, context: RequestContext, resource: string): Promise<Response> {
  const definition = coreLists[resource];
  if (!definition) throw new ApiError(404, "ROUTE_NOT_FOUND", "The resource does not exist");
  if (!canAccessResource(context.actor.role, resource as SecurityResource)) throw new ApiError(403, "ROLE_DENIED", "You do not have permission to read this resource");
  const url = new URL(request.url);
  const limit = pageSize(url);
  const cursor = await parseCursor(url.searchParams.get("cursor"), env.CURSOR_SECRET);
  const session = readSession(env.CORE_DB, request);
  const { sql, bindings } = listSql(definition, limit, cursor, url, false);
  const result = await session.prepare(sql).bind(...bindings).all<Record<string, unknown>>();
  const items = result.results.slice(0, limit);
  const nextCursor = result.results.length > limit && items.length ? await signCursor({ version: 1, createdAt: Number(items.at(-1)?.created_at), id: String(items.at(-1)?.id) }, env.CURSOR_SECRET) : null;
  return success(request, env, context, { items, nextCursor, hasMore: result.results.length > limit }, { consistencyToken: consistencyToken(session),headers:{"X-TVSE-D1-Rows-Read":String(result.meta.rows_read??items.length)} });
}

async function staffWideList(request: Request, env: Env, context: RequestContext, definition: ListDefinition, limit: number, cursor: ListCursor | null, url: URL): Promise<Response> {
  const sessions:Partial<Record<ShardNumber,D1DatabaseSession>>={};
  const results = await Promise.all(([0, 1, 2, 3] as ShardNumber[]).map(async (shard) => {
    const position = cursor?.positions?.[shard] ?? null;
    const shardCursor = position ? { version: 1 as const, createdAt: position.createdAt, id: position.id } : null;
    const { sql, bindings } = listSql(definition, limit, shardCursor, url, false);
    const session = readSession(shardDatabase(env, shard), request,shard);sessions[shard]=session;
    const result = await session.prepare(sql).bind(...bindings).all<Record<string, unknown>>();
    return {rows:result.results.map((row): Record<string, unknown> & { __shard: ShardNumber } => ({ ...row, __shard: shard })),rowsRead:Number(result.meta.rows_read??result.results.length)};
  }));
  const merged = results.flatMap((result)=>result.rows).sort(compareRows).slice(0, limit);
  const positions = { ...(cursor?.positions ?? {}) };
  for (const row of merged) positions[row.__shard as ShardNumber] = { createdAt: Number(row.created_at), id: String(row.id) };
  const items = merged.map((value) => { const row={...value} as Record<string,unknown>;delete row.__shard;return row; });
  const last = merged.at(-1);
  const hasMore = results.some((result) => result.rows.length > limit) || results.reduce((sum,result)=>sum+result.rows.length,0) > limit;
  const nextCursor = hasMore && last ? await signCursor({ version: 1, createdAt: Number(last.created_at), id: String(last.id), positions }, env.CURSOR_SECRET) : null;
  return success(request, env, context, { items, nextCursor, hasMore }, { consistencyToken: multiConsistencyToken(sessions),headers:{"X-TVSE-D1-Rows-Read":String(results.reduce((sum,result)=>sum+result.rowsRead,0))} });
}

function listSql(definition: ListDefinition, limit: number, cursor: Pick<ListCursor, "createdAt" | "id"> | null, url: URL, tenant: boolean, objectClause?: { sql: string; bindings: unknown[] }): { sql: string; bindings: unknown[] } {
  const tenantColumn=definition.tenantColumn??"tenant_key";const created=definition.createdColumn??"created_at";const id=definition.idColumn??"id";const statusColumn=definition.statusColumn??"status";
  const clauses = tenant ? [`${tenantColumn} = ?`] : ["1 = 1"];
  const bindings: unknown[] = [];
  if (objectClause) { clauses.push(objectClause.sql); bindings.push(...objectClause.bindings); }
  const status = url.searchParams.get("status");
  if (status) {
    if (!definition.statuses?.includes(status)) throw new ApiError(400, "INVALID_FILTER", "The status filter is invalid");
    clauses.push(`${statusColumn} = ?`); bindings.push(status);
  }
  const query = url.searchParams.get("q")?.trim().toLowerCase();
  if (query) {
    if (query.length > 80) throw new ApiError(400, "INVALID_FILTER", "The search term is too long");
    clauses.push(`(${definition.search.map((column) => `LOWER(${column}) LIKE ?`).join(" OR ")})`);
    for (let index = 0; index < definition.search.length; index += 1) bindings.push(`${query}%`);
  }
  if (cursor) { clauses.push(`(${created} < ? OR (${created} = ? AND ${id} < ?))`); bindings.push(cursor.createdAt, cursor.createdAt, cursor.id); }
  return { sql: `SELECT ${definition.columns} FROM ${definition.table} WHERE ${clauses.join(" AND ")} ORDER BY ${created} DESC, ${id} DESC LIMIT ?`, bindings: [...bindings, limit + 1] };
}

function compareRows(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const timestamp = Number(right.created_at) - Number(left.created_at);
  return timestamp || String(right.id).localeCompare(String(left.id));
}

export async function handleOverview(request: Request, env: Env, context: RequestContext): Promise<Response> {
  if (context.actor.role === "content") throw new ApiError(403, "ROLE_DENIED", "Content accounts cannot access operational summaries");
  const tenantKey = await tenantKeyForActor(context.actor);
  const route = await resolveTenantRoute(env, tenantKey, null);
  const session = readSession(shardDatabase(env, route.shard), request,route.shard);
  const metrics = await session.prepare(`SELECT
    (SELECT COUNT(*) FROM trip_requests WHERE tenant_key = ? AND status NOT IN ('converted','closed')) AS open_requests,
    (SELECT COUNT(*) FROM quotes WHERE tenant_key = ? AND current = 1) AS quotes,
    (SELECT COUNT(*) FROM bookings WHERE tenant_key = ? AND status NOT IN ('completed','cancelled')) AS active_bookings,
    (SELECT COUNT(*) FROM invoices WHERE tenant_key = ? AND status NOT IN ('paid','void')) AS outstanding_invoices,
    (SELECT COUNT(*) FROM support_tickets WHERE tenant_key = ? AND status NOT IN ('resolved','closed')) AS open_support,
    (SELECT COUNT(*) FROM service_assignments WHERE tenant_key = ? AND status <> 'completed') AS active_assignments,
    (SELECT COUNT(*) FROM service_assignments WHERE tenant_key = ? AND status = 'confirmed') AS confirmed_assignments,
    (SELECT COALESCE(SUM(paid_minor),0) FROM invoices WHERE tenant_key = ? AND currency = 'KES') AS paid_kes,
    (SELECT COALESCE(SUM(paid_minor),0) FROM invoices WHERE tenant_key = ? AND currency = 'USD') AS paid_usd
  `).bind(tenantKey,tenantKey,tenantKey,tenantKey,tenantKey,tenantKey,tenantKey,tenantKey,tenantKey).first();
  const recent=await session.prepare(`SELECT * FROM (
    SELECT 'Request' AS record_type,id,request_number AS reference,status,created_at FROM trip_requests WHERE tenant_key=? ORDER BY created_at DESC LIMIT 6
  ) UNION ALL SELECT * FROM (SELECT 'Booking',id,booking_number,status,created_at FROM bookings WHERE tenant_key=? ORDER BY created_at DESC LIMIT 6)
  UNION ALL SELECT * FROM (SELECT 'Invoice',id,invoice_number,status,created_at FROM invoices WHERE tenant_key=? ORDER BY created_at DESC LIMIT 6)
  ORDER BY created_at DESC LIMIT 6`).bind(tenantKey,tenantKey,tenantKey).all();
  const visible = { ...(metrics ?? {}) } as Record<string, unknown>;
  if (context.actor.role === "agent") for (const key of ["outstanding_invoices", "paid_kes", "paid_usd"]) delete visible[key];
  if (context.actor.role === "finance") for (const key of ["open_requests", "quotes", "active_bookings", "open_support", "active_assignments", "confirmed_assignments"]) delete visible[key];
  const recentVisible = context.actor.role === "finance" ? recent.results.filter((row) => row.record_type === "Invoice") : recent.results.filter((row) => context.actor.role !== "agent" || row.record_type !== "Invoice");
  return success(request, env, context, {metrics:visible,recent:recentVisible}, { consistencyToken: consistencyToken(session) });
}

export async function handleReports(request: Request, env: Env, context: RequestContext): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "1970-01-01";
  const to = url.searchParams.get("to") ?? "9999-12-31";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(from) || !/^\d{4}-\d{2}-\d{2}$/u.test(to) || from > to) throw new ApiError(400, "INVALID_DATE_RANGE", "The reporting date range is invalid");
  const scope=reportScopeForRole(context.actor.role);if(scope==="none")throw new ApiError(403,"ROLE_DENIED","You do not have permission to read reports");
  const includeFinance=scope==="full"||scope==="finance"||scope==="tenant";const includeTravel=scope==="full"||scope==="travel"||scope==="tenant";
  const tenantKey = await tenantKeyForActor(context.actor);const internal=scope!=="tenant";const route=internal?null:await resolveTenantRoute(env,tenantKey,null);const shards=internal?([0,1,2,3] as ShardNumber[]):[route!.shard];
  const parts=await Promise.all(shards.map(async(shard)=>{const session=readSession(shardDatabase(env,shard),request,shard);const tenantClause=internal?"1=1":"tenant_key=?";const tenantArgs=internal?[]:[tenantKey];const [finance,pipeline,totals]=await session.batch([
    includeFinance?session.prepare(`SELECT currency,status,COUNT(*) AS invoice_count,COALESCE(SUM(total_minor),0) AS total_minor,COALESCE(SUM(paid_minor),0) AS paid_minor,COALESCE(SUM(due_minor),0) AS due_minor FROM invoices WHERE ${tenantClause} AND issue_date BETWEEN ? AND ? GROUP BY currency,status`).bind(...tenantArgs,from,to):session.prepare("SELECT NULL AS currency, NULL AS status WHERE 0"),
    includeTravel?session.prepare(`SELECT status,COUNT(*) AS count FROM trip_requests WHERE ${tenantClause} GROUP BY status`).bind(...tenantArgs):session.prepare("SELECT NULL AS status, 0 AS count WHERE 0"),
    includeTravel?session.prepare(`SELECT (SELECT COUNT(*) FROM bookings WHERE ${tenantClause}) AS bookings,(SELECT COUNT(*) FROM support_tickets WHERE ${tenantClause} AND status NOT IN ('resolved','closed')) AS open_support`).bind(...tenantArgs,...tenantArgs):session.prepare("SELECT 0 AS bookings, 0 AS open_support"),
  ]);return{session,finance:finance.results as Record<string,unknown>[],pipeline:pipeline.results as Record<string,unknown>[],totals:totals.results[0] as Record<string,unknown>};}));
  const financeMap=new Map<string,Record<string,unknown>>();for(const part of parts)for(const row of part.finance){const key=`${row.currency}:${row.status}`;const current=financeMap.get(key)??{currency:row.currency,status:row.status,invoice_count:0,total_minor:0,paid_minor:0,due_minor:0};for(const field of ["invoice_count","total_minor","paid_minor","due_minor"])current[field]=Number(current[field])+Number(row[field]);financeMap.set(key,current);}
  const pipelineMap=new Map<string,number>();for(const part of parts)for(const row of part.pipeline)pipelineMap.set(String(row.status),(pipelineMap.get(String(row.status))??0)+Number(row.count));
  const totals={bookings:parts.reduce((sum,part)=>sum+Number(part.totals?.bookings??0),0),open_support:parts.reduce((sum,part)=>sum+Number(part.totals?.open_support??0),0)};
  return success(request,env,context,{finance:[...financeMap.values()],pipeline:[...pipelineMap].map(([status,count])=>({status,count})),totals,from,to},{consistencyToken:internal?multiConsistencyToken(Object.fromEntries(parts.map((part,index)=>[shards[index],part.session]))):consistencyToken(parts[0].session)});
}
