import type { Role } from "../../../lib/travel";
import { canAccessResource, canOverrideTenant } from "../../../lib/authorization";
import { contactSchema, paymentSchema, supportMessageSchema, tenantOverrideSchema, tripRequestSchema } from "../../../lib/validation";
import type { ZodType } from "zod";
import { requireRoles } from "./auth";
import { allocateDocumentNumber } from "./durable-objects";
import { hashValue, primaryConsistencyToken, resolveTenantRoute, shardDatabase, tenantKeyForActor } from "./database";
import { ApiError, readJson, requireIdempotencyKey, success } from "./http";
import { publishJob } from "./jobs";
import type { Env, RequestContext, ShardNumber } from "./types";

type JobRef = { id: string; type: string; status: "pending"; pollUrl: string };
const jobUrl=(id:string,tenantKey:string)=>`/v2/jobs/${id}?tenant=${encodeURIComponent(tenantKey)}`;

export async function createTripRequest(request: Request, env: Env, context: RequestContext, execution: ExecutionContext): Promise<Response> {
  requireRoles(context.actor.role, ["traveler", "corporate_requester", "corporate_approver", "owner", "admin", "agent"]);
  const input = parseSchema(tripRequestSchema, await readJson<unknown>(request));
  const tenantKey = await tenantKeyForActor(context.actor);
  const route = await resolveTenantRoute(env, tenantKey, { type: context.actor.organizationId ? "organization" : "user", organizationId: context.actor.organizationId, userId: context.actor.sub });
  return commitTripRequest(request, env, context, execution, { ...input, tenantKey, shard: route.shard, userId: context.actor.sub, organizationId: context.actor.organizationId,mirrorWrites:Boolean(route.mirror_writes) }, requireIdempotencyKey(request));
}

export async function createAnonymousTripRequest(request: Request, env: Env, execution: ExecutionContext, requestId: string): Promise<Response> {
  const input = parseSchema(tripRequestSchema, await readJson<unknown>(request));
  const { anonymousTenantKey } = await import("./database");
  const tenantKey = await anonymousTenantKey(input.contactEmail);
  const route = await resolveTenantRoute(env, tenantKey, { type: "anonymous" });
  const context: RequestContext = { requestId, startedAt: Date.now(), actor: { sub: tenantKey, email: input.contactEmail, role: "traveler", organizationId: null, source: "magic_link", authVersion: 1, iss: "tvse-sites", aud: "tvse-operations", iat: 0, exp: 0, jti: requestId, kid: "public" }, tenantKey, shard: route.shard };
  return commitTripRequest(request, env, context, execution, { ...input, tenantKey, shard: route.shard, userId: null, organizationId: null,mirrorWrites:Boolean(route.mirror_writes) }, requireIdempotencyKey(request));
}

