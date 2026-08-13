import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { shardDatabase } from "./database";
import { logEvent } from "./http";
import type { Env, JobMessage, ShardNumber } from "./types";

const RETRY_DELAYS = [60, 300, 900, 3_600, 3_600, 3_600, 3_600, 3_600] as const;

type JobRow = {
  id: string;
  tenant_key: string;
  type: JobMessage["type"];
  state: string;
  payload_json: string;
  entity_type: string | null;
  entity_id: string | null;
  attempts: number;
  available_at: number;
};

export async function publishJob(env: Env, message: JobMessage): Promise<void> {
  const database = shardDatabase(env, message.shard);
  try {
    await env.JOBS.send(message);
    await database.prepare("UPDATE async_jobs SET state = 'queued', updated_at = ? WHERE id = ? AND state IN ('pending','retryable')").bind(Date.now(), message.id).run();
  } catch (error) {
    logEvent({ event: "queue_publish_failed", jobId: message.id, shard: message.shard, jobOutcome: "publish_failed", error: safeError(error) });
    // The recovery cron republishes pending jobs.
  }
}

export async function consumeJobs(batch: MessageBatch<JobMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    try {
      const outcome = await executeJob(message.body, env);
      if (outcome === "already-complete") message.ack();
      else message.ack();
    } catch (error) {
      const database = shardDatabase(env, message.body.shard);
      const current = await database.prepare("SELECT attempts FROM async_jobs WHERE id = ?").bind(message.body.id).first<{ attempts: number }>();
      const attempts = current?.attempts ?? 8;
      await markEntityFailure(database, env, message.body.id, safeError(error),attempts>=8);
      if (attempts >= 8) {
        await database.prepare("UPDATE async_jobs SET state = 'dead', lease_owner = NULL, lease_expires_at = NULL, last_error = ?, updated_at = ? WHERE id = ?").bind(safeError(error), Date.now(), message.body.id).run();
        await env.JOBS_DLQ.send({ ...message.body, retryCount: attempts });
        logEvent({ event: "job_dead", jobId: message.body.id, shard: message.body.shard, retryCount: attempts, jobOutcome: "dead", alert: true, error: safeError(error) });
        message.ack();
      } else {
        const delaySeconds = RETRY_DELAYS[Math.max(0, attempts - 1)] ?? 3_600;
        const availableAt = Date.now() + delaySeconds * 1_000;
        await database.prepare("UPDATE async_jobs SET state = 'retryable', available_at = ?, lease_owner = NULL, lease_expires_at = NULL, last_error = ?, updated_at = ? WHERE id = ?").bind(availableAt, safeError(error), Date.now(), message.body.id).run();
        logEvent({ event: "job_retry", jobId: message.body.id, shard: message.body.shard, retryCount: attempts, jobOutcome: "retryable", delaySeconds, error: safeError(error) });
        message.retry({ delaySeconds });
      }
    }
  }
}

