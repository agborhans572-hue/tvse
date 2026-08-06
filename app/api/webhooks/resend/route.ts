import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { verifyResendWebhook } from "../../../../lib/email";
import { createId } from "../../../../lib/ids";

export async function POST(request: Request) {
  const body = await request.text(); if (!(await verifyResendWebhook(body, request.headers))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  const payload = JSON.parse(body) as { type?: string; data?: { email_id?: string }; created_at?: string }; const eventId = request.headers.get("svix-id") ?? createId("evt"); const db = getD1();
  try { await db.prepare("INSERT INTO webhook_events (id, provider, event_id, event_type, payload_json, processed_at) VALUES (?, 'resend', ?, ?, ?, ?)").bind(createId("wh"), eventId, payload.type || "unknown", body, Date.now()).run(); }
  catch { return NextResponse.json({ ok: true, duplicate: true }); }
  const statusMap: Record<string, string> = { "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced", "email.failed": "failed", "email.suppressed": "failed" };
  const status = statusMap[payload.type || ""]; if (status && payload.data?.email_id) await db.prepare("UPDATE notifications SET status=? WHERE provider_id=?").bind(status, payload.data.email_id).run();
  return NextResponse.json({ ok: true });
}
