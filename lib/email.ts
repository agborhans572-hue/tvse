import { getD1 } from "../db";
import { createId } from "./ids";
import { configuredAdminEmails, publicBaseUrl, runtimeEnv } from "./runtime";
import { verifyResendSignature } from "./resend-signature";

type EmailInput = { to: string; subject: string; html: string; template: string; userId?: string | null; data?: Record<string, unknown>; dedupeKey?: string };

type NotificationStatus = "pending" | "sending" | "sent" | "delivered" | "bounced" | "failed";
export async function sendTransactionalEmail(input: EmailInput): Promise<{ id: string; status: NotificationStatus }> {
  const db = getD1();
  const id = createId("ntf");
  const now = Date.now();
  const inserted = await db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, channel, template, destination, status, payload_json, dedupe_key, attempts, created_at) VALUES (?, ?, 'email', ?, ?, 'pending', ?, ?, 0, ?)`)
    .bind(id, input.userId ?? null, input.template, input.to.toLowerCase(), JSON.stringify({ subject: input.subject, html: input.html, ...input.data }), input.dedupeKey ?? null, now).run();
  if ((inserted.meta?.changes ?? 0) !== 1 && input.dedupeKey) {
    const existing = await db.prepare("SELECT id, status FROM notifications WHERE dedupe_key=?").bind(input.dedupeKey).first<{ id: string; status: NotificationStatus }>();
    if (existing) return existing;
  }

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
  const logo = `${publicBaseUrl()}/tvse-travel-agency-ltd-logo-transparent.png`;
  return `<!doctype html><html><body style="margin:0;background:#f4f2f5;font-family:Arial,sans-serif;color:#121212"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="background:#fff;border-radius:24px;padding:38px"><img src="${escapeHtml(logo)}" alt="TVSE Travel Agency Ltd" width="210" style="display:block;max-width:100%;height:auto;margin-bottom:24px"><h1 style="font-size:32px;line-height:1.05">${escapeHtml(title)}</h1>${body}${action}<p style="margin-top:36px;color:#666;font-size:12px;line-height:1.6">TVSE Travel Agency Ltd · Nairobi, Kenya<br>This message relates to a TVSE travel request or account.</p></div></div></body></html>`;
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
    data: { requestNumber }, dedupeKey: `trip-request:${requestNumber}:traveler`,
  });
}

export async function sendQuoteEmail(email: string, quoteNumber: string, total: string, link: string) {
  return sendTransactionalEmail({ to: email, template: "quote_sent", subject: `${quoteNumber}: your TVSE proposal is ready`, html: shell("Your travel proposal is ready", `<p style="line-height:1.65">TVSE has prepared quote <strong>${escapeHtml(quoteNumber)}</strong> with a total of <strong>${escapeHtml(total)}</strong>. Review every detail, ask a question or approve it securely.</p>`, "Review proposal", link), data: { quoteNumber }, dedupeKey: `quote:${quoteNumber}:sent` });
}

export async function sendGenericUpdate(email: string, subject: string, title: string, message: string, link?: string) {
  return sendTransactionalEmail({ to: email, template: "travel_update", subject, html: shell(title, `<p style="line-height:1.65">${escapeHtml(message)}</p>`, link ? "Open TVSE" : undefined, link), data: { title } });
}

export async function retryNotification(id: string) {
  const db = getD1();
  const row = await db.prepare("SELECT destination, payload_json FROM notifications WHERE id = ? AND status IN ('pending','failed')").bind(id).first<{ destination: string; payload_json: string }>();
  if (!row) throw new Error("Notification is not retryable");
  const data = JSON.parse(row.payload_json || "{}") as { subject?: string; html?: string };
  if (!runtimeEnv.RESEND_API_KEY || !runtimeEnv.RESEND_FROM_EMAIL) throw new Error("Email delivery is not configured");
  await db.prepare("UPDATE notifications SET status='sending', attempts=attempts+1, last_error=NULL WHERE id=?").bind(id).run();
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${runtimeEnv.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `${id}:retry` }, body: JSON.stringify({ from: runtimeEnv.RESEND_FROM_EMAIL, to: [row.destination], subject: data.subject || "TVSE travel update", html: data.html || shell("TVSE travel update", "<p>There is an update in your TVSE workspace.</p>") }) });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok || !payload.id) throw new Error(payload.message || `Resend returned ${response.status}`);
    await db.prepare("UPDATE notifications SET status='sent', provider_id=?, sent_at=? WHERE id=?").bind(payload.id, Date.now(), id).run();
    return { id, status: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed";
    await db.prepare("UPDATE notifications SET status='failed', last_error=? WHERE id=?").bind(message, id).run();
    throw error;
  }
}

export async function sendAdminAlert(subject: string, title: string, message: string, dedupeKey: string, link?: string) {
  return Promise.all(configuredAdminEmails().map((email) => sendTransactionalEmail({ to: email, template: "staff_alert", subject, html: shell(title, `<p style="line-height:1.65">${escapeHtml(message)}</p>`, link ? "Open TVSE operations" : undefined, link), dedupeKey: `${dedupeKey}:${email}` })));
}

export async function sendPaymentReceiptEmail(email: string, receiptNumber: string, amount: string, link: string) {
  if (!email) return null;
  return sendTransactionalEmail({ to: email, template: "payment_receipt", subject: `${receiptNumber}: payment received`, html: shell("Payment received", `<p style="line-height:1.65">We recorded your payment of <strong>${escapeHtml(amount)}</strong>. Your receipt is ready in the TVSE traveler workspace.</p>`, "Open documents", link), dedupeKey: `payment:${receiptNumber}:receipt` });
}

export async function verifyResendWebhook(body: string, headers: Headers): Promise<boolean> {
  return verifyResendSignature(body,headers,runtimeEnv.RESEND_WEBHOOK_SECRET);
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char); }