async function executeJob(message: JobMessage, env: Env): Promise<"completed" | "already-complete"> {
  const database = shardDatabase(env, message.shard);
  const leaseOwner = crypto.randomUUID();
  const now = Date.now();
  const claimed = await database.prepare(`UPDATE async_jobs SET state = 'running', lease_owner = ?, lease_expires_at = ?, attempts = attempts + 1, updated_at = ?
    WHERE id = ? AND (state IN ('pending','queued','retryable') OR (state = 'running' AND lease_expires_at < ?)) AND available_at <= ?`)
    .bind(leaseOwner, now + 5 * 60_000, now, message.id, now, now).run();
  if ((claimed.meta.changes ?? 0) === 0) return "already-complete";
  const job = await database.prepare("SELECT id, tenant_key, type, state, payload_json, entity_type, entity_id, attempts, available_at FROM async_jobs WHERE id = ? AND lease_owner = ?").bind(message.id, leaseOwner).first<JobRow>();
  if (!job) return "already-complete";
  const payload = JSON.parse(job.payload_json) as Record<string, unknown>;
  let result: Record<string, unknown> = {};
  if (job.type === "email") {
    result = await sendEmail(payload, env);
    if (job.entity_type === "quote_delivery" && job.entity_id) {const sentAt=Date.now();await database.prepare("UPDATE quotes SET status = 'sent', delivery_status = 'sent', sent_at = ?, last_error = NULL, updated_at = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ? AND status = 'sending'").bind(sentAt,sentAt,sentAt,job.entity_id,job.tenant_key).run();await env.CORE_DB.prepare("UPDATE quotes SET status='sent',sent_at=?,updated_at=? WHERE id=? AND updated_at<=?").bind(sentAt,sentAt,job.entity_id,sentAt).run();}
    if (job.entity_type === "receipt_delivery" && job.entity_id) {const deliveredAt=Date.now();await database.prepare("UPDATE payments SET delivery_status = 'sent', last_error = NULL, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?").bind(deliveredAt,job.entity_id, job.tenant_key).run();}
  }
  else if (["pdf", "receipt", "itinerary"].includes(job.type)) result = await createPdf(job, payload, env, message.shard);
  else if (job.type === "webhook") result = await sendWebhook(payload);
  else if(job.type==="change_event")result=await applyReverseMirror(payload,env);
  else if (job.type === "archive" || job.type === "cleanup") result = { accepted: true };
  const completedAt = Date.now();
  await database.prepare("UPDATE async_jobs SET state = 'completed', result_json = ?, lease_owner = NULL, lease_expires_at = NULL, completed_at = ?, updated_at = ?, last_error = NULL WHERE id = ? AND lease_owner = ?")
    .bind(JSON.stringify(result), completedAt, completedAt, job.id, leaseOwner).run();
  logEvent({ event: "job_completed", jobId: job.id, shard: message.shard, tenant: job.tenant_key, queueLagMs: Math.max(0, now - job.available_at), retryCount: job.attempts, jobOutcome: "completed" });
  return "completed";
}

async function sendEmail(payload: Record<string, unknown>, env: Env): Promise<Record<string, unknown>> {
  if (!env.RESEND_API_KEY) throw new Error("Resend is not configured");
  const to = String(payload.to ?? "");
  const subject = String(payload.subject ?? "TVSE travel update");
  const html = String(payload.html ?? "");
  if (!to || !html) throw new Error("Email job is missing destination or content");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": String(payload.dedupeKey ?? crypto.randomUUID()) },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL ?? "TVSE Travel <journeys@tvsetravel.com>", to: [to], subject, html }),
  });
  const result: Record<string, unknown> = await response.json<Record<string, unknown>>().catch(() => ({}));
  if (!response.ok) throw new Error(`Email provider rejected the request (${response.status})`);
  return { providerId: result.id ?? null, accepted: true };
}

async function createPdf(job: JobRow, payload: Record<string, unknown>, env: Env, shard: ShardNumber): Promise<Record<string, unknown>> {
  const document = await PDFDocument.create();
  const page = document.addPage([595, 842]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  page.drawText("TVSE Travel Agency Ltd", { x: 48, y: 786, size: 18, font: bold, color: rgb(0.08, 0.24, 0.2) });
  page.drawText(String(payload.title ?? "Travel document"), { x: 48, y: 746, size: 22, font: bold });
  const lines = Array.isArray(payload.lines) ? payload.lines.slice(0, 30).map(String) : [];
  lines.forEach((line, index) => page.drawText(line.slice(0, 95), { x: 48, y: 706 - index * 20, size: 10, font }));
  page.drawText(`Reference: ${String(payload.reference ?? job.entity_id ?? job.id)}`, { x: 48, y: 70, size: 9, font });
  const bytes = await document.save();
  const key = `private/${job.tenant_key.replaceAll(":", "/")}/${job.type}/${job.entity_id ?? job.id}.pdf`;
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { shard: String(shard), jobId: job.id } });
  if (job.entity_type && job.entity_id) {
    const targets: Record<string, { table: string; key: string }> = {
      invoice: { table: "invoices", key: "pdf_key" },
      receipt: { table: "payments", key: "receipt_key" },
      itinerary: { table: "bookings", key: "itinerary_pdf_key" },
    };
    const target = targets[job.entity_type];
    const generatedAt=Date.now();
    if (target) await shardDatabase(env, shard).prepare(`UPDATE ${target.table} SET ${target.key} = ?, pdf_status = 'completed', last_error = NULL, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?`).bind(key,generatedAt, job.entity_id, job.tenant_key).run();
    const coreTarget:Record<string,{table:string;key:string}>={invoice:{table:"invoices",key:"pdf_key"},receipt:{table:"payments",key:"receipt_key"},itinerary:{table:"bookings",key:"itinerary_pdf_key"}};const core=coreTarget[job.entity_type];if(core)await env.CORE_DB.prepare(`UPDATE ${core.table} SET ${core.key}=? WHERE id=?`).bind(key,job.entity_id).run();
  }
  return { r2Key: key, size: bytes.byteLength };
}