export async function createAnonymousLead(request: Request, env: Env, execution: ExecutionContext, requestId: string): Promise<Response> {
  const body = parseSchema(contactSchema, await readJson<unknown>(request));
  const email = body.email; const name = body.name;
  const type = body.type;
  const message = body.message; const tenantKey = await (await import("./database")).anonymousTenantKey(email);
  const route = await resolveTenantRoute(env,tenantKey,{type:"anonymous"}); const database=shardDatabase(env,route.shard); const now=Date.now();
  const actorId=tenantKey; const keyHash=await hashValue(requireIdempotencyKey(request)); const idempotencyId=crypto.randomUUID(); const id=crypto.randomUUID(); const auditId=crypto.randomUUID(); const jobId=crypto.randomUUID();const mirrorJobId=crypto.randomUUID();const mirrorWrites=Boolean(route.mirror_writes);
  const data={leadId:id,message:"Thank you. A TVSE specialist will follow up with you."}; const jobs:JobRef[]=[{id:jobId,type:"email",status:"pending",pollUrl:jobUrl(jobId,tenantKey)},...(mirrorWrites?[{id:mirrorJobId,type:"change_event",status:"pending" as const,pollUrl:jobUrl(mirrorJobId,tenantKey)}]:[])];
  const payload=JSON.stringify({to:email,subject:"TVSE received your enquiry",html:`<p>Hello ${escapeHtml(name)},</p><p>Thank you for contacting TVSE. A travel specialist will follow up with you.</p>`,dedupeKey:`lead-ack:${id}`});
  const mirrorPayload=JSON.stringify({direction:"to_core",table:"leads",row:{id,user_id:null,type,status:"new",name,email,phone:body.phone?String(body.phone).slice(0,40):null,company:body.company?String(body.company).slice(0,160):null,message,source:"v2",source_path:body.marketing&&typeof body.marketing==="object"?String((body.marketing as Record<string,unknown>).sourcePath??""):null,marketing_context_json:JSON.stringify(body.marketing??{}),consent_at:now,consent_version:String(body.consentVersion??"2026-08"),assigned_agent_id:null,converted_trip_request_id:null,created_at:now,updated_at:now}});
  const results=await database.batch([
    database.prepare("INSERT OR IGNORE INTO idempotency_records (id,actor_id,scope,key_hash,status,expires_at,created_at,updated_at) VALUES (?,?, 'contact:create',?,'pending',?,?,?)").bind(idempotencyId,actorId,keyHash,now+48*60*60_000,now,now),
    database.prepare("INSERT INTO leads (id,tenant_key,user_id,type,status,name,email,phone,company,message,source,source_path,marketing_context_json,consent_at,consent_version,row_version,created_at,updated_at) SELECT ?,?,NULL,?,'new',?,?,?,?,?,'website',?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM idempotency_records WHERE id=?)").bind(id,tenantKey,type,name,email,body.phone?String(body.phone).slice(0,40):null,body.company?String(body.company).slice(0,160):null,message,body.marketing&&typeof body.marketing==="object"?String((body.marketing as Record<string,unknown>).sourcePath??""):null,JSON.stringify(body.marketing??{}),now,String(body.consentVersion??"2026-08"),now,now,now,idempotencyId),
    database.prepare("INSERT INTO audit_events (id,tenant_key,actor_id,entity_type,entity_id,action,metadata_json,row_version,created_at) SELECT ?,?,NULL,'lead',?,'created',?,1,? WHERE EXISTS (SELECT 1 FROM leads WHERE id=?)").bind(auditId,tenantKey,id,JSON.stringify({source:"v2",type}),now,id),
    database.prepare("INSERT INTO async_jobs (id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'email','pending',?,?,'lead',?,0,?,?,? WHERE EXISTS (SELECT 1 FROM leads WHERE id=?)").bind(jobId,tenantKey,`lead-ack:${id}`,payload,id,now,now,now,id),
    database.prepare("INSERT INTO async_jobs (id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'change_event','pending',?,?,'lead',?,0,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM leads WHERE id=?)").bind(mirrorJobId,tenantKey,`mirror:lead:${id}`,mirrorPayload,id,now,now,now,mirrorWrites?1:0,id),
    database.prepare("UPDATE idempotency_records SET status='completed',response_json=?,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM leads WHERE id=?)").bind(JSON.stringify({data,jobs}),now,idempotencyId,id),
  ]);
  const context:RequestContext={requestId,startedAt:now,tenantKey,shard:route.shard,actor:{sub:actorId,email,role:"traveler",organizationId:null,source:"magic_link",authVersion:1,iss:"tvse-sites",aud:"tvse-operations",iat:0,exp:0,jti:requestId,kid:"public"}};
  if((results[1].meta.changes??0)===0)return replay(request,env,context,database,actorId,"contact:create",keyHash);
  execution.waitUntil(Promise.all([publishJob(env,{id:jobId,shard:route.shard,tenantKey,type:"email"}),...(mirrorWrites?[publishJob(env,{id:mirrorJobId,shard:route.shard,tenantKey,type:"change_event"})]:[])]).then(()=>undefined));
  return success(request,env,context,data,{status:201,jobs,consistencyToken:await primaryConsistencyToken(database,route.shard),headers:writeHeaders(results)});
}

