import { NextResponse } from "next/server";
import { getD1 } from "../../../../db";
import { verifyResendWebhook } from "../../../../lib/email";
import { createId } from "../../../../lib/ids";
import { readBoundedBody } from "../../../../lib/http";

export async function POST(request: Request) {
  if (!/^application\/json(?:\s*;|$)/iu.test(request.headers.get("Content-Type")??"")) return NextResponse.json({error:"Expected JSON request"},{status:415});
  let body:string;try{body=new TextDecoder("utf-8",{fatal:true}).decode(await readBoundedBody(request,256_000));}catch{return NextResponse.json({error:"Invalid webhook payload"},{status:413});}
  if (!(await verifyResendWebhook(body, request.headers))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  let payload:{type?:string;data?:{email_id?:string};created_at?:string};try{payload=JSON.parse(body) as typeof payload;}catch{return NextResponse.json({error:"Invalid webhook payload"},{status:400});}if(typeof payload!=="object"||payload===null||typeof payload.type!=="string"||payload.type.length>120)return NextResponse.json({error:"Invalid webhook payload"},{status:422});
  const eventId = request.headers.get("svix-id") ?? createId("evt"); const db = getD1();
  try { await db.prepare("INSERT INTO webhook_events (id, provider, event_id, event_type, payload_json, processed_at) VALUES (?, 'resend', ?, ?, ?, ?)").bind(createId("wh"), eventId, payload.type || "unknown", body, Date.now()).run(); }
  catch { return NextResponse.json({ data: { ok: true, duplicate: true } }); }
  const statusMap: Record<string, string> = { "email.sent": "sent", "email.delivered": "delivered", "email.bounced": "bounced", "email.failed": "failed", "email.suppressed": "failed" };
  const status = statusMap[payload.type || ""]; if (status && payload.data?.email_id) await db.prepare("UPDATE notifications SET status=? WHERE provider_id=?").bind(status, payload.data.email_id).run();
  return NextResponse.json({ data: { ok: true } });
}
