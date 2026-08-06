import { getD1 } from "../db";
import { createId, nextDocumentNumber } from "./ids";
import type { Actor, BookingStatus, Currency, Role, TripRequestStatus } from "./travel";
import { assertTransition, calculateInvoiceBalance, calculateLineTotal, can, isInternalRole } from "./travel";

export type ContactInput = { name: string; email: string; phone?: string; company?: string; type: "personal" | "support" | "corporate" | "partner"; message: string };
export type TripInput = { kind: "personal" | "corporate" | "event"; contactName: string; contactEmail: string; contactPhone?: string; origin: string; destination: string; departureDate: string; returnDate: string; travelerCount: number; budgetMinor: number; currency: Currency; interests: string[]; notes?: string; organizationId?: string };
export type QuoteInput = { tripRequestId: string; currency: Currency; exchangeRate: number; expiresAt?: number; feesMinor: number; taxMinor: number; notes?: string; items: Array<{ category: string; description: string; serviceDate?: string; quantity: number; unitPriceMinor: number; markupMinor: number; taxMinor: number; supplierId?: string }> };

export async function createLead(input: ContactInput, actor?: Actor | null) {
  const db = getD1(); const id = createId("lead"); const now = Date.now();
  await db.prepare("INSERT INTO leads (id, user_id, type, status, name, email, phone, company, message, source, created_at, updated_at) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, 'website', ?, ?)")
    .bind(id, actor?.id ?? null, input.type, input.name, input.email.toLowerCase(), input.phone || null, input.company || null, input.message, now, now).run();
  await audit(actor ?? null, "lead", id, "created", { source: "website", type: input.type });
  return { id, status: "new" as const };
}

export async function createTripRequest(input: TripInput, actor?: Actor | null) {
  const db = getD1(); const now = Date.now(); const id = createId("trp"); const requestNumber = await nextDocumentNumber("REQ");
  let userId = actor?.id ?? null;
  if (!userId) {
    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(input.contactEmail.toLowerCase()).first<{ id: string }>();
    if (existing) userId = existing.id;
  }
  const organizationId = input.organizationId ?? actor?.organizationId ?? null;
  let approverId: string | null = null; let approvalStatus = "not_required";
  if (input.kind === "corporate" && organizationId) {
    const org = await db.prepare("SELECT approver_user_id FROM organizations WHERE id = ?").bind(organizationId).first<{ approver_user_id: string | null }>();
    approverId = org?.approver_user_id ?? null; approvalStatus = approverId ? "pending" : "not_required";
  }
  await db.prepare(`INSERT INTO trip_requests (id, request_number, user_id, organization_id, kind, status, approval_status, approver_id, contact_name, contact_email, contact_phone, origin, destination, departure_date, return_date, traveler_count, budget_minor, currency, interests_json, notes, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'website', ?, ?)`)
    .bind(id, requestNumber, userId, organizationId, input.kind, approvalStatus, approverId, input.contactName, input.contactEmail.toLowerCase(), input.contactPhone || null, input.origin, input.destination, input.departureDate, input.returnDate, input.travelerCount, input.budgetMinor, input.currency, JSON.stringify(input.interests), input.notes || null, now, now).run();
  if (approverId) await db.prepare("INSERT INTO approvals (id, entity_type, entity_id, approver_id, status, created_at) VALUES (?, 'trip_request', ?, ?, 'pending', ?)").bind(createId("apr"), id, approverId, now).run();
  await audit(actor ?? null, "trip_request", id, "submitted", { requestNumber });
  return { id, requestNumber, status: "submitted" as const, contactEmail: input.contactEmail, contactName: input.contactName };
}

export async function listTripRequests(actor: Actor, limit = 50) {
  const db = getD1();
  if (isInternalRole(actor.role)) return (await db.prepare("SELECT * FROM trip_requests ORDER BY created_at DESC LIMIT ?").bind(limit).all<Record<string, unknown>>()).results;
  if (actor.organizationId && ["corporate_requester", "corporate_approver"].includes(actor.role)) return (await db.prepare("SELECT * FROM trip_requests WHERE organization_id = ? ORDER BY created_at DESC LIMIT ?").bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare("SELECT * FROM trip_requests WHERE user_id = ? OR contact_email = ? ORDER BY created_at DESC LIMIT ?").bind(actor.id, actor.email, limit).all<Record<string, unknown>>()).results;
}