async function sendWebhook(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = String(payload.url ?? "");
  if (!url.startsWith("https://")) throw new Error("Webhook URL must use HTTPS");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": String(payload.dedupeKey ?? "") }, body: JSON.stringify(payload.body ?? {}) });
  if (!response.ok) throw new Error(`Webhook endpoint returned ${response.status}`);
  return { status: response.status };
}

async function applyReverseMirror(payload:Record<string,unknown>,env:Env):Promise<Record<string,unknown>>{
  if(payload.direction!=="to_core"||typeof payload.table!=="string"||!payload.row||typeof payload.row!=="object")throw new Error("Invalid reverse-mirror payload");
  if(payload.operation==="update"){
    const changes=payload.row as Record<string,unknown>;const updateFields:Record<string,readonly string[]>={quotes:["status","sent_at","updated_at"],invoices:["status","paid_minor","due_minor","updated_at"],payments:["receipt_key"]};const fields=updateFields[payload.table]?.filter((field)=>Object.hasOwn(changes,field));if(!fields?.length||typeof changes.id!=="string")throw new Error("Unsupported reverse-mirror update");
    const hasVersion=fields.includes("updated_at")&&Number.isFinite(Number(changes.updated_at));
    await env.CORE_DB.prepare(`UPDATE ${payload.table} SET ${fields.map((field)=>`${field}=?`).join(",")} WHERE id=?${hasVersion?" AND updated_at<=?":""}`).bind(...fields.map((field)=>changes[field]??null),changes.id,...(hasVersion?[changes.updated_at]:[])).run();return{mirrored:true,table:payload.table,id:changes.id};
  }
  const allowed:Record<string,readonly string[]>={
    trip_requests:["id","request_number","user_id","organization_id","kind","status","approval_status","approver_id","assigned_agent_id","contact_name","contact_email","contact_phone","origin","destination","departure_date","return_date","traveler_count","budget_minor","currency","interests_json","notes","source","source_path","marketing_context_json","consent_at","consent_version","created_at","updated_at"],
    leads:["id","user_id","type","status","name","email","phone","company","message","source","source_path","marketing_context_json","consent_at","consent_version","assigned_agent_id","converted_trip_request_id","created_at","updated_at"],
    messages:["id","ticket_id","sender_id","body","internal","created_at"],
    payments:["id","receipt_number","invoice_id","amount_minor","currency","method","reference","paid_at","recorded_by","receipt_key","note","created_at"],
  };
  const fields=allowed[payload.table];if(!fields)throw new Error("Unsupported reverse-mirror table");const row=payload.row as Record<string,unknown>;
  if(payload.table==="payments"){
    await env.CORE_DB.batch([
      env.CORE_DB.prepare(`INSERT OR IGNORE INTO payments (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`).bind(...fields.map((field)=>row[field]??null)),
      env.CORE_DB.prepare("UPDATE invoices SET paid_minor=MIN(total_minor,COALESCE((SELECT SUM(amount_minor) FROM payments WHERE invoice_id=invoices.id),0)),due_minor=MAX(0,total_minor-COALESCE((SELECT SUM(amount_minor) FROM payments WHERE invoice_id=invoices.id),0)),status=CASE WHEN COALESCE((SELECT SUM(amount_minor) FROM payments WHERE invoice_id=invoices.id),0)>=total_minor THEN 'paid' WHEN COALESCE((SELECT SUM(amount_minor) FROM payments WHERE invoice_id=invoices.id),0)>0 THEN 'partially_paid' ELSE status END,updated_at=? WHERE id=?").bind(Date.now(),row.invoice_id),
    ]);return{mirrored:true,table:payload.table,id:row.id};
  }
  const updates=fields.filter((field)=>field!=="id").map((field)=>`${field}=excluded.${field}`).join(",");
  const freshness=fields.includes("updated_at")?` WHERE excluded.updated_at >= ${payload.table}.updated_at`:"";
  await env.CORE_DB.prepare(`INSERT INTO ${payload.table} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")}) ON CONFLICT(id) DO UPDATE SET ${updates}${freshness}`).bind(...fields.map((field)=>row[field]??null)).run();
  return {mirrored:true,table:payload.table,id:row.id};
}