async function commitTripRequest(
  request: Request,
  env: Env,
  context: RequestContext,
  execution: ExecutionContext,
  input: Omit<ReturnType<typeof tripRequestSchema.parse>, "organizationId"> & { tenantKey: string; shard: ShardNumber; userId: string | null; organizationId: string | null;mirrorWrites:boolean },
  idempotencyKey: string,
): Promise<Response> {
  const database = shardDatabase(env, input.shard);
  const requestNumber = await allocateDocumentNumber(env.DOCUMENT_NUMBERS, "trip-request", "TVSE-REQ");
  const now = Date.now();
  const recordId = crypto.randomUUID();
  const auditId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const mirrorJobId=crypto.randomUUID();
  const idempotencyId = crypto.randomUUID();
  const keyHash = await hashValue(idempotencyKey);
  const jobs: JobRef[] = [{ id: jobId, type: "email", status: "pending", pollUrl: jobUrl(jobId,input.tenantKey) },...(input.mirrorWrites?[{id:mirrorJobId,type:"change_event",status:"pending" as const,pollUrl:jobUrl(mirrorJobId,input.tenantKey)}]:[])];
  const data = { id: recordId, requestNumber, status: "submitted", pdfStatus: "pending", deliveryStatus: "pending" };
  const stored = JSON.stringify({ data, jobs });
  const jobPayload = JSON.stringify({ to: input.contactEmail, subject: `We received ${requestNumber}`, html: `<p>Hello ${escapeHtml(input.contactName)},</p><p>TVSE received your travel request <strong>${requestNumber}</strong>. Our team will follow up shortly.</p>`, dedupeKey: `request-ack:${recordId}` });
  const mirrorPayload=JSON.stringify({direction:"to_core",table:"trip_requests",row:{id:recordId,request_number:requestNumber,user_id:input.userId,organization_id:input.organizationId,kind:input.kind,status:"submitted",approval_status:input.organizationId?"pending":"not_required",approver_id:null,assigned_agent_id:null,contact_name:input.contactName,contact_email:input.contactEmail,contact_phone:input.contactPhone,origin:input.origin,destination:input.destination,departure_date:input.departureDate,return_date:input.returnDate,traveler_count:input.travelerCount,budget_minor:input.budgetMinor,currency:input.currency,interests_json:JSON.stringify(input.interests),notes:input.notes,source:"v2",source_path:null,marketing_context_json:"{}",consent_at:now,consent_version:"2026-08",created_at:now,updated_at:now}});
  const results = await database.batch([
    database.prepare("INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, 'requests:create', ?, 'pending', ?, ?, ?)").bind(idempotencyId, context.actor.sub, keyHash, now + 48 * 60 * 60_000, now, now),
    database.prepare(`INSERT INTO trip_requests (id, tenant_key, request_number, user_id, organization_id, kind, status, approval_status, contact_name, contact_email, contact_phone, origin, destination, departure_date, return_date, traveler_count, budget_minor, currency, interests_json, notes, source, row_version, created_at, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'v2', ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM idempotency_records WHERE id = ? AND status = 'pending')`).bind(recordId, input.tenantKey, requestNumber, input.userId, input.organizationId, input.kind, input.organizationId ? "pending" : "not_required", input.contactName, input.contactEmail, input.contactPhone, input.origin, input.destination, input.departureDate, input.returnDate, input.travelerCount, input.budgetMinor, input.currency, JSON.stringify(input.interests), input.notes, now, now, now, idempotencyId),
    database.prepare(`INSERT INTO audit_events (id, tenant_key, actor_id, organization_id, entity_type, entity_id, action, metadata_json, row_version, created_at)
      SELECT ?, ?, ?, ?, 'trip_request', ?, 'created', ?, 1, ? WHERE EXISTS (SELECT 1 FROM trip_requests WHERE id = ? AND tenant_key = ?)`).bind(auditId, input.tenantKey, input.userId, input.organizationId, recordId, JSON.stringify({ source: "v2" }), now, recordId, input.tenantKey),
    database.prepare(`INSERT INTO async_jobs (id, tenant_key, type, state, dedupe_key, payload_json, entity_type, entity_id, attempts, available_at, created_at, updated_at)
      SELECT ?, ?, 'email', 'pending', ?, ?, 'trip_request', ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM trip_requests WHERE id = ? AND tenant_key = ?)`).bind(jobId, input.tenantKey, `request-ack:${recordId}`, jobPayload, recordId, now, now, now, recordId, input.tenantKey),
    database.prepare("INSERT INTO async_jobs (id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'change_event','pending',?,?, 'trip_request',?,0,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM trip_requests WHERE id=?)").bind(mirrorJobId,input.tenantKey,`mirror:trip_request:${recordId}`,mirrorPayload,recordId,now,now,now,input.mirrorWrites?1:0,recordId),
    database.prepare("UPDATE idempotency_records SET status = 'completed', response_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM trip_requests WHERE id = ?)").bind(stored, now, idempotencyId, recordId),
  ]);
  if ((results[1].meta.changes ?? 0) === 0) return replay(request, env, context, database, context.actor.sub, "requests:create", keyHash);
  execution.waitUntil(Promise.all([publishJob(env, { id: jobId, shard: input.shard, tenantKey: input.tenantKey, type: "email" }),...(input.mirrorWrites?[publishJob(env,{id:mirrorJobId,shard:input.shard,tenantKey:input.tenantKey,type:"change_event"})]:[])]).then(()=>undefined));
  return success(request, env, context, data, { status: 201, jobs, consistencyToken:await primaryConsistencyToken(database,input.shard),headers:writeHeaders(results) });
}