export async function decideTripApproval(id: string, actor: Actor, decision: "approved" | "declined", comment = "") {
  if (actor.role !== "corporate_approver" && !isInternalRole(actor.role)) throw new Error("Only an assigned approver can decide this request");
  const db = getD1(); const now = Date.now();
  const approval = await db.prepare("SELECT id, approver_id, status FROM approvals WHERE entity_type = 'trip_request' AND entity_id = ? ORDER BY created_at DESC LIMIT 1").bind(id).first<{ id: string; approver_id: string; status: string }>();
  if (!approval || approval.status !== "pending" || (actor.role === "corporate_approver" && approval.approver_id !== actor.id)) throw new Error("Approval is not available");
  await db.batch([
    db.prepare("UPDATE approvals SET status = ?, comment = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(decision, comment || null, now, approval.id),
    db.prepare("UPDATE trip_requests SET approval_status = ?, updated_at = ? WHERE id = ?").bind(decision, now, id),
  ]);
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
  const statements = [
    db.prepare("INSERT INTO quotes (id, quote_number, trip_request_id, user_id, organization_id, status, current_version, currency, exchange_rate, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?, ?, ?)")
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
  const quote = await db.prepare("SELECT id, quote_number, status, current_version FROM quotes WHERE id = ?").bind(quoteId).first<{ id: string; quote_number: string; status: string; current_version: number }>();
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
  const row = await db.prepare(`SELECT q.id, q.quote_number, q.status, q.currency, tr.contact_email, qv.total_minor FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version WHERE q.id = ?`).bind(id).first<{ id: string; quote_number: string; status: string; currency: Currency; contact_email: string; total_minor: number }>();
  if (!row || row.status !== "draft") throw new Error("Only a draft quote can be sent");
  await db.batch([db.prepare("UPDATE quotes SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'").bind(now, now, id), db.prepare("UPDATE trip_requests SET status = 'quoted', updated_at = ? WHERE id = (SELECT trip_request_id FROM quotes WHERE id = ?)").bind(now, id)]);
  await audit(actor, "quote", id, "sent", { quoteNumber: row.quote_number }); return row;
}

export async function listQuotes(actor: Actor, limit = 50) {
  const db = getD1(); const select = `SELECT q.*, qv.total_minor, qv.pdf_key, tr.destination, tr.departure_date, tr.return_date, tr.contact_name, tr.contact_email FROM quotes q JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version JOIN trip_requests tr ON tr.id = q.trip_request_id`;
  if (isInternalRole(actor.role)) return (await db.prepare(`${select} ORDER BY q.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results;
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE q.organization_id = ? ORDER BY q.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE q.user_id = ? OR tr.contact_email = ? ORDER BY q.created_at DESC LIMIT ?`).bind(actor.id, actor.email, limit).all<Record<string, unknown>>()).results;
}

export async function decideQuote(id: string, actor: Actor, decision: "approved" | "declined", comment = "") {
  const db = getD1(); const row = await db.prepare("SELECT q.*, tr.contact_email FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id WHERE q.id = ?").bind(id).first<Record<string, unknown>>();
  if (!row || !["sent", "viewed"].includes(String(row.status))) throw new Error("This quote cannot be decided");
  if (!isInternalRole(actor.role) && row.user_id !== actor.id && row.contact_email !== actor.email && row.organization_id !== actor.organizationId) throw new Error("This quote does not belong to you");
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE quotes SET status = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status IN ('sent','viewed')").bind(decision, decision === "approved" ? now : null, now, id),
    db.prepare("UPDATE trip_requests SET status = ?, updated_at = ? WHERE id = ?").bind(decision, now, row.trip_request_id),
    db.prepare("INSERT INTO approvals (id, entity_type, entity_id, approver_id, status, comment, decided_at, created_at) VALUES (?, 'quote', ?, ?, ?, ?, ?, ?)").bind(createId("apr"), id, actor.id, decision, comment || null, now, now),
  ]);
  await audit(actor, "quote", id, decision, { comment }); return { id, decision };
}