export async function recoverJobs(env: Env): Promise<void> {
  const now = Date.now();
  for (const shard of [0, 1, 2, 3] as ShardNumber[]) {
    const database = shardDatabase(env, shard);
    await database.prepare("UPDATE async_jobs SET state = 'retryable', lease_owner = NULL, lease_expires_at = NULL, available_at = ?, updated_at = ? WHERE state = 'running' AND lease_expires_at < ?").bind(now, now, now).run();
    const [pending,retries]=await database.batch([
      database.prepare("SELECT id, tenant_key, type, available_at FROM async_jobs WHERE state = 'pending' AND available_at <= ? ORDER BY available_at LIMIT 100").bind(now),
      database.prepare("SELECT id, tenant_key, type, available_at FROM async_jobs WHERE state = 'retryable' AND available_at <= ? ORDER BY available_at LIMIT 100").bind(now),
    ]);
    const jobs=([...pending.results,...retries.results] as Array<{id:string;tenant_key:string;type:JobMessage["type"];available_at:number}>).sort((left,right)=>Number(left.available_at)-Number(right.available_at)).slice(0,100);
    for (const job of jobs) await publishJob(env, { id: job.id, shard, tenantKey: job.tenant_key, type: job.type });
  }
}

function safeError(error: unknown): string { return error instanceof Error ? error.message.slice(0, 500) : "Unknown job failure"; }

async function markEntityFailure(database: D1Database, env: Env, jobId: string, error: string,final:boolean): Promise<void> {
  const job = await database.prepare("SELECT entity_type, entity_id, tenant_key FROM async_jobs WHERE id = ?").bind(jobId).first<{ entity_type: string | null; entity_id: string | null; tenant_key: string }>();
  if (!job?.entity_id) return;
  if (job.entity_type === "quote_delivery") {
    const now=Date.now();
    await database.prepare("UPDATE quotes SET status = CASE WHEN ?=1 THEN 'send_failed' ELSE 'sending' END, delivery_status = CASE WHEN ?=1 THEN 'failed' ELSE 'retrying' END, last_error = ?, updated_at = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?").bind(final?1:0,final?1:0,error,now,now,job.entity_id,job.tenant_key).run();
    if(final)await env.CORE_DB.prepare("UPDATE quotes SET status='send_failed',updated_at=? WHERE id=? AND updated_at<=?").bind(now,job.entity_id,now).run();
  }
  if (job.entity_type === "receipt_delivery") {const now=Date.now();await database.prepare("UPDATE payments SET delivery_status = ?, last_error = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?").bind(final?"failed":"retrying",error,now, job.entity_id, job.tenant_key).run();}
  const entityType = job.entity_type;
  if (entityType && ["invoice", "receipt", "itinerary"].includes(entityType)) {
    const target: Record<string, string> = { invoice: "invoices", receipt: "payments", itinerary: "bookings" };
    const now=Date.now();await database.prepare(`UPDATE ${target[entityType]} SET pdf_status = ?, last_error = ?, row_version = MAX(row_version + 1, ?) WHERE id = ? AND tenant_key = ?`).bind(final?"failed":"retrying",error,now,job.entity_id,job.tenant_key).run();
  }
}
