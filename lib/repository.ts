import { getD1 } from "../db";
import { createId, nextDocumentNumber } from "./ids";
import type { Actor, BookingStatus, Currency, Role, TripRequestStatus } from "./travel";
import { assertTransition, calculateLineTotal, can, isInternalRole } from "./travel";
import { canAccessResource, reportScopeForRole } from "./authorization";
import type { ContentInput } from "./validation";

type MarketingContext = { sourcePath?: string; destinationSlug?: string; packageSlug?: string; utmSource?: string; utmMedium?: string; utmCampaign?: string };
export type ContactInput = { name: string; email: string; phone?: string; company?: string; type: "personal" | "support" | "corporate" | "partner"; message: string; consent: true; consentVersion: string; marketing: MarketingContext };
export type TripInput = { kind: "personal" | "corporate" | "event"; contactName: string; contactEmail: string; contactPhone?: string; origin: string; destination: string; departureDate: string; returnDate: string; travelerCount: number; budgetMinor: number; currency: Currency; interests: string[]; notes?: string; organizationId?: string; consent: true; consentVersion: string; marketing: MarketingContext };
export type QuoteInput = { tripRequestId: string; currency: Currency; exchangeRate: number; expiresAt?: number; feesMinor: number; taxMinor: number; notes?: string; items: Array<{ category: string; description: string; serviceDate?: string; quantity: number; unitPriceMinor: number; markupMinor: number; taxMinor: number; supplierId?: string }> };

export async function createLead(input: ContactInput, actor?: Actor | null) {
  const db = getD1(); const id = createId("lead"); const now = Date.now();
  await db.prepare("INSERT INTO leads (id, user_id, type, status, name, email, phone, company, message, source, source_path, marketing_context_json, consent_at, consent_version, created_at, updated_at) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, 'website', ?, ?, ?, ?, ?, ?)")
    .bind(id, actor?.id ?? null, input.type, input.name, input.email.toLowerCase(), input.phone || null, input.company || null, input.message, input.marketing.sourcePath || null, JSON.stringify(input.marketing), now, input.consentVersion, now, now).run();
  await audit(actor ?? null, "lead", id, "created", { source: "website", type: input.type });
  return { id, status: "new" as const };
}

export async function createTripRequest(input: TripInput, actor?: Actor | null) {
  const db = getD1(); const now = Date.now(); const id = createId("trp"); const requestNumber = await nextDocumentNumber("REQ");
  const userId = actor?.id ?? null;
  if (input.organizationId && !actor) throw new Error("Authentication is required to submit for an organization");
  if (input.organizationId && actor && !can(actor.role, "manage_travel") && input.organizationId !== actor.organizationId) throw new Error("This organization does not belong to you");
  const organizationId = actor && can(actor.role, "manage_travel") ? input.organizationId ?? actor.organizationId ?? null : actor?.organizationId ?? null;
  let approverId: string | null = null; let approvalStatus = "not_required";
  if (input.kind === "corporate" && organizationId) {
    const org = await db.prepare("SELECT approver_user_id FROM organizations WHERE id = ?").bind(organizationId).first<{ approver_user_id: string | null }>();
    approverId = org?.approver_user_id ?? null; approvalStatus = approverId ? "pending" : "not_required";
  }
  await db.prepare(`INSERT INTO trip_requests (id, request_number, user_id, organization_id, kind, status, approval_status, approver_id, contact_name, contact_email, contact_phone, origin, destination, departure_date, return_date, traveler_count, budget_minor, currency, interests_json, notes, source, source_path, marketing_context_json, consent_at, consent_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website', ?, ?, ?, ?, ?, ?)`)
    .bind(id, requestNumber, userId, organizationId, input.kind, approvalStatus, approverId, input.contactName, input.contactEmail.toLowerCase(), input.contactPhone || null, input.origin, input.destination, input.departureDate, input.returnDate, input.travelerCount, input.budgetMinor, input.currency, JSON.stringify(input.interests), input.notes || null, input.marketing.sourcePath || null, JSON.stringify(input.marketing), now, input.consentVersion, now, now).run();
  if (approverId) await db.prepare("INSERT INTO approvals (id, entity_type, entity_id, approver_id, status, created_at) VALUES (?, 'trip_request', ?, ?, 'pending', ?)").bind(createId("apr"), id, approverId, now).run();
  await audit(actor ?? null, "trip_request", id, "submitted", { requestNumber });
  return { id, requestNumber, status: "submitted" as const, contactEmail: input.contactEmail, contactName: input.contactName };
}