export async function createBookingFromQuote(quoteId: string, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const quote = await db.prepare(`SELECT q.*, tr.destination, tr.departure_date, tr.return_date, tr.traveler_count FROM quotes q JOIN trip_requests tr ON tr.id = q.trip_request_id WHERE q.id = ?`).bind(quoteId).first<Record<string, unknown>>();
  if (!quote || quote.status !== "approved") throw new Error("Only an approved quote can become a booking");
  const existing = await db.prepare("SELECT id, booking_number FROM bookings WHERE quote_id = ?").bind(quoteId).first<{ id: string; booking_number: string }>();
  if (existing) return { id: existing.id, bookingNumber: existing.booking_number };
  const id = createId("bkg"); const bookingNumber = await nextDocumentNumber("B"); const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO bookings (id, booking_number, quote_id, trip_request_id, user_id, organization_id, status, destination, departure_date, return_date, traveler_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)")
      .bind(id, bookingNumber, quoteId, quote.trip_request_id, quote.user_id ?? null, quote.organization_id ?? null, quote.destination, quote.departure_date, quote.return_date, quote.traveler_count, now, now),
    db.prepare("UPDATE trip_requests SET status = 'converted', updated_at = ? WHERE id = ?").bind(now, quote.trip_request_id),
  ]);
  await audit(actor, "booking", id, "created", { bookingNumber, quoteId }); return { id, bookingNumber, destination: String(quote.destination) };
}

export async function listBookings(actor: Actor, limit = 50) {
  const db = getD1();
  const select = "SELECT b.*, q.quote_number FROM bookings b JOIN quotes q ON q.id = b.quote_id";
  if (isInternalRole(actor.role)) return (await db.prepare(`${select} ORDER BY b.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results;
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE b.organization_id = ? ORDER BY b.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT ?`).bind(actor.id, limit).all<Record<string, unknown>>()).results;
}

export async function createInvoice(bookingId: string, dueDate: string, taxMinor: number, actor: Actor) {
  if (!can(actor.role, "manage_finance")) throw new Error("Finance permission required");
  const db = getD1(); const booking = await db.prepare(`SELECT b.*, q.currency, q.exchange_rate, q.current_version, qv.total_minor, qv.subtotal_minor FROM bookings b JOIN quotes q ON q.id = b.quote_id JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version WHERE b.id = ?`).bind(bookingId).first<Record<string, unknown>>();
  if (!booking) throw new Error("Booking not found");
  const existing = await db.prepare("SELECT id, invoice_number FROM invoices WHERE booking_id = ? AND status != 'void'").bind(bookingId).first<{ id: string; invoice_number: string }>();
  if (existing) return { id: existing.id, invoiceNumber: existing.invoice_number };
  const id = createId("inv"); const invoiceNumber = await nextDocumentNumber("INV"); const now = Date.now(); const subtotal = Number(booking.total_minor); const total = subtotal + taxMinor;
  await db.prepare("INSERT INTO invoices (id, invoice_number, booking_id, user_id, organization_id, status, currency, exchange_rate, subtotal_minor, tax_minor, total_minor, paid_minor, due_minor, issue_date, due_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)")
    .bind(id, invoiceNumber, bookingId, booking.user_id ?? null, booking.organization_id ?? null, booking.currency, booking.exchange_rate, subtotal, taxMinor, total, total, new Date(now).toISOString().slice(0, 10), dueDate, now, now).run();
  await db.prepare("INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price_minor, tax_minor, total_minor, position) VALUES (?, ?, ?, 1, ?, ?, ?, 0)")
    .bind(createId("ii"), id, `Travel services for ${booking.booking_number}`, subtotal, taxMinor, total).run();
  await audit(actor, "invoice", id, "issued", { invoiceNumber, total }); return { id, invoiceNumber, totalMinor: total, currency: booking.currency as Currency };
}