export async function sendQuote(request: Request, env: Env, context: RequestContext, execution: ExecutionContext, quoteId: string): Promise<Response> {
  requireRoles(context.actor.role, ["owner", "admin", "agent"]);
  const { tenantKey: requestedTenant } = parseSchema(tenantOverrideSchema, await readJson<unknown>(request));
  const tenantKey = requestedTenant ?? context.tenantKey;
  if (tenantKey !== context.tenantKey && !canOverrideTenant(context.actor.role)) throw new ApiError(403, "TENANT_DENIED", "Tenant overrides are limited to travel-management roles");
  const route = await resolveTenantRoute(env, tenantKey, null);
  const database = shardDatabase(env, route.shard);
  const quote = await database.prepare(`SELECT q.id, q.quote_number, q.status, tr.contact_email, tr.contact_name
    FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id
    WHERE q.id = ? AND q.tenant_key = ? LIMIT 1`).bind(quoteId, tenantKey).first<{ id: string; quote_number: string; status: string; contact_email: string; contact_name: string }>();
  if (!quote) throw new ApiError(404, "QUOTE_NOT_FOUND", "The quote was not found");
  if (!["draft", "send_failed"].includes(quote.status)) throw new ApiError(409, "INVALID_QUOTE_STATE", "Only draft or failed quotes can be sent");
  const idempotencyKey = requireIdempotencyKey(request);
  const keyHash = await hashValue(idempotencyKey);
  const now = Date.now();
  const idempotencyId = crypto.randomUUID(); const auditId = crypto.randomUUID(); const jobId = crypto.randomUUID(); const mirrorJobId=crypto.randomUUID(); const mirrorWrites=Boolean(route.mirror_writes);
  const jobs: JobRef[] = [{ id: jobId, type: "email", status: "pending", pollUrl: jobUrl(jobId,tenantKey) },...(mirrorWrites?[{id:mirrorJobId,type:"change_event",status:"pending" as const,pollUrl:jobUrl(mirrorJobId,tenantKey)}]:[])];
  const data = { id: quote.id, quoteNumber: quote.quote_number, status: "sending", deliveryStatus: "pending" };
  const payload = JSON.stringify({ to: quote.contact_email, subject: `Your TVSE quote ${quote.quote_number}`, html: `<p>Hello ${escapeHtml(quote.contact_name)},</p><p>Your TVSE travel quote <strong>${escapeHtml(quote.quote_number)}</strong> is ready.</p>`, dedupeKey: `quote-send:${quote.id}` });
  const mirrorPayload=JSON.stringify({direction:"to_core",operation:"update",table:"quotes",row:{id:quote.id,status:"sending",sent_at:null,updated_at:now}});
  const results = await database.batch([
    database.prepare("INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)").bind(idempotencyId, context.actor.sub, `quotes:${quoteId}:send`, keyHash, now + 48 * 60 * 60_000, now, now),
    database.prepare("UPDATE quotes SET status = 'sending', delivery_status = 'pending', last_error = NULL, row_version = MAX(row_version + 1, ?), updated_at = ? WHERE id = ? AND tenant_key = ? AND status IN ('draft','send_failed') AND EXISTS (SELECT 1 FROM idempotency_records WHERE id = ?)").bind(now, now, quoteId, tenantKey, idempotencyId),
    database.prepare("INSERT INTO audit_events (id, tenant_key, actor_id, entity_type, entity_id, action, metadata_json, row_version, created_at) SELECT ?, ?, ?, 'quote', ?, 'send_queued', '{}', 1, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status = 'sending')").bind(auditId, tenantKey, context.actor.sub, quoteId, now, quoteId),
    database.prepare("INSERT INTO async_jobs (id, tenant_key, type, state, dedupe_key, payload_json, entity_type, entity_id, attempts, available_at, created_at, updated_at) SELECT ?, ?, 'email', 'pending', ?, ?, 'quote_delivery', ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status = 'sending')").bind(jobId, tenantKey, `quote-send:${quote.id}`, payload, quoteId, now, now, now, quoteId),
    database.prepare("INSERT INTO async_jobs (id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'change_event','pending',?,?,'quote',?,0,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM quotes WHERE id=? AND status='sending')").bind(mirrorJobId,tenantKey,`mirror:quote-sending:${quote.id}`,mirrorPayload,quote.id,now,now,now,mirrorWrites?1:0,quote.id),
    database.prepare("UPDATE idempotency_records SET status = 'completed', response_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM async_jobs WHERE id = ?)").bind(JSON.stringify({ data, jobs }), now, idempotencyId, jobId),
  ]);
  if ((results[1].meta.changes ?? 0) === 0) return replay(request, env, context, database, context.actor.sub, `quotes:${quoteId}:send`, keyHash);
  execution.waitUntil(Promise.all([publishJob(env, { id: jobId, shard: route.shard, tenantKey, type: "email" }),...(mirrorWrites?[publishJob(env,{id:mirrorJobId,shard:route.shard,tenantKey,type:"change_event"})]:[])]).then(()=>undefined));
  return success(request, env, context, data, { status: 202, jobs, consistencyToken:await primaryConsistencyToken(database,route.shard),headers:writeHeaders(results) });
}