export async function listTripRequests(actor: Actor, limit = 50) {
  const db = getD1();
  const columns="id,request_number,user_id,organization_id,kind,status,approval_status,assigned_agent_id,contact_name,origin,destination,departure_date,return_date,traveler_count,budget_minor,currency,created_at,updated_at";
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") ? (await db.prepare(`SELECT ${columns} FROM trip_requests ORDER BY created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results : [];
  if (actor.organizationId && ["corporate_requester", "corporate_approver"].includes(actor.role)) return (await db.prepare(`SELECT ${columns} FROM trip_requests WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`SELECT ${columns} FROM trip_requests WHERE user_id = ? OR contact_email = ? ORDER BY created_at DESC LIMIT ?`).bind(actor.id, actor.email, limit).all<Record<string, unknown>>()).results;
}

export async function decideTripApproval(id: string, actor: Actor, decision: "approved" | "declined", comment = "") {
  if (actor.role !== "corporate_approver" && !can(actor.role, "manage_travel")) throw new Error("Only an assigned approver or travel manager can decide this request");
  const db = getD1(); const now = Date.now();
  const approval = await db.prepare("SELECT id, approver_id, status FROM approvals WHERE entity_type = 'trip_request' AND entity_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first<{ id: string; approver_id: string; status: string }>();
  if (!approval || approval.status !== "pending" || (actor.role === "corporate_approver" && approval.approver_id !== actor.id)) throw new Error("Approval is not available");
  const results = await db.batch([
    db.prepare("UPDATE approvals SET status = ?, comment = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(decision, comment || null, now, approval.id),
    db.prepare("UPDATE trip_requests SET approval_status = ?, updated_at = ? WHERE id = ? AND approval_status = 'pending'").bind(decision, now, id),
  ]);
  if ((results[0].meta?.changes ?? 0) !== 1) throw new Error("Approval has already been decided");
  await audit(actor, "trip_request", id, `approval_${decision}`, { comment });
  return { id, decision };
}

export async function createQuote(input: QuoteInput, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const request = await db.prepare("SELECT * FROM trip_requests WHERE id = ?").bind(input.tripRequestId).first<Record<string, unknown>>();
  if (!request) throw new Error("Trip request not found");
  if (request.approval_status === "pending" || request.approval_status === "declined") throw new Error("The corporate request must be approved before quoting");
  const quoteId = createId("qte"); const versionId = createId("qv"); const quoteNumber = await nextDocumentNumber("Q"); const now = Date.now();
  const itemRows = input.items.map((item, position) => ({ ...item, position, totalMinor: calculateLineTotal(item.quantity, item.unitPriceMinor, item.markupMinor, item.taxMinor) }));
  const subtotalMinor = itemRows.reduce((sum, item) => sum + item.totalMinor, 0); const totalMinor = subtotalMinor + input.feesMinor + input.taxMinor;
  const snapshot = { currency: input.currency, exchangeRate: input.exchangeRate, expiresAt: input.expiresAt ?? null, items: itemRows, subtotalMinor, feesMinor: input.feesMinor, taxMinor: input.taxMinor, totalMinor, notes: input.notes || "" };
  const activeQuote = await db.prepare("SELECT id, status FROM quotes WHERE trip_request_id=? AND current=1").bind(input.tripRequestId).first<{ id: string; status: string }>();
  if (activeQuote?.status === "approved") throw new Error("The approved quote must be converted instead of replaced");
  const statements = [
    db.prepare("UPDATE quotes SET status='superseded', current=0, updated_at=? WHERE trip_request_id=? AND current=1").bind(now, input.tripRequestId),
    db.prepare("INSERT INTO quotes (id, quote_number, trip_request_id, user_id, organization_id, status, current, current_version, currency, exchange_rate, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', 1, 1, ?, ?, ?, ?, ?)")
      .bind(quoteId, quoteNumber, input.tripRequestId, request.user_id ?? null, request.organization_id ?? null, input.currency, input.exchangeRate, input.expiresAt ?? null, now, now),
    db.prepare("INSERT INTO quote_versions (id, quote_id, version, subtotal_minor, fees_minor, tax_minor, total_minor, notes, snapshot_json, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(versionId, quoteId, subtotalMinor, input.feesMinor, input.taxMinor, totalMinor, input.notes || null, JSON.stringify(snapshot), actor.id, now),
    db.prepare("UPDATE trip_requests SET status = 'quoting', assigned_agent_id = COALESCE(assigned_agent_id, ?), updated_at = ? WHERE id = ?").bind(actor.id, now, input.tripRequestId),
    ...itemRows.map((item) => db.prepare("INSERT INTO quote_items (id, quote_version_id, supplier_id, category, description, service_date, quantity, unit_price_minor, markup_minor, tax_minor, total_minor, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(createId("qi"), versionId, item.supplierId || null, item.category, item.description, item.serviceDate || null, item.quantity, item.unitPriceMinor, item.markupMinor, item.taxMinor, item.totalMinor, item.position)),
  ];
  await db.batch(statements); await audit(actor, "quote", quoteId, "created", { quoteNumber, totalMinor, version: 1 });
  return { id: quoteId, versionId, quoteNumber, totalMinor, currency: input.currency, contactEmail: String(request.contact_email), requestNumber: String(request.request_number) };
}

export async function reviseQuote(quoteId: string, input: Omit<QuoteInput, "tripRequestId">, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1();
  const quote = await db.prepare("SELECT id, quote_number, status, current_version FROM quotes WHERE id = ? AND current=1").bind(quoteId).first<{ id: string; quote_number: string; status: string; current_version: number }>();
  if (!quote || !["draft", "sent", "viewed", "declined", "expired"].includes(quote.status)) throw new Error("This quote can no longer be revised");
  const version = quote.current_version + 1; const versionId = createId("qv"); const now = Date.now();
  const itemRows = input.items.map((item, position) => ({ ...item, position, totalMinor: calculateLineTotal(item.quantity, item.unitPriceMinor, item.markupMinor, item.taxMinor) }));
  const subtotalMinor = itemRows.reduce((sum, item) => sum + item.totalMinor, 0); const totalMinor = subtotalMinor + input.feesMinor + input.taxMinor;
  const snapshot = { currency: input.currency, exchangeRate: input.exchangeRate, expiresAt: input.expiresAt ?? null, items: itemRows, subtotalMinor, feesMinor: input.feesMinor, taxMinor: input.taxMinor, totalMinor, notes: input.notes || "" };
  await db.batch([
    db.prepare("INSERT INTO quote_versions (id, quote_id, version, subtotal_minor, fees_minor, tax_minor, total_minor, notes, snapshot_json, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(versionId, quoteId, version, subtotalMinor, input.feesMinor, input.taxMinor, totalMinor, input.notes || null, JSON.stringify(snapshot), actor.id, now),
    ...itemRows.map((item) => db.prepare("INSERT INTO quote_items (id, quote_version_id, supplier_id, category, description, service_date, quantity, unit_price_minor, markup_minor, tax_minor, total_minor, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(createId("qi"), versionId, item.supplierId || null, item.category, item.description, item.serviceDate || null, item.quantity, item.unitPriceMinor, item.markupMinor, item.taxMinor, item.totalMinor, item.position)),
    db.prepare("UPDATE quotes SET status = 'draft', current_version = ?, currency = ?, exchange_rate = ?, expires_at = ?, sent_at = NULL, updated_at = ? WHERE id = ?").bind(version, input.currency, input.exchangeRate, input.expiresAt ?? null, now, quoteId),
  ]);
  await audit(actor, "quote", quoteId, "revised", { version, totalMinor });
  return { id: quoteId, versionId, version, totalMinor, currency: input.currency, quoteNumber: quote.quote_number };
}

export async function sendQuote(id: string, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const now = Date.now();
  const row = await db.prepare(`SELECT q.id, q.quote_number, q.status, q.currency, tr.contact_email, qv.total_minor FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version WHERE q.id = ? AND q.current=1`).bind(id).first<{ id: string; quote_number: string; status: string; currency: Currency; contact_email: string; total_minor: number }>();
  if (!row || row.status !== "draft") throw new Error("Only a draft quote can be sent");
  const results = await db.batch([db.prepare("UPDATE quotes SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'draft' AND current=1").bind(now, now, id), db.prepare("UPDATE trip_requests SET status = 'quoted', updated_at = ? WHERE id = (SELECT trip_request_id FROM quotes WHERE id = ?)").bind(now, id)]);
  if ((results[0].meta?.changes ?? 0) !== 1) throw new Error("This quote has already been sent");
  await audit(actor, "quote", id, "sent", { quoteNumber: row.quote_number }); return row;
}

export async function listQuotes(actor: Actor, limit = 50) {
  const db = getD1(); const select = `SELECT q.id,q.quote_number,q.trip_request_id,q.user_id,q.organization_id,q.status,q.current_version,q.currency,q.expires_at,q.sent_at,q.approved_at,q.created_at,q.updated_at,qv.total_minor,qv.pdf_key,tr.destination,tr.departure_date,tr.return_date,tr.contact_name FROM quotes q JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version JOIN trip_requests tr ON tr.id = q.trip_request_id`;
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") || can(actor.role,"manage_finance") ? (await db.prepare(`${select} WHERE q.current=1 ORDER BY q.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results : [];
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE q.current=1 AND q.organization_id = ? ORDER BY q.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE q.current=1 AND (q.user_id = ? OR tr.contact_email = ?) ORDER BY q.created_at DESC LIMIT ?`).bind(actor.id, actor.email, limit).all<Record<string, unknown>>()).results;
}

export async function decideQuote(id: string, actor: Actor, decision: "approved" | "declined", comment = "") {
  const db = getD1(); const row = await db.prepare("SELECT q.*, tr.contact_email, tr.approver_id FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id WHERE q.id = ? AND q.current=1").bind(id).first<Record<string, unknown>>();
  if (!row || !["sent", "viewed"].includes(String(row.status))) throw new Error("This quote cannot be decided");
  if (isInternalRole(actor.role) && !can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  if (actor.role === "traveler" && (row.organization_id || (row.user_id !== actor.id && row.contact_email !== actor.email))) throw new Error("This quote does not belong to you");
  if (actor.role === "corporate_approver" && (row.organization_id !== actor.organizationId || row.approver_id !== actor.id)) throw new Error("Only the assigned corporate approver can decide this quote");
  if (!isInternalRole(actor.role) && !["traveler", "corporate_approver"].includes(actor.role)) throw new Error("You do not have permission to decide this quote");
  const now = Date.now();
  const results = await db.batch([
    db.prepare("UPDATE quotes SET status = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status IN ('sent','viewed') AND current=1").bind(decision, decision === "approved" ? now : null, now, id),
    db.prepare("UPDATE trip_requests SET status = ?, updated_at = ? WHERE id = ?").bind(decision, now, row.trip_request_id),
    db.prepare("INSERT INTO approvals (id, entity_type, entity_id, approver_id, status, comment, decided_at, created_at) VALUES (?, 'quote', ?, ?, ?, ?, ?, ?)").bind(createId("apr"), id, actor.id, decision, comment || null, now, now),
  ]);
  if ((results[0].meta?.changes ?? 0) !== 1) throw new Error("This quote has already been decided");
  await audit(actor, "quote", id, decision, { comment }); return { id, decision };
}

export async function createBookingFromQuote(quoteId: string, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const quote = await db.prepare(`SELECT q.*, tr.destination, tr.departure_date, tr.return_date, tr.traveler_count FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id WHERE q.id = ? AND q.current=1`).bind(quoteId).first<Record<string, unknown>>();
  if (!quote || quote.status !== "approved") throw new Error("Only an approved quote can become a booking");
  const existing = await db.prepare("SELECT id, booking_number FROM bookings WHERE quote_id = ?").bind(quoteId).first<{ id: string; booking_number: string }>();
  if (existing) return { id: existing.id, bookingNumber: existing.booking_number };
  const id = createId("bkg"); const bookingNumber = await nextDocumentNumber("B"); const now = Date.now();
  const inserted = await db.prepare("INSERT OR IGNORE INTO bookings (id, booking_number, quote_id, trip_request_id, user_id, organization_id, status, destination, departure_date, return_date, traveler_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)")
    .bind(id, bookingNumber, quoteId, quote.trip_request_id, quote.user_id ?? null, quote.organization_id ?? null, quote.destination, quote.departure_date, quote.return_date, quote.traveler_count, now, now).run();
  if ((inserted.meta?.changes ?? 0) !== 1) {
    const current = await db.prepare("SELECT id, booking_number, destination FROM bookings WHERE trip_request_id=?").bind(quote.trip_request_id).first<{ id: string; booking_number: string; destination: string }>();
    if (!current) throw new Error("Booking could not be created");
    return { id: current.id, bookingNumber: current.booking_number, destination: current.destination };
  }
  await db.prepare("UPDATE trip_requests SET status = 'converted', updated_at = ? WHERE id = ? AND status = 'approved'").bind(now, quote.trip_request_id).run();
  await audit(actor, "booking", id, "created", { bookingNumber, quoteId }); return { id, bookingNumber, destination: String(quote.destination) };
}

export async function listBookings(actor: Actor, limit = 50) {
  const db = getD1();
  const select = "SELECT b.id,b.booking_number,b.quote_id,b.trip_request_id,b.user_id,b.organization_id,b.status,b.destination,b.departure_date,b.return_date,b.traveler_count,b.itinerary_pdf_key,b.created_at,b.updated_at,q.quote_number FROM bookings b JOIN quotes q ON q.id = b.quote_id";
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") || can(actor.role,"manage_finance") ? (await db.prepare(`${select} ORDER BY b.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results : [];
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE b.organization_id = ? ORDER BY b.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT ?`).bind(actor.id, limit).all<Record<string, unknown>>()).results;
}

export async function createInvoice(bookingId: string, dueDate: string, taxMinor: number, actor: Actor) {
  if (!can(actor.role, "manage_finance")) throw new Error("Finance permission required");
  const db = getD1(); const booking = await db.prepare(`SELECT b.*, q.currency, q.exchange_rate, q.current_version, qv.total_minor, qv.subtotal_minor FROM bookings b JOIN quotes q ON q.id = b.quote_id JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version WHERE b.id = ?`).bind(bookingId).first<Record<string, unknown>>();
  if (!booking) throw new Error("Booking not found");
  const existing = await db.prepare("SELECT id, invoice_number FROM invoices WHERE booking_id = ? AND current = 1").bind(bookingId).first<{ id: string; invoice_number: string }>();
  if (existing) return { id: existing.id, invoiceNumber: existing.invoice_number };
  const id = createId("inv"); const invoiceNumber = await nextDocumentNumber("INV"); const now = Date.now(); const subtotal = Number(booking.total_minor); const total = subtotal + taxMinor;
  const inserted = await db.prepare("INSERT OR IGNORE INTO invoices (id, invoice_number, booking_id, user_id, organization_id, status, currency, exchange_rate, subtotal_minor, tax_minor, total_minor, paid_minor, due_minor, issue_date, due_date, current, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?)")
    .bind(id, invoiceNumber, bookingId, booking.user_id ?? null, booking.organization_id ?? null, booking.currency, booking.exchange_rate, subtotal, taxMinor, total, total, new Date(now).toISOString().slice(0, 10), dueDate, now, now).run();
  if ((inserted.meta?.changes ?? 0) !== 1) {
    const current = await db.prepare("SELECT id, invoice_number FROM invoices WHERE booking_id=? AND current=1").bind(bookingId).first<{ id: string; invoice_number: string }>();
    if (!current) throw new Error("Invoice could not be created");
    return { id: current.id, invoiceNumber: current.invoice_number };
  }
  await db.prepare("INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_minor, tax_minor, total_minor, position) VALUES (?, ?, ?, 1, ?, ?, ?, 0)")
    .bind(createId("ii"), id, `Travel services for ${booking.booking_number}`, subtotal, taxMinor, total).run();
  await audit(actor, "invoice", id, "issued", { invoiceNumber, total }); return { id, invoiceNumber, totalMinor: total, currency: booking.currency as Currency };
}

export async function listInvoices(actor: Actor, limit = 50) {
  const db = getD1(); const select = "SELECT i.id,i.invoice_number,i.booking_id,i.user_id,i.organization_id,i.status,i.currency,i.total_minor,i.paid_minor,i.due_minor,i.issue_date,i.due_date,i.pdf_key,i.created_at,i.updated_at,b.booking_number,b.destination FROM invoices i JOIN bookings b ON b.id = i.booking_id";
  if (isInternalRole(actor.role)) return can(actor.role,"manage_finance") ? (await db.prepare(`${select} ORDER BY i.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results : [];
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE i.organization_id = ? ORDER BY i.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE i.user_id = ? ORDER BY i.created_at DESC LIMIT ?`).bind(actor.id, limit).all<Record<string, unknown>>()).results;
}

export async function recordPayment(invoiceId: string, input: { amountMinor: number; currency: Currency; method: string; reference?: string; paidAt?: number; note?: string }, actor: Actor, paymentIdempotencyKey?: string | null) {
  if (!can(actor.role, "manage_finance")) throw new Error("Finance permission required");
  const db = getD1(); const invoice = await db.prepare("SELECT i.*, COALESCE(u.email, tr.contact_email, '') AS contact_email FROM invoices i JOIN bookings b ON b.id=i.booking_id JOIN trip_requests tr ON tr.id=b.trip_request_id LEFT JOIN users u ON u.id=i.user_id WHERE i.id = ? AND i.current=1").bind(invoiceId).first<Record<string, unknown>>();
  if (!invoice || ["void", "paid"].includes(String(invoice.status))) throw new Error("Invoice cannot accept a payment");
  if (invoice.currency !== input.currency) throw new Error("Payment currency must match the invoice");
  const id = createId("pay"); const receiptNumber = await nextDocumentNumber("RCT"); const now = Date.now();
  const statements = [db.prepare(`INSERT INTO payments (id, receipt_number, invoice_id, amount_minor, currency, method, reference, paid_at, recorded_by, note, idempotency_key, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? <= (SELECT total_minor - COALESCE((SELECT SUM(amount_minor) FROM payments WHERE invoice_id = invoices.id), 0) FROM invoices WHERE id = ? AND status NOT IN ('paid','void'))`)
    .bind(id, receiptNumber, invoiceId, input.amountMinor, input.currency, input.method, input.reference || null, input.paidAt ?? now, actor.id, input.note || null, paymentIdempotencyKey || null, now, input.amountMinor, invoiceId),
    db.prepare(`UPDATE invoices SET
      paid_minor=(SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE invoice_id=?),
      due_minor=MAX(0,total_minor-(SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE invoice_id=?)),
      status=CASE WHEN (SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE invoice_id=?) >= total_minor THEN 'paid' ELSE 'partially_paid' END,
      updated_at=? WHERE id=? AND current=1`).bind(invoiceId, invoiceId, invoiceId, now, invoiceId),
  ];
  const results = await db.batch(statements);
  if ((results[0].meta?.changes ?? 0) !== 1) throw new Error("Payment would exceed the invoice balance");
  const current = await db.prepare("SELECT paid_minor, due_minor, status FROM invoices WHERE id=?").bind(invoiceId).first<{paid_minor:number;due_minor:number;status:"partially_paid"|"paid"}>();
  if (!current) throw new Error("Invoice totals could not be recalculated");
  await audit(actor, "payment", id, "recorded", { receiptNumber, invoiceId, amountMinor: input.amountMinor });
  return { id, receiptNumber, paidMinor: current.paid_minor, dueMinor: current.due_minor, status: current.status, amountMinor: input.amountMinor, currency: input.currency, contactEmail: String(invoice.contact_email || "") };
}

export async function createSupportTicket(input: { bookingId?: string; subject: string; priority: string; message: string }, actor: Actor) {
  if (!canAccessResource(actor.role,"support")) throw new Error("Support access required");
  const db = getD1(); const id = createId("tkt"); const ticketNumber = await nextDocumentNumber("TKT"); const now = Date.now();
  if (input.bookingId && !isInternalRole(actor.role)) {
    const owned = await db.prepare("SELECT id FROM bookings WHERE id=? AND (user_id=? OR organization_id=?)").bind(input.bookingId, actor.id, actor.organizationId ?? "").first();
    if (!owned) throw new Error("This booking does not belong to you");
  }
  await db.batch([
    db.prepare("INSERT INTO support_tickets (id, ticket_number, user_id, organization_id, booking_id, subject, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)")
      .bind(id, ticketNumber, actor.id, actor.organizationId ?? null, input.bookingId || null, input.subject, input.priority, now, now),
    db.prepare("INSERT INTO messages (id, ticket_id, sender_id, body, internal, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(createId("msg"), id, actor.id, input.message, now),
  ]);
  await audit(actor, "support_ticket", id, "opened", { ticketNumber }); return { id, ticketNumber };
}

export async function listSupportTickets(actor: Actor, limit = 50) {
  const db = getD1(); const select = "SELECT t.id,t.ticket_number,t.user_id,t.organization_id,t.booking_id,t.subject,t.status,t.priority,t.assigned_agent_id,t.created_at,t.updated_at,(SELECT substr(body,1,180) FROM messages WHERE ticket_id = t.id AND internal = 0 ORDER BY created_at DESC LIMIT 1) AS latest_message FROM support_tickets t";
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") ? (await db.prepare(`${select} ORDER BY t.updated_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results : [];
  return (await db.prepare(`${select} WHERE t.user_id = ? OR t.organization_id = ? ORDER BY t.updated_at DESC LIMIT ?`).bind(actor.id, actor.organizationId ?? "", limit).all<Record<string, unknown>>()).results;
}

async function assertTicketAccess(id: string, actor: Actor) {
  if (!canAccessResource(actor.role, "support")) throw new Error("Support access required");
  if (isInternalRole(actor.role) && !can(actor.role,"manage_travel")) throw new Error("Traveler support permission required");
  const row = await getD1().prepare("SELECT * FROM support_tickets WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!row) throw new Error("Support request not found");
  if (!isInternalRole(actor.role) && row.user_id !== actor.id && (!actor.organizationId || row.organization_id !== actor.organizationId)) throw new Error("This support request does not belong to you");
  return row;
}

export async function getSupportConversation(id: string, actor: Actor) {
  const ticket = await assertTicketAccess(id, actor);
  const internalClause = isInternalRole(actor.role) ? "" : " AND m.internal = 0";
  const messages = (await getD1().prepare(`SELECT m.*, u.full_name AS sender_name, u.email AS sender_email FROM messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.ticket_id=?${internalClause} ORDER BY m.created_at`).bind(id).all<Record<string, unknown>>()).results;
  return { ticket, messages };
}

export async function addSupportMessage(id: string, message: string, internal: boolean, actor: Actor) {
  const ticket = await assertTicketAccess(id, actor); const staff = isInternalRole(actor.role); const now = Date.now();
  if (internal && !staff) throw new Error("Only TVSE staff can add internal notes");
  const messageId = createId("msg");
  const nextStatus = staff && !internal ? "waiting_customer" : !staff ? "waiting_tvse" : String(ticket.status);
  await getD1().batch([
    getD1().prepare("INSERT INTO messages (id, ticket_id, sender_id, body, internal, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(messageId, id, actor.id, message, internal ? 1 : 0, now),
    getD1().prepare("UPDATE support_tickets SET status=?, updated_at=? WHERE id=?").bind(nextStatus, now, id),
  ]);
  await audit(actor, "support_ticket", id, internal ? "internal_note_added" : "message_added", {});
  return { id: messageId, ticketId: id, status: nextStatus };
}

export async function updateSupportTicket(id: string, input: { status?: string; priority?: string; assignedAgentId?: string | null }, actor: Actor) {
  if (!can(actor.role,"manage_travel")) throw new Error("Traveler support permission required");
  const current=await assertTicketAccess(id, actor); const now = Date.now(); const db=getD1();
  if (input.status && input.status!==current.status) {
    const transitions:Record<string,string[]>={open:["waiting_customer","waiting_tvse","resolved","closed"],waiting_customer:["waiting_tvse","resolved","closed"],waiting_tvse:["waiting_customer","resolved","closed"],resolved:["open","closed"],closed:["open"]};
    if (!transitions[String(current.status)]?.includes(input.status)) throw new Error("This support status transition is not available");
  }
  if (input.assignedAgentId) {
    const assignee=await db.prepare("SELECT id FROM users WHERE id=? AND role IN ('owner','admin','agent') AND status='active'").bind(input.assignedAgentId).first();
    if (!assignee) throw new Error("Support requests can only be assigned to active travel staff");
  }
  const updated=await db.prepare("UPDATE support_tickets SET status=COALESCE(?,status), priority=COALESCE(?,priority), assigned_agent_id=CASE WHEN ?=1 THEN ? ELSE assigned_agent_id END, updated_at=? WHERE id=? AND status=?")
    .bind(input.status ?? null, input.priority ?? null, Object.hasOwn(input, "assignedAgentId") ? 1 : 0, input.assignedAgentId ?? null, now, id,current.status).run();
  if ((updated.meta?.changes??0)!==1) throw new Error("This support request has already changed");
  await audit(actor, "support_ticket", id, "updated", input); return { id, ...input };
}

export async function listApprovals(actor: Actor) {
  const db = getD1();
  if (actor.role === "corporate_approver") return (await db.prepare(`SELECT a.id,a.entity_type,a.entity_id,a.approver_id,a.status,a.comment,a.decided_at,a.created_at,tr.request_number,tr.destination,tr.departure_date,tr.return_date,tr.budget_minor,tr.currency FROM approvals a JOIN trip_requests tr ON tr.id = a.entity_id WHERE a.entity_type = 'trip_request' AND a.approver_id = ? ORDER BY a.created_at DESC`).bind(actor.id).all<Record<string, unknown>>()).results;
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") ? (await db.prepare("SELECT id,entity_type,entity_id,approver_id,status,comment,decided_at,created_at FROM approvals ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results : [];
  return [];
}

export async function listPartnerAssignments(actor: Actor) {
  if (actor.role !== "partner" && !isInternalRole(actor.role)) return [];
  const db = getD1();
  const columns="sa.id,sa.booking_id,sa.supplier_id,sa.status,sa.service_type,sa.traveler_summary,sa.partner_note,sa.confirmed_at,sa.created_at,sa.updated_at,b.booking_number,b.destination,s.name AS supplier_name";
  if (isInternalRole(actor.role)) return can(actor.role,"manage_travel") ? (await db.prepare(`SELECT ${columns} FROM service_assignments sa JOIN bookings b ON b.id = sa.booking_id JOIN suppliers s ON s.id = sa.supplier_id ORDER BY sa.created_at DESC LIMIT 100`).all<Record<string, unknown>>()).results : [];
  return (await db.prepare(`SELECT ${columns} FROM service_assignments sa JOIN bookings b ON b.id = sa.booking_id JOIN suppliers s ON s.id = sa.supplier_id JOIN memberships m ON m.organization_id = s.organization_id WHERE m.user_id = ? ORDER BY sa.created_at DESC`).bind(actor.id).all<Record<string, unknown>>()).results;
}

export async function updatePartnerAssignment(id: string, status: "confirmed" | "declined" | "completed", note: string, actor: Actor) {
  if (actor.role !== "partner" && !can(actor.role, "manage_travel")) throw new Error("Partner access required");
  const db = getD1(); const now = Date.now();
  if (actor.role === "partner") {
    const owned = await db.prepare(`SELECT sa.id FROM service_assignments sa JOIN suppliers s ON s.id = sa.supplier_id JOIN memberships m ON m.organization_id = s.organization_id WHERE sa.id = ? AND m.user_id = ?`).bind(id, actor.id).first();
    if (!owned) throw new Error("Assignment not found");
  }
  const current = await db.prepare("SELECT status FROM service_assignments WHERE id=?").bind(id).first<{status:string}>();
  const transitions:Record<string,string[]>={assigned:["confirmed","declined"],confirmed:["completed","declined"]};
  if (!current || !transitions[current.status]?.includes(status)) throw new Error("This assignment transition is not available");
  const updated=await db.prepare("UPDATE service_assignments SET status = ?, partner_note = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END, updated_at = ? WHERE id = ? AND status = ?")
    .bind(status, note || null, status, now, now, id,current.status).run();
  if ((updated.meta?.changes??0)!==1) throw new Error("This assignment has already changed");
  await audit(actor, "service_assignment", id, status, { note }); return { id, status };
}

export async function updateTripRequestStatus(id: string, status: TripRequestStatus, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const row = await db.prepare("SELECT status FROM trip_requests WHERE id = ?").bind(id).first<{ status: TripRequestStatus }>();
  if (!row) throw new Error("Trip request not found"); assertTransition("tripRequest", row.status, status);
  const changed = await db.prepare("UPDATE trip_requests SET status = ?, updated_at = ? WHERE id = ? AND status = ?").bind(status, Date.now(), id, row.status).run();
  if ((changed.meta?.changes ?? 0) !== 1) throw new Error("The trip request changed while this action was being processed");
  await audit(actor, "trip_request", id, `status_${status}`, { from: row.status }); return { id, status };
}

export async function updateBookingStatus(id: string, status: BookingStatus, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const row = await db.prepare("SELECT status FROM bookings WHERE id = ?").bind(id).first<{ status: BookingStatus }>();
  if (!row) throw new Error("Booking not found"); assertTransition("booking", row.status, status);
  const changed = await db.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ? AND status = ?").bind(status, Date.now(), id, row.status).run();
  if ((changed.meta?.changes ?? 0) !== 1) throw new Error("The booking changed while this action was being processed");
  await audit(actor, "booking", id, `status_${status}`, { from: row.status }); return { id, status };
}

export async function upsertItineraryDay(bookingId: string, input: { dayNumber: number; date: string; title: string; description?: string; location?: string }, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const booking = await db.prepare("SELECT id FROM bookings WHERE id = ?").bind(bookingId).first();
  if (!booking) throw new Error("Booking not found");
  const existing = await db.prepare("SELECT id FROM itinerary_days WHERE booking_id = ? AND day_number = ?").bind(bookingId, input.dayNumber).first<{ id: string }>();
  const id = existing?.id ?? createId("day");
  await db.prepare("INSERT INTO itinerary_days (id, booking_id, day_number, date, title, description, location) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(booking_id, day_number) DO UPDATE SET date=excluded.date,title=excluded.title,description=excluded.description,location=excluded.location").bind(id, bookingId, input.dayNumber, input.date, input.title, input.description || null, input.location || null).run();
  await audit(actor, "booking", bookingId, "itinerary_day_saved", { dayNumber: input.dayNumber }); return { id, bookingId, dayNumber: input.dayNumber };
}

export async function createOrganization(input: { name: string; slug: string; type: "corporate" | "partner"; status: "active" | "prospect" | "suspended"; billingEmail?: string; defaultCurrency: Currency; travelPolicy?: string }, actor: Actor) {
  if (!can(actor.role, "manage_users")) throw new Error("Organization administration permission required");
  const db = getD1(); const id = createId("org"); const now = Date.now();
  await db.prepare("INSERT INTO organizations (id, name, slug, type, status, billing_email, default_currency, travel_policy_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.name, input.slug, input.type, input.status, input.billingEmail || null, input.defaultCurrency, JSON.stringify({ notes: input.travelPolicy || "" }), now, now).run();
  await audit(actor, "organization", id, "created", { type: input.type }); return { id, ...input };
}

export async function createSupplier(input: { organizationId?: string; name: string; category: string; email?: string; phone?: string; country?: string; status: "active" | "pending" | "suspended"; notes?: string }, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const id = createId("sup"); const now = Date.now();
  await db.prepare("INSERT INTO suppliers (id, organization_id, name, category, email, phone, country, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.organizationId || null, input.name, input.category, input.email || null, input.phone || null, input.country || null, input.status, input.notes || null, now, now).run();
  await audit(actor, "supplier", id, "created", { category: input.category }); return { id, ...input };
}

export async function createPartnerAssignment(input: { bookingId: string; supplierId: string; serviceType: string; travelerSummary?: string; serviceDetails?: string }, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const id = createId("asg"); const now = Date.now();
  const related = await db.prepare("SELECT b.id FROM bookings b, suppliers s WHERE b.id = ? AND s.id = ?").bind(input.bookingId, input.supplierId).first();
  if (!related) throw new Error("Booking or supplier not found");
  await db.prepare("INSERT INTO service_assignments (id, booking_id, supplier_id, status, service_type, traveler_summary, service_details_json, created_at, updated_at) VALUES (?, ?, ?, 'assigned', ?, ?, ?, ?, ?)").bind(id, input.bookingId, input.supplierId, input.serviceType, input.travelerSummary || null, JSON.stringify({ details: input.serviceDetails || "" }), now, now).run();
  await audit(actor, "service_assignment", id, "assigned", { bookingId: input.bookingId, supplierId: input.supplierId }); return { id, status: "assigned" as const };
}

export async function inviteUser(input: { email: string; fullName: string; role: Role; organizationId?: string; replaceAccess?: boolean }, actor: Actor) {
  if (!can(actor.role, "manage_users")) throw new Error("User administration permission required");
  const db = getD1(); const now = Date.now(); const normalized = input.email.toLowerCase();
  if (isInternalRole(input.role) && input.organizationId) throw new Error("Staff accounts cannot be assigned to a client organization");
  if (!isInternalRole(input.role) && input.role !== "traveler" && !input.organizationId) throw new Error("This role requires an organization");
  if (input.organizationId) {
    const expectedType=input.role==="partner"?"partner":"corporate";
    const organization=await db.prepare("SELECT id FROM organizations WHERE id=? AND type=?").bind(input.organizationId,expectedType).first();
    if (!organization) throw new Error(`A ${expectedType} organization is required for this role`);
  }
  const row = await db.prepare(`SELECT u.id,u.role,u.status,u.kind,m.organization_id
    FROM users u LEFT JOIN memberships m ON m.user_id=u.id WHERE u.email=? LIMIT 1`).bind(normalized).first<{ id: string; role: Role; status: string; kind: string; organization_id: string | null }>(); const id = row?.id ?? createId("usr");
  const kind = isInternalRole(input.role) ? "staff" : input.role === "partner" ? "partner" : input.role.startsWith("corporate_") ? "corporate" : "traveler";
  if (row?.role === "owner" && row.status === "active") throw new Error("Active owners cannot be changed through invitations");
  const accessMatches = !!row && row.role === input.role && (row.organization_id ?? null) === (input.organizationId ?? null);
  if (row && !accessMatches && !input.replaceAccess) throw new Error("This user already has different access. Confirm an explicit access replacement");
  if (row && accessMatches) {
    await db.prepare("UPDATE users SET full_name=?,updated_at=? WHERE id=?").bind(input.fullName,now,id).run();
    return { id, email: normalized, role: input.role, idempotent: true };
  }
  const membershipRole=input.role === "partner" ? "partner_user" : input.role === "corporate_approver" ? "approver" : "requester";
  if (row) {
    const statements = [
      db.prepare("UPDATE organizations SET approver_user_id=NULL,updated_at=? WHERE approver_user_id=?").bind(now,id),
      db.prepare("DELETE FROM memberships WHERE user_id=?").bind(id),
      db.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      db.prepare("UPDATE users SET full_name=?,kind=?,role=?,status='invited',auth_version=auth_version+1,updated_at=? WHERE id=?").bind(input.fullName,kind,input.role,now,id),
      ...(input.organizationId ? [db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)").bind(createId("mem"),input.organizationId,id,membershipRole,now)] : []),
    ];
    await db.batch(statements);
  } else {
    await db.batch([
      db.prepare("INSERT INTO users (id, email, full_name, kind, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'invited', ?, ?)").bind(id, normalized, input.fullName, kind, input.role, now, now),
      ...(input.organizationId ? [db.prepare("INSERT INTO memberships (id,organization_id,user_id,role,created_at) VALUES (?,?,?,?,?)").bind(createId("mem"),input.organizationId,id,membershipRole,now)] : []),
    ]);
  }
  if (input.organizationId && input.role === "corporate_approver") await db.prepare("UPDATE organizations SET approver_user_id = ?, updated_at = ? WHERE id = ? AND type = 'corporate'").bind(id, now, input.organizationId).run();
  await audit(actor, "user", id, "invited", { role: input.role }); return { id, email: normalized, role: input.role };
}

export async function listLeads(actor: Actor, status?: string) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1();
  const columns="l.id,l.user_id,l.type,l.status,l.name,l.email,l.phone,l.company,substr(l.message,1,240) AS message,l.source,l.assigned_agent_id,l.converted_trip_request_id,l.created_at,l.updated_at,u.full_name AS assigned_agent_name";
  const query = status
    ? db.prepare(`SELECT ${columns} FROM leads l LEFT JOIN users u ON u.id=l.assigned_agent_id WHERE l.status=? ORDER BY l.created_at DESC LIMIT 200`).bind(status)
    : db.prepare(`SELECT ${columns} FROM leads l LEFT JOIN users u ON u.id=l.assigned_agent_id ORDER BY l.created_at DESC LIMIT 200`);
  return (await query.all<Record<string, unknown>>()).results;
}

export async function updateLead(id: string, input: { status?: string; assignedAgentId?: string | null }, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db=getD1();const existing = await db.prepare("SELECT id,status FROM leads WHERE id=?").bind(id).first<{id:string;status:string}>();
  if (!existing) throw new Error("Lead not found");
  if (input.assignedAgentId) { const assignee=await db.prepare("SELECT id FROM users WHERE id=? AND role IN ('owner','admin','agent') AND status='active'").bind(input.assignedAgentId).first();if(!assignee)throw new Error("Leads can only be assigned to active travel staff"); }
  const transitions:Record<string,string[]>={new:["contacted","qualified","closed"],contacted:["qualified","closed"],qualified:["contacted","closed"],converted:[],closed:["contacted"]};
  if(input.status&&input.status!==existing.status&&!transitions[existing.status]?.includes(input.status))throw new Error("This lead status transition is not available");
  const updated=await db.prepare("UPDATE leads SET status=COALESCE(?,status), assigned_agent_id=CASE WHEN ?=1 THEN ? ELSE assigned_agent_id END, updated_at=? WHERE id=? AND status=?")
    .bind(input.status ?? null, Object.hasOwn(input, "assignedAgentId") ? 1 : 0, input.assignedAgentId ?? null, Date.now(), id,existing.status).run();
  if((updated.meta?.changes??0)!==1)throw new Error("This lead has already changed");
  await audit(actor, "lead", id, "updated", input); return { id, ...input };
}

export async function convertLead(id: string, input: { kind: "personal" | "corporate" | "event"; origin: string; destination: string; departureDate: string; returnDate: string; travelerCount: number; budgetMinor: number; currency: Currency; interests: string[]; notes?: string }, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const lead = await getD1().prepare("SELECT * FROM leads WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!lead) throw new Error("Lead not found");
  if (lead.converted_trip_request_id) return { id: String(lead.converted_trip_request_id), requestNumber: "Existing request" };
  if (lead.status === "closed") throw new Error("A closed lead cannot be converted");
  const trip = await createTripRequest({ ...input, contactName: String(lead.name), contactEmail: String(lead.email), contactPhone: String(lead.phone || ""), consent: true, consentVersion: String(lead.consent_version || "2026-08"), marketing: JSON.parse(String(lead.marketing_context_json || "{}")) as MarketingContext }, actor);
  const updated = await getD1().prepare("UPDATE leads SET status='converted', converted_trip_request_id=?, updated_at=? WHERE id=? AND converted_trip_request_id IS NULL").bind(trip.id, Date.now(), id).run();
  if ((updated.meta?.changes ?? 0) !== 1) throw new Error("This lead has already been converted");
  await audit(actor, "lead", id, "converted", { tripRequestId: trip.id }); return trip;
}

export async function listUsers(actor: Actor) { if (!can(actor.role, "manage_users")) return []; return (await getD1().prepare("SELECT id, email, full_name, kind, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>()).results; }
export async function listOrganizations(actor: Actor) { if (!isInternalRole(actor.role) || !(can(actor.role,"manage_users")||can(actor.role,"manage_travel")||can(actor.role,"manage_finance"))) return []; return (await getD1().prepare("SELECT id,name,slug,type,status,billing_email,default_currency,approver_user_id,created_at,updated_at FROM organizations ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results; }
export async function listSuppliers(actor: Actor) { if (actor.role !== "partner" && !can(actor.role,"manage_travel")) return []; const sql="SELECT id,organization_id,name,category,email,phone,country,status,created_at,updated_at FROM suppliers";return actor.role==="partner"?(await getD1().prepare(`${sql} WHERE organization_id=? ORDER BY name LIMIT 200`).bind(actor.organizationId).all<Record<string,unknown>>()).results:(await getD1().prepare(`${sql} ORDER BY name LIMIT 200`).all<Record<string, unknown>>()).results; }
export async function listNotifications(actor: Actor) { if (!['owner','admin'].includes(actor.role)) return []; return (await getD1().prepare("SELECT id,user_id,channel,template,destination,status,provider_id,attempts,last_error,sent_at,created_at FROM notifications ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results; }
export async function listActivity(actor: Actor) { if (!can(actor.role, "view_audit")) return []; return (await getD1().prepare("SELECT a.id,a.actor_id,a.organization_id,a.entity_type,a.entity_id,a.action,a.created_at,u.email AS actor_email FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200").all<Record<string, unknown>>()).results; }

export async function organizationWorkspace(actor: Actor) {
  if (!actor.organizationId) return { organization: null, members: [] as Record<string, unknown>[] };
  const db = getD1();
  const organization = await db.prepare("SELECT id,name,slug,type,status,billing_email,default_currency,approver_user_id,created_at,updated_at FROM organizations WHERE id=?").bind(actor.organizationId).first<Record<string, unknown>>();
  const members = (await db.prepare(`SELECT u.id,u.email,u.full_name,u.role,u.status,m.role AS membership_role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY u.full_name,u.email`).bind(actor.organizationId).all<Record<string, unknown>>()).results;
  return { organization, members };
}

export async function dashboardData(actor: Actor) {
  if (actor.role === "partner") {
    const [assignments, tickets, bookings] = await Promise.all([listPartnerAssignments(actor), listSupportTickets(actor, 12), listBookings(actor, 12)]);
    return { requests: [], quotes: [], bookings, invoices: [], tickets, approvals: [], assignments };
  }
  const [requests, bookings, financials] = await Promise.all([listTripRequests(actor, 12), listBookings(actor, 12), listOverviewFinancials(actor)]);
  return {
    requests,
    quotes: financials.filter((row) => row.record_type === "quote"),
    bookings,
    invoices: financials.filter((row) => row.record_type === "invoice"),
    tickets: [], approvals: [], assignments: [],
  };
}

async function listOverviewFinancials(actor: Actor) {
  const db = getD1(); const bindings: unknown[] = [];
  let quoteWhere = "0=1"; let invoiceWhere = "0=1";
  if (isInternalRole(actor.role)) {
    quoteWhere = can(actor.role,"manage_travel") || can(actor.role,"manage_finance") ? "1=1" : "0=1";
    invoiceWhere = can(actor.role,"manage_finance") ? "1=1" : "0=1";
  } else if (actor.organizationId && actor.role.startsWith("corporate_")) {
    quoteWhere = "q.organization_id = ?"; bindings.push(actor.organizationId);
    invoiceWhere = "i.organization_id = ?"; bindings.push(actor.organizationId);
  } else {
    quoteWhere = "(q.user_id = ? OR tr.contact_email = ?)"; bindings.push(actor.id, actor.email);
    invoiceWhere = "i.user_id = ?"; bindings.push(actor.id);
  }
  return (await db.prepare(`
    SELECT 'quote' AS record_type, q.id, q.status, q.created_at FROM quotes q JOIN trip_requests tr ON tr.id=q.trip_request_id WHERE q.current=1 AND ${quoteWhere}
    UNION ALL
    SELECT 'invoice' AS record_type, i.id, i.status, i.created_at FROM invoices i WHERE i.current=1 AND ${invoiceWhere}
    ORDER BY created_at DESC LIMIT 48
  `).bind(...bindings).all<Record<string, unknown>>()).results;
}

export async function workspaceReports(actor: Actor) {
  if (reportScopeForRole(actor.role) === "none") throw new Error("Report access denied");
  const db = getD1();
  const requestFilter = isInternalRole(actor.role) ? (can(actor.role,"manage_travel") ? { sql: "1=1", args: [] as unknown[] } : { sql: "0=1", args: [] as unknown[] }) : actor.organizationId && actor.role.startsWith("corporate_") ? { sql: "organization_id=?", args: [actor.organizationId] } : { sql: "(user_id=? OR contact_email=?)", args: [actor.id, actor.email] };
  const invoiceFilter = isInternalRole(actor.role) ? (can(actor.role,"manage_finance") ? { sql: "1=1", args: [] as unknown[] } : { sql: "0=1", args: [] as unknown[] }) : actor.organizationId && actor.role.startsWith("corporate_") ? { sql: "organization_id=?", args: [actor.organizationId] } : { sql: "user_id=?", args: [actor.id] };
  const supportFilter = isInternalRole(actor.role) ? (can(actor.role,"manage_travel") ? { sql: "1=1", args: [] as unknown[] } : { sql: "0=1", args: [] as unknown[] }) : { sql: "(user_id=? OR organization_id=?)", args: [actor.id, actor.organizationId ?? ""] };
  const [pipeline, finance, totals] = await db.batch([
    db.prepare(`SELECT status, COUNT(*) AS count FROM trip_requests WHERE ${requestFilter.sql} GROUP BY status ORDER BY status`).bind(...requestFilter.args),
    db.prepare(`SELECT currency, COUNT(*) AS invoice_count, COALESCE(SUM(total_minor),0) AS total_minor, COALESCE(SUM(paid_minor),0) AS paid_minor, COALESCE(SUM(due_minor),0) AS due_minor FROM invoices WHERE current=1 AND ${invoiceFilter.sql} GROUP BY currency ORDER BY currency`).bind(...invoiceFilter.args),
    db.prepare(`SELECT (SELECT COUNT(*) FROM bookings WHERE ${invoiceFilter.sql}) AS bookings, (SELECT COUNT(*) FROM support_tickets WHERE ${supportFilter.sql} AND status NOT IN ('resolved','closed')) AS open_support`).bind(...invoiceFilter.args, ...supportFilter.args),
  ]);
  return { pipeline: pipeline.results, finance: finance.results, totals: totals.results[0] ?? { bookings: 0, open_support: 0 } };
}

export async function partnerOperationsDirectories(actor: Actor) {
  if (!can(actor.role,"manage_travel")) return { organizations: [] as Record<string, unknown>[], suppliers: [] as Record<string, unknown>[] };
  const row = await getD1().prepare(`SELECT
    (SELECT COALESCE(json_group_array(json_object('id',id,'name',name,'type',type,'status',status,'billing_email',billing_email)),json('[]')) FROM organizations ORDER BY created_at DESC LIMIT 100) AS organizations_json,
    (SELECT COALESCE(json_group_array(json_object('id',id,'organization_id',organization_id,'name',name,'category',category,'email',email,'phone',phone,'country',country,'status',status)),json('[]')) FROM suppliers ORDER BY name LIMIT 200) AS suppliers_json
  `).first<{ organizations_json: string; suppliers_json: string }>();
  return { organizations: JSON.parse(row?.organizations_json ?? "[]") as Record<string, unknown>[], suppliers: JSON.parse(row?.suppliers_json ?? "[]") as Record<string, unknown>[] };
}

export async function upsertContent(input: ContentInput, actor: Actor) {
  if (!can(actor.role, "manage_content")) throw new Error("Content permission required");
  const db = getD1(); const now = Date.now(); const kind = String(input.kind); const id = String(input.id || createId(kind === "destination" ? "dst" : kind === "package" ? "pkg" : "cnt"));
  if (kind === "destination") {
    await db.prepare(`INSERT INTO destinations (id, slug, name, country, region, summary, description, image_path, status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,name=excluded.name,country=excluded.country,region=excluded.region,summary=excluded.summary,description=excluded.description,image_path=excluded.image_path,status=excluded.status,seo_title=excluded.seo_title,seo_description=excluded.seo_description,published_at=excluded.published_at,updated_at=excluded.updated_at`)
      .bind(id, input.slug, input.title, input.country || "", input.region || "", input.summary, input.description, input.imagePath, input.status, input.seoTitle || null, input.seoDescription || null, input.status === "published" ? now : null, now, now).run();
  } else if (kind === "package") {
    await db.prepare(`INSERT INTO packages (id, destination_id, slug, title, summary, description, duration_days, from_price_minor, currency, image_path, status, seo_title, seo_description, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET destination_id=excluded.destination_id,slug=excluded.slug,title=excluded.title,summary=excluded.summary,description=excluded.description,duration_days=excluded.duration_days,from_price_minor=excluded.from_price_minor,currency=excluded.currency,image_path=excluded.image_path,status=excluded.status,seo_title=excluded.seo_title,seo_description=excluded.seo_description,published_at=excluded.published_at,updated_at=excluded.updated_at`)
      .bind(id, input.destinationId || null, input.slug, input.title, input.summary, input.description, input.durationDays || 1, input.fromPriceMinor || 0, input.currency || "KES", input.imagePath, input.status, input.seoTitle || null, input.seoDescription || null, input.status === "published" ? now : null, now, now).run();
  } else {
    const type = kind === "guide" ? "guide" : "article";
    await db.prepare(`INSERT INTO content_entries (id, type, slug, title, excerpt, body, image_path, status, seo_title, seo_description, author_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,excerpt=excluded.excerpt,body=excluded.body,image_path=excluded.image_path,status=excluded.status,seo_title=excluded.seo_title,seo_description=excluded.seo_description,published_at=excluded.published_at,updated_at=excluded.updated_at`)
      .bind(id, type, input.slug, input.title, input.summary, input.description, input.imagePath, input.status, input.seoTitle || null, input.seoDescription || null, actor.id, input.status === "published" ? now : null, now, now).run();
  }
  const entityType = kind === "destination" ? "destination" : kind === "package" ? "package" : "content";
  const terms = [...new Set(`${input.slug} ${input.title} ${input.summary} ${kind === "destination" ? `${input.country ?? ""} ${input.region ?? ""}` : ""}`.toLowerCase().replace(/[^a-z0-9\s-]/gu," ").replaceAll("-"," ").split(/\s+/u).filter((term)=>term.length>=2))].slice(0,50);
  await db.batch([
    db.prepare("DELETE FROM content_search_terms WHERE entity_type=? AND entity_id=?").bind(entityType,id),
    ...terms.map((term)=>db.prepare("INSERT INTO content_search_terms (id,entity_type,entity_id,term,weight,updated_at) VALUES (?,?,?,?,?,?)").bind(createId("search"),entityType,id,term,term.length>=5?2:1,now)),
  ]);
  await audit(actor, kind, id, "saved", { status: input.status }); return { id, kind, status: input.status };
}

export async function listContent(actor?: Actor | null) {
  const db = getD1(); const statusClause = actor && can(actor.role, "manage_content") ? "" : " WHERE status = 'published'";
  const [destinationRows, packageRows, entries] = await Promise.all([
    db.prepare(`SELECT id, 'destination' AS kind, slug, name AS title, summary, country, region, status, image_path, seo_title, seo_description, updated_at FROM destinations${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, 'package' AS kind, slug, title, summary, duration_days, from_price_minor, currency, destination_id, status, image_path, seo_title, seo_description, updated_at FROM packages${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, type AS kind, slug, title, excerpt AS summary, status, image_path, seo_title, seo_description, updated_at FROM content_entries${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
  ]);
  return [...destinationRows.results, ...packageRows.results, ...entries.results];
}

export async function getContentItem(id: string, actor: Actor) {
  if (!can(actor.role,"manage_content")) throw new Error("Content permission required");
  const row=await getD1().prepare(`SELECT * FROM (
    SELECT id,'destination' AS kind,slug,name AS title,summary,description,country,region,NULL AS duration_days,NULL AS from_price_minor,NULL AS currency,status,image_path,seo_title,seo_description,updated_at FROM destinations
    UNION ALL SELECT id,'package',slug,title,summary,description,NULL,NULL,duration_days,from_price_minor,currency,status,image_path,seo_title,seo_description,updated_at FROM packages
    UNION ALL SELECT id,type,slug,title,excerpt,body,NULL,NULL,NULL,NULL,NULL,status,image_path,seo_title,seo_description,updated_at FROM content_entries
  ) WHERE id=? LIMIT 1`).bind(id).first<Record<string,unknown>>();
  if(!row)throw new Error("Content not found");return row;
}

async function audit(actor: Actor | null, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  await getD1().prepare("INSERT INTO activity_logs (id, actor_id, organization_id, entity_type, entity_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(createId("log"), actor?.id ?? null, actor?.organizationId ?? null, entityType, entityId, action, JSON.stringify(metadata), Date.now()).run();
}