export async function listInvoices(actor: Actor, limit = 50) {
  const db = getD1(); const select = "SELECT i.*, b.booking_number, b.destination FROM invoices i JOIN bookings b ON b.id = i.booking_id";
  if (isInternalRole(actor.role)) return (await db.prepare(`${select} ORDER BY i.created_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results;
  if (actor.organizationId && actor.role.startsWith("corporate_")) return (await db.prepare(`${select} WHERE i.organization_id = ? ORDER BY i.created_at DESC LIMIT ?`).bind(actor.organizationId, limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE i.user_id = ? ORDER BY i.created_at DESC LIMIT ?`).bind(actor.id, limit).all<Record<string, unknown>>()).results;
}

export async function recordPayment(invoiceId: string, input: { amountMinor: number; currency: Currency; method: string; reference?: string; paidAt?: number; note?: string }, actor: Actor) {
  if (!can(actor.role, "manage_finance")) throw new Error("Finance permission required");
  const db = getD1(); const invoice = await db.prepare("SELECT * FROM invoices WHERE id = ?").bind(invoiceId).first<Record<string, unknown>>();
  if (!invoice || ["void", "paid"].includes(String(invoice.status))) throw new Error("Invoice cannot accept a payment");
  if (invoice.currency !== input.currency) throw new Error("Payment currency must match the invoice");
  const existingPayments = (await db.prepare("SELECT amount_minor FROM payments WHERE invoice_id = ?").bind(invoiceId).all<{ amount_minor: number }>()).results.map((item) => item.amount_minor);
  const balance = calculateInvoiceBalance(Number(invoice.total_minor), [...existingPayments, input.amountMinor]);
  const id = createId("pay"); const receiptNumber = await nextDocumentNumber("RCT"); const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO payments (id, receipt_number, invoice_id, amount_minor, currency, method, reference, paid_at, recorded_by, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, receiptNumber, invoiceId, input.amountMinor, input.currency, input.method, input.reference || null, input.paidAt ?? now, actor.id, input.note || null, now),
    db.prepare("UPDATE invoices SET paid_minor = ?, due_minor = ?, status = ?, updated_at = ? WHERE id = ?").bind(balance.paidMinor, balance.dueMinor, balance.status, now, invoiceId),
  ]);
  await audit(actor, "payment", id, "recorded", { receiptNumber, invoiceId, amountMinor: input.amountMinor }); return { id, receiptNumber, ...balance };
}

export async function createSupportTicket(input: { bookingId?: string; subject: string; priority: string; message: string }, actor: Actor) {
  const db = getD1(); const id = createId("tkt"); const ticketNumber = await nextDocumentNumber("TKT"); const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO support_tickets (id, ticket_number, user_id, organization_id, booking_id, subject, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)")
      .bind(id, ticketNumber, actor.id, actor.organizationId ?? null, input.bookingId || null, input.subject, input.priority, now, now),
    db.prepare("INSERT INTO messages (id, ticket_id, sender_id, body, internal, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(createId("msg"), id, actor.id, input.message, now),
  ]);
  await audit(actor, "support_ticket", id, "opened", { ticketNumber }); return { id, ticketNumber };
}

export async function listSupportTickets(actor: Actor, limit = 50) {
  const db = getD1(); const select = "SELECT t.*, (SELECT body FROM messages WHERE ticket_id = t.id AND internal = 0 ORDER BY created_at DESC LIMIT 1) AS latest_message FROM support_tickets t";
  if (isInternalRole(actor.role)) return (await db.prepare(`${select} ORDER BY t.updated_at DESC LIMIT ?`).bind(limit).all<Record<string, unknown>>()).results;
  return (await db.prepare(`${select} WHERE t.user_id = ? OR t.organization_id = ? ORDER BY t.updated_at DESC LIMIT ?`).bind(actor.id, actor.organizationId ?? "", limit).all<Record<string, unknown>>()).results;
}

