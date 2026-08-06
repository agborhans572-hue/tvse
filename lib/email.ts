import { getD1 } from "../db";
import { createId } from "./ids";
import { runtimeEnv } from "./runtime";

type EmailInput = { to: string; subject: string; html: string; template: string; userId?: string | null; data?: Record<string, unknown> };

export async function sendTransactionalEmail(input: EmailInput): Promise<{ id: string; status: "pending" | "sent" | "failed" }> {
  const db = getD1();
  const id = createId("ntf");
  const now = Date.now();
  await db.prepare(`INSERT INTO notifications (id, user_id, channel, template, destination, status, payload_json, attempts, created_at) VALUES (?, ?, 'email', ?, ?, 'pending', ?, 0, ?)`)
    .bind(id, input.userId ?? null, input.template, input.to.toLowerCase(), JSON.stringify({ subject: input.subject, ...input.data }), now).run();

  if (!runtimeEnv.RESEND_API_KEY || !runtimeEnv.RESEND_FROM_EMAIL) {
    await db.prepare("UPDATE notifications SET last_error = ? WHERE id = ?").bind("Email delivery is not configured; message retained in the outbox.", id).run();
    return { id, status: "pending" };
  }

  try {
    await db.prepare("UPDATE notifications SET status = 'sending', attempts = attempts + 1 WHERE id = ?").bind(id).run();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${runtimeEnv.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify({ from: runtimeEnv.RESEND_FROM_EMAIL, to: [input.to], subject: input.subject, html: input.html }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok || !payload.id) throw new Error(payload.message || `Resend returned ${response.status}`);
    await db.prepare("UPDATE notifications SET status = 'sent', provider_id = ?, sent_at = ? WHERE id = ?").bind(payload.id, Date.now(), id).run();
    return { id, status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed";
    await db.prepare("UPDATE notifications SET status = 'failed', last_error = ? WHERE id = ?").bind(message, id).run();
    return { id, status: "failed" };
  }
}

function shell(title: string, body: string, actionLabel?: string, actionUrl?: string) {
  const action = actionLabel && actionUrl ? `<p style="margin:30px 0"><a href="${escapeHtml(actionUrl)}" style="background:#5734ff;color:#fff;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:700">${escapeHtml(actionLabel)} →</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f2f5;font-family:Arial,sans-serif;color:#121212"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="background:#fff;border-radius:24px;padding:38px"><p style="color:#ff4f00;font-weight:800;letter-spacing:.12em;font-size:11px">TVSE TRAVEL</p><h1 style="font-size:32px;line-height:1.05">${escapeHtml(title)}</h1>${body}${action}<p style="margin-top:36px;color:#666;font-size:12px;line-height:1.6">TVSE Travel Agency Ltd · Nairobi, Kenya<br>This message relates to a TVSE travel request or account.</p></div></div></body></html>`;
}

export async function sendMagicLinkEmail(email: string, link: string, portal: string) {
  return sendTransactionalEmail({
    to: email, template: "magic_link", subject: "Your secure TVSE sign-in link",
    html: shell("Your TVSE journey is one click away", `<p style="line-height:1.65">Use this secure, single-use link to open your ${escapeHtml(portal)} workspace. It expires in 15 minutes.</p>`, "Open TVSE securely", link),
    data: { portal },
  });
}

export async function sendTripRequestEmail(email: string, name: string, requestNumber: string, portalLink: string) {
  return sendTransactionalEmail({
    to: email, template: "trip_request_received", subject: `${requestNumber}: TVSE has your travel brief`,
    html: shell("We have your travel brief", `<p style="line-height:1.65">Hello ${escapeHtml(name)}, thank you for planning with TVSE. Your reference is <strong>${escapeHtml(requestNumber)}</strong>. A specialist will review the details and prepare the next step.</p>`, "View your request", portalLink),
    data: { requestNumber },
  });
}

export async function sendQuoteEmail(email: string, quoteNumber: string, total: string, link: string) {
  return sendTransactionalEmail({ to: email, template: "quote_sent", subject: `${quoteNumber}: your TVSE proposal is ready`, html: shell("Your travel proposal is ready", `<p style="line-height:1.65">TVSE has prepared quote <strong>${escapeHtml(quoteNumber)}</strong> with a total of <strong>${escapeHtml(total)}</strong>. Review every detail, ask a question or approve it securely.</p>`, "Review proposal", link), data: { quoteNumber } });
}

export async function sendGenericUpdate(email: string, subject: string, title: string, message: string, link?: string) {
  return sendTransactionalEmail({ to: email, template: "travel_update", subject, html: shell(title, `<p style="line-height:1.65">${escapeHtml(message)}</p>`, link ? "Open TVSE" : undefined, link), data: { title } });
}

export async function retryNotification(id: string) {
  const db = getD1();
  const row = await db.prepare("SELECT destination, template, payload_json FROM notifications WHERE id = ? AND status IN ('pending','failed')").bind(id).first<{ destination: string; template: string; payload_json: string }>();
  if (!row) throw new Error("Notification is not retryable");
  const data = JSON.parse(row.payload_json || "{}") as { subject?: string; message?: string };
  return sendTransactionalEmail({ to: row.destination, template: `${row.template}_retry`, subject: data.subject || "TVSE travel update", html: shell("TVSE travel update", `<p>${escapeHtml(data.message || "There is an update in your TVSE workspace.")}</p>`) });
}

export async function verifyResendWebhook(body: string, headers: Headers): Promise<boolean> {
  const secret = runtimeEnv.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  let encoded = ""; signature.forEach((byte) => { encoded += String.fromCharCode(byte); });
  const expected = btoa(encoded);
  return signatures.split(" ").some((item) => item.startsWith("v1,") && timingSafeEqual(item.slice(3), expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0; for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char); }
