import { getD1, getUploads } from "../../../../../db";
import { getActor } from "../../../../../lib/auth";
import { resourceForDocumentKind, canAccessResource } from "../../../../../lib/authorization";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const actor = await getActor(); if (!actor) return new Response("Authentication required", { status: 401 }); const { kind, id } = await params; const db = getD1();
  let row: Record<string, unknown> | null = null;
  if (kind === "quote") row = await db.prepare(`SELECT qv.pdf_key AS document_key, q.user_id, q.organization_id, tr.contact_email FROM quotes q JOIN quote_versions qv ON qv.quote_id=q.id AND qv.version=q.current_version JOIN trip_requests tr ON tr.id=q.trip_request_id WHERE q.id=?`).bind(id).first<Record<string, unknown>>();
  if (kind === "booking") row = await db.prepare("SELECT itinerary_pdf_key AS document_key, user_id, organization_id FROM bookings WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (kind === "invoice") row = await db.prepare("SELECT pdf_key AS document_key, user_id, organization_id FROM invoices WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (kind === "receipt") row = await db.prepare(`SELECT p.receipt_key AS document_key, i.user_id, i.organization_id FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.id=?`).bind(id).first<Record<string, unknown>>();
  if (!row || !row.document_key || !["quote","booking","invoice","receipt"].includes(kind)) return new Response("Document not found", { status: 404 });
  const permitted = canAccessResource(actor.role,resourceForDocumentKind(kind as "quote"|"booking"|"invoice"|"receipt")) && (row.user_id === actor.id || row.contact_email === actor.email || (actor.organizationId && row.organization_id === actor.organizationId) || ["owner","admin","agent","finance"].includes(actor.role));
  if (!permitted) return new Response("Forbidden", { status: 403 });
  const object = await getUploads().get(String(row.document_key)); if (!object) return new Response("Document not found", { status: 404 });
  const filename=(String(row.document_key).split("/").at(-1)??"document.pdf").replace(/[^A-Za-z0-9._-]/gu,"-");
  return new Response(object.body, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, ETag: object.httpEtag, "Cache-Control": "private, no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer", "Content-Security-Policy":"sandbox; default-src 'none'; frame-ancestors 'none'" } });
}