export async function createMessage(request: Request, env: Env, context: RequestContext, execution: ExecutionContext, ticketId: string): Promise<Response> {
  if (!canAccessResource(context.actor.role, "support")) throw new ApiError(403, "ROLE_DENIED", "You do not have permission to access support conversations");
  const body = parseSchema(supportMessageSchema, await readJson<unknown>(request));
  const messageBody = body.message;
  const tenantKey = body.tenantKey ?? context.tenantKey;
  if (tenantKey !== context.tenantKey && !canOverrideTenant(context.actor.role)) throw new ApiError(403, "TENANT_DENIED", "The requested tenant is outside your account");
  if (body.internal && !["owner", "admin", "agent"].includes(context.actor.role)) throw new ApiError(403, "INTERNAL_MESSAGE_DENIED", "Only support staff may create internal messages");
  const route = await resolveTenantRoute(env, tenantKey, null);
  const database = shardDatabase(env, route.shard);
  const ticket = await database.prepare("SELECT id FROM support_tickets WHERE id = ? AND tenant_key = ?").bind(ticketId, tenantKey).first();
  if (!ticket) throw new ApiError(404, "TICKET_NOT_FOUND", "The support conversation was not found");
  const keyHash = await hashValue(requireIdempotencyKey(request)); const now = Date.now();
  const idempotencyId = crypto.randomUUID(); const id = crypto.randomUUID(); const auditId = crypto.randomUUID();const mirrorJobId=crypto.randomUUID();const mirrorWrites=Boolean(route.mirror_writes);const internal=body.internal===true&&["owner","admin","agent"].includes(context.actor.role);const jobs:JobRef[]=mirrorWrites?[{id:mirrorJobId,type:"change_event",status:"pending",pollUrl:jobUrl(mirrorJobId,tenantKey)}]:[];
  const data = { id, ticketId, createdAt: now };
  const mirrorPayload=JSON.stringify({direction:"to_core",table:"messages",row:{id,ticket_id:ticketId,sender_id:context.actor.sub,body:messageBody,internal:internal?1:0,created_at:now}});
  const results = await database.batch([
    database.prepare("INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)").bind(idempotencyId, context.actor.sub, `support:${ticketId}:messages`, keyHash, now + 48 * 60 * 60_000, now, now),
    database.prepare("INSERT INTO messages (id, tenant_key, ticket_id, sender_id, body, internal, row_version, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM idempotency_records WHERE id = ?)").bind(id, tenantKey, ticketId, context.actor.sub, messageBody, internal ? 1 : 0, now, now, idempotencyId),
    database.prepare("INSERT INTO audit_events (id, tenant_key, actor_id, entity_type, entity_id, action, metadata_json, row_version, created_at) SELECT ?, ?, ?, 'support_ticket', ?, 'message_created', '{}', 1, ? WHERE EXISTS (SELECT 1 FROM messages WHERE id = ?)").bind(auditId, tenantKey, context.actor.sub, ticketId, now, id),
    database.prepare("INSERT INTO async_jobs(id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'change_event','pending',?,?,'message',?,0,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM messages WHERE id=?)").bind(mirrorJobId,tenantKey,`mirror:message:${id}`,mirrorPayload,id,now,now,now,mirrorWrites?1:0,id),
    database.prepare("UPDATE idempotency_records SET status = 'completed', response_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM messages WHERE id = ?)").bind(JSON.stringify({ data, jobs }), now, idempotencyId, id),
  ]);
  if ((results[1].meta.changes ?? 0) === 0) return replay(request, env, context, database, context.actor.sub, `support:${ticketId}:messages`, keyHash);
  if(mirrorWrites)execution.waitUntil(publishJob(env,{id:mirrorJobId,shard:route.shard,tenantKey,type:"change_event"}));
  return success(request, env, context, data, { status: 201, jobs, consistencyToken:await primaryConsistencyToken(database,route.shard),headers:writeHeaders(results) });
}