export async function listApprovals(actor: Actor) {
  const db = getD1();
  if (actor.role === "corporate_approver") return (await db.prepare(`SELECT a.*, tr.request_number, tr.destination, tr.departure_date, tr.return_date, tr.budget_minor, tr.currency FROM approvals a JOIN trip_requests tr ON tr.id = a.entity_id WHERE a.entity_type = 'trip_request' AND a.approver_id = ? ORDER BY a.created_at DESC`).bind(actor.id).all<Record<string, unknown>>()).results;
  if (isInternalRole(actor.role)) return (await db.prepare("SELECT * FROM approvals ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results;
  return [];
}

export async function listPartnerAssignments(actor: Actor) {
  if (actor.role !== "partner" && !isInternalRole(actor.role)) return [];
  const db = getD1();
  if (isInternalRole(actor.role)) return (await db.prepare(`SELECT sa.*, b.booking_number, b.destination, s.name AS supplier_name FROM service_assignments sa JOIN bookings b ON b.id = sa.booking_id JOIN suppliers s ON s.id = sa.supplier_id ORDER BY sa.created_at DESC LIMIT 100`).all<Record<string, unknown>>()).results;
  return (await db.prepare(`SELECT sa.*, b.booking_number, b.destination, s.name AS supplier_name FROM service_assignments sa JOIN bookings b ON b.id = sa.booking_id JOIN suppliers s ON s.id = sa.supplier_id JOIN memberships m ON m.organization_id = s.organization_id WHERE m.user_id = ? ORDER BY sa.created_at DESC`).bind(actor.id).all<Record<string, unknown>>()).results;
}

export async function updatePartnerAssignment(id: string, status: "confirmed" | "declined" | "completed", note: string, actor: Actor) {
  if (actor.role !== "partner" && !can(actor.role, "manage_travel")) throw new Error("Partner access required");
  const db = getD1(); const now = Date.now();
  if (actor.role === "partner") {
    const owned = await db.prepare(`SELECT sa.id FROM service_assignments sa JOIN suppliers s ON s.id = sa.supplier_id JOIN memberships m ON m.organization_id = s.organization_id WHERE sa.id = ? AND m.user_id = ?`).bind(id, actor.id).first();
    if (!owned) throw new Error("Assignment not found");
  }
  await db.prepare("UPDATE service_assignments SET status = ?, partner_note = ?, confirmed_at = CASE WHEN ? = 'confirmed' THEN ? ELSE confirmed_at END, updated_at = ? WHERE id = ?")
    .bind(status, note || null, status, now, now, id).run();
  await audit(actor, "service_assignment", id, status, { note }); return { id, status };
}

export async function updateTripRequestStatus(id: string, status: TripRequestStatus, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const row = await db.prepare("SELECT status FROM trip_requests WHERE id = ?").bind(id).first<{ status: TripRequestStatus }>();
  if (!row) throw new Error("Trip request not found"); assertTransition("tripRequest", row.status, status);
  await db.prepare("UPDATE trip_requests SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), id).run();
  await audit(actor, "trip_request", id, `status_${status}`, { from: row.status }); return { id, status };
}

export async function updateBookingStatus(id: string, status: BookingStatus, actor: Actor) {
  if (!can(actor.role, "manage_travel")) throw new Error("Travel operations permission required");
  const db = getD1(); const row = await db.prepare("SELECT status FROM bookings WHERE id = ?").bind(id).first<{ status: BookingStatus }>();
  if (!row) throw new Error("Booking not found"); assertTransition("booking", row.status, status);
  await db.prepare("UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?").bind(status, Date.now(), id).run();
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

export async function inviteUser(input: { email: string; fullName: string; role: Role; organizationId?: string }, actor: Actor) {
  if (!can(actor.role, "manage_users")) throw new Error("User administration permission required");
  const db = getD1(); const now = Date.now(); const normalized = input.email.toLowerCase();
  const row = await db.prepare("SELECT id FROM users WHERE email = ?").bind(normalized).first<{ id: string }>(); const id = row?.id ?? createId("usr");
  const kind = isInternalRole(input.role) ? "staff" : input.role === "partner" ? "partner" : input.role.startsWith("corporate_") ? "corporate" : "traveler";
  if (row) await db.prepare("UPDATE users SET full_name = ?, kind = ?, role = ?, status = 'invited', updated_at = ? WHERE id = ?").bind(input.fullName, kind, input.role, now, id).run();
  else await db.prepare("INSERT INTO users (id, email, full_name, kind, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'invited', ?, ?)").bind(id, normalized, input.fullName, kind, input.role, now, now).run();
  if (input.organizationId) {
    await db.prepare("INSERT OR IGNORE INTO memberships (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(createId("mem"), input.organizationId, id, input.role === "partner" ? "partner_user" : input.role === "corporate_approver" ? "approver" : "requester", now).run();
    if (input.role === "corporate_approver") await db.prepare("UPDATE organizations SET approver_user_id = ?, updated_at = ? WHERE id = ? AND type = 'corporate'").bind(id, now, input.organizationId).run();
  }
  await audit(actor, "user", id, "invited", { role: input.role }); return { id, email: normalized, role: input.role };
}

export async function listUsers(actor: Actor) { if (!can(actor.role, "manage_users")) return []; return (await getD1().prepare("SELECT id, email, full_name, kind, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>()).results; }
export async function listOrganizations(actor: Actor) { if (!isInternalRole(actor.role)) return []; return (await getD1().prepare("SELECT * FROM organizations ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results; }
export async function listSuppliers(actor: Actor) { if (!isInternalRole(actor.role) && actor.role !== "partner") return []; return (await getD1().prepare("SELECT * FROM suppliers ORDER BY name").all<Record<string, unknown>>()).results; }
export async function listNotifications(actor: Actor) { if (!isInternalRole(actor.role)) return []; return (await getD1().prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>()).results; }
export async function listActivity(actor: Actor) { if (!can(actor.role, "view_audit")) return []; return (await getD1().prepare("SELECT a.*, u.email AS actor_email FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200").all<Record<string, unknown>>()).results; }

export async function organizationWorkspace(actor: Actor) {
  if (!actor.organizationId) return { organization: null, members: [] as Record<string, unknown>[] };
  const db = getD1();
  const organization = await db.prepare("SELECT * FROM organizations WHERE id=?").bind(actor.organizationId).first<Record<string, unknown>>();
  const members = (await db.prepare(`SELECT u.id,u.email,u.full_name,u.role,u.status,m.role AS membership_role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY u.full_name,u.email`).bind(actor.organizationId).all<Record<string, unknown>>()).results;
  return { organization, members };
}

export async function dashboardData(actor: Actor) {
  const [requests, quotes, bookings, invoices, tickets, approvals, assignments] = await Promise.all([listTripRequests(actor, 12), listQuotes(actor, 12), listBookings(actor, 12), listInvoices(actor, 12), listSupportTickets(actor, 12), listApprovals(actor), listPartnerAssignments(actor)]);
  return { requests, quotes, bookings, invoices, tickets, approvals, assignments };
}

export async function upsertContent(input: Record<string, unknown>, actor: Actor) {
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
  await audit(actor, kind, id, "saved", { status: input.status }); return { id, kind, status: input.status };
}

export async function listContent(actor?: Actor | null) {
  const db = getD1(); const statusClause = actor && can(actor.role, "manage_content") ? "" : " WHERE status = 'published'";
  const [destinationRows, packageRows, entries] = await Promise.all([
    db.prepare(`SELECT id, 'destination' AS kind, slug, name AS title, summary, status, image_path, updated_at FROM destinations${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, 'package' AS kind, slug, title, summary, status, image_path, updated_at FROM packages${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, type AS kind, slug, title, excerpt AS summary, status, image_path, updated_at FROM content_entries${statusClause} ORDER BY updated_at DESC`).all<Record<string, unknown>>(),
  ]);
  return [...destinationRows.results, ...packageRows.results, ...entries.results];
}

async function audit(actor: Actor | null, entityType: string, entityId: string, action: string, metadata: Record<string, unknown>) {
  await getD1().prepare("INSERT INTO activity_logs (id, actor_id, organization_id, entity_type, entity_id, action, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(createId("log"), actor?.id ?? null, actor?.organizationId ?? null, entityType, entityId, action, JSON.stringify(metadata), Date.now()).run();
}