export async function recordPayment(request: Request, env: Env, context: RequestContext, execution: ExecutionContext, invoiceId: string): Promise<Response> {
  requireRoles(context.actor.role, ["owner", "admin", "finance"]);
  const body = parseSchema(paymentSchema, await readJson<unknown>(request));
  const amountMinor = body.amountMinor;
  const method = body.method;
  const reference = body.reference || null;
  const tenantKey = body.tenantKey ?? context.tenantKey;
  if (tenantKey !== context.tenantKey && !canOverrideTenant(context.actor.role)) throw new ApiError(403, "TENANT_DENIED", "Tenant overrides are limited to travel-management roles");
  const route = await resolveTenantRoute(env, tenantKey, null); const database = shardDatabase(env, route.shard);
  const invoice = await database.prepare("SELECT id, invoice_number, currency, due_minor, status FROM invoices WHERE id = ? AND tenant_key = ? LIMIT 1").bind(invoiceId, tenantKey).first<{ id: string; invoice_number: string; currency: string; due_minor: number; status: string }>();
  if (!invoice) throw new ApiError(404, "INVOICE_NOT_FOUND", "The invoice was not found");
  if (["paid", "void"].includes(invoice.status) || amountMinor > invoice.due_minor) throw new ApiError(409, "PAYMENT_EXCEEDS_BALANCE", "The payment exceeds the current invoice balance");
  const receiptNumber = await allocateDocumentNumber(env.DOCUMENT_NUMBERS, "receipt", "TVSE-RCT");
  const keyHash = await hashValue(requireIdempotencyKey(request)); const now = Date.now();
  const idempotencyId = crypto.randomUUID(); const paymentId = crypto.randomUUID(); const auditId = crypto.randomUUID(); const pdfJobId = crypto.randomUUID(); const emailJobId = crypto.randomUUID();const mirrorJobId=crypto.randomUUID();const mirrorWrites=Boolean(route.mirror_writes);
  const jobs: JobRef[] = [
    { id: pdfJobId, type: "receipt", status: "pending", pollUrl: jobUrl(pdfJobId,tenantKey) },
    { id: emailJobId, type: "email", status: "pending", pollUrl: jobUrl(emailJobId,tenantKey) },
    ...(mirrorWrites?[{id:mirrorJobId,type:"change_event",status:"pending" as const,pollUrl:jobUrl(mirrorJobId,tenantKey)}]:[]),
  ];
  const data = { id: paymentId, receiptNumber, invoiceId, amountMinor, currency: invoice.currency, pdfStatus: "pending", deliveryStatus: "pending" };
  const pdfPayload = JSON.stringify({ title: "Payment receipt", reference: receiptNumber, lines: [`Invoice: ${invoice.invoice_number}`, `Amount: ${amountMinor} ${invoice.currency}`, `Method: ${method}`, ...(reference ? [`Reference: ${reference}`] : [])] });
  const emailPayload = JSON.stringify({ to: context.actor.email, subject: `TVSE receipt ${receiptNumber}`, html: `<p>Payment received for invoice <strong>${escapeHtml(invoice.invoice_number)}</strong>.</p><p>Your receipt ${escapeHtml(receiptNumber)} is being prepared.</p>`, dedupeKey: `receipt-email:${paymentId}` });
  const mirrorPayload=JSON.stringify({direction:"to_core",table:"payments",row:{id:paymentId,receipt_number:receiptNumber,invoice_id:invoiceId,amount_minor:amountMinor,currency:invoice.currency,method,reference,paid_at:body.paidAt??now,recorded_by:context.actor.sub,receipt_key:null,note:body.note||null,created_at:now}});
  let results;
  try {
    results = await database.batch([
      database.prepare("INSERT OR IGNORE INTO idempotency_records (id, actor_id, scope, key_hash, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)").bind(idempotencyId, context.actor.sub, `invoices:${invoiceId}:payments`, keyHash, now + 48 * 60 * 60_000, now, now),
      database.prepare(`INSERT INTO payments (id, tenant_key, receipt_number, invoice_id, amount_minor, currency, method, reference, paid_at, recorded_by, note, pdf_status, delivery_status, row_version, created_at)
        SELECT ?, ?, ?, id, ?, currency, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ? FROM invoices
        WHERE id = ? AND tenant_key = ? AND status NOT IN ('paid','void') AND due_minor >= ? AND EXISTS (SELECT 1 FROM idempotency_records WHERE id = ?)`).bind(paymentId, tenantKey, receiptNumber, amountMinor, method, reference, body.paidAt ?? now, context.actor.sub, body.note || null, now, now, invoiceId, tenantKey, amountMinor, idempotencyId),
      database.prepare("UPDATE invoices SET paid_minor = paid_minor + ?, due_minor = due_minor - ?, status = CASE WHEN due_minor - ? = 0 THEN 'paid' ELSE 'partially_paid' END, row_version = MAX(row_version + 1, ?), updated_at = ? WHERE id = ? AND tenant_key = ? AND EXISTS (SELECT 1 FROM payments WHERE id = ?)").bind(amountMinor, amountMinor, amountMinor, now, now, invoiceId, tenantKey, paymentId),
      database.prepare("INSERT INTO audit_events (id, tenant_key, actor_id, entity_type, entity_id, action, metadata_json, row_version, created_at) SELECT ?, ?, ?, 'invoice', ?, 'payment_recorded', ?, 1, ? WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?)").bind(auditId, tenantKey, context.actor.sub, invoiceId, JSON.stringify({ paymentId, amountMinor, currency: invoice.currency }), now, paymentId),
      database.prepare("INSERT INTO async_jobs (id, tenant_key, type, state, dedupe_key, payload_json, entity_type, entity_id, attempts, available_at, created_at, updated_at) SELECT ?, ?, 'receipt', 'pending', ?, ?, 'receipt', ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?)").bind(pdfJobId, tenantKey, `receipt-pdf:${paymentId}`, pdfPayload, paymentId, now, now, now, paymentId),
      database.prepare("INSERT INTO async_jobs (id, tenant_key, type, state, dedupe_key, payload_json, entity_type, entity_id, attempts, available_at, created_at, updated_at) SELECT ?, ?, 'email', 'pending', ?, ?, 'receipt_delivery', ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM payments WHERE id = ?)").bind(emailJobId, tenantKey, `receipt-email:${paymentId}`, emailPayload, paymentId, now, now, now, paymentId),
      database.prepare("INSERT INTO async_jobs (id,tenant_key,type,state,dedupe_key,payload_json,entity_type,entity_id,attempts,available_at,created_at,updated_at) SELECT ?,?,'change_event','pending',?,?,'payment',?,0,?,?,? WHERE ?=1 AND EXISTS(SELECT 1 FROM payments WHERE id=?)").bind(mirrorJobId,tenantKey,`mirror:payment:${paymentId}`,mirrorPayload,paymentId,now,now,now,mirrorWrites?1:0,paymentId),
      database.prepare("UPDATE idempotency_records SET status = 'completed', response_json = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM payments WHERE id = ?)").bind(JSON.stringify({ data, jobs }), now, idempotencyId, paymentId),
    ]);
  } catch (error) {
    if (reference && String(error).toLowerCase().includes("unique")) throw new ApiError(409, "DUPLICATE_PAYMENT", "This provider payment reference has already been recorded");
    throw error;
  }
  if ((results[1].meta.changes ?? 0) === 0) {
    await database.prepare("DELETE FROM idempotency_records WHERE id = ? AND status = 'pending'").bind(idempotencyId).run();
    const existing = await database.prepare("SELECT response_json FROM idempotency_records WHERE actor_id = ? AND scope = ? AND key_hash = ? AND status = 'completed'").bind(context.actor.sub, `invoices:${invoiceId}:payments`, keyHash).first<{ response_json: string }>();
    if (existing) return replayPayload(request, env, context, existing.response_json);
    throw new ApiError(409, "PAYMENT_RACE", "The invoice balance changed. Refresh and try again.");
  }
  execution.waitUntil(Promise.all([
    publishJob(env, { id: pdfJobId, shard: route.shard, tenantKey, type: "receipt" }),
    publishJob(env, { id: emailJobId, shard: route.shard, tenantKey, type: "email" }),
    ...(mirrorWrites?[publishJob(env,{id:mirrorJobId,shard:route.shard,tenantKey,type:"change_event"})]:[]),
  ]).then(() => undefined));
  return success(request, env, context, data, { status: 201, jobs, consistencyToken:await primaryConsistencyToken(database,route.shard),headers:writeHeaders(results) });
}

async function replay(request: Request, env: Env, context: RequestContext, database: D1Database, actorId: string, scope: string, keyHash: string): Promise<Response> {
  const record = await database.prepare("SELECT status, response_json FROM idempotency_records WHERE actor_id = ? AND scope = ? AND key_hash = ? LIMIT 1").bind(actorId, scope, keyHash).first<{ status: string; response_json: string | null }>();
  if (record?.status === "completed" && record.response_json) return replayPayload(request, env, context, record.response_json);
  throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "A request with this idempotency key is still processing");
}

function replayPayload(request: Request, env: Env, context: RequestContext, value: string): Response {
  const stored = JSON.parse(value) as { data: unknown; jobs?: unknown[] };
  return success(request, env, context, stored.data, { jobs: stored.jobs ?? [], headers: { "Idempotent-Replayed": "true" } });
}

function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }

function writeHeaders(results:D1Result[]):HeadersInit{return{"X-TVSE-D1-Rows-Written":String(results.reduce((sum,result)=>sum+Number(result.meta.changes??0),0)),"X-TVSE-D1-Rows-Read":String(results.reduce((sum,result)=>sum+Number(result.meta.rows_read??0),0))};}

export function actorMayUseTenant(role: Role, actorTenant: string, requestedTenant: string): boolean { return canOverrideTenant(role) || actorTenant === requestedTenant; }

function parseSchema<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) fields[String(issue.path[0] ?? "body")] = issue.message;
  throw new ApiError(422, "VALIDATION_FAILED", "Please check the submitted information", fields);
}
