import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getD1, getUploads } from "../db";
import { formatMoney, type Currency } from "./travel";

type DocumentInput = { title: string; reference: string; subtitle: string; sections: Array<{ heading: string; lines: string[] }>; footer?: string };

async function buildPdf(input: DocumentInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]); let y = 770;
  const newPage = () => { page = pdf.addPage([595, 842]); y = 780; };
  page.drawRectangle({ x: 0, y: 785, width: 595, height: 57, color: rgb(.34, .2, 1) });
  page.drawText("TVSE TRAVEL", { x: 42, y: 808, size: 14, font: bold, color: rgb(1,1,1) });
  page.drawText(input.title, { x: 42, y, size: 28, font: bold, color: rgb(.04,.04,.05) }); y -= 31;
  page.drawText(input.reference, { x: 42, y, size: 12, font: bold, color: rgb(1,.31,0) }); y -= 22;
  page.drawText(input.subtitle, { x: 42, y, size: 11, font: regular, color: rgb(.35,.37,.42) }); y -= 36;
  for (const section of input.sections) {
    if (y < 110) newPage();
    page.drawText(section.heading.toUpperCase(), { x: 42, y, size: 10, font: bold, color: rgb(.34,.2,1) }); y -= 22;
    for (const line of section.lines) {
      for (const wrapped of wrap(line, 82)) {
        if (y < 75) newPage();
        page.drawText(wrapped, { x: 52, y, size: 10.5, font: regular, color: rgb(.12,.13,.16) }); y -= 16;
      }
      y -= 3;
    }
    y -= 18;
  }
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    current.drawLine({ start: { x: 42, y: 44 }, end: { x: 553, y: 44 }, thickness: .5, color: rgb(.82,.82,.85) });
    current.drawText(input.footer ?? "TVSE Travel Agency Ltd · Nairobi, Kenya", { x: 42, y: 27, size: 8, font: regular, color: rgb(.42,.44,.48) });
    current.drawText(`${index + 1}/${pages.length}`, { x: 525, y: 27, size: 8, font: regular, color: rgb(.42,.44,.48) });
  });
  return pdf.save();
}

function wrap(value: string, max: number): string[] {
  const words = value.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (next.length > max && line) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}

async function storePdf(key: string, bytes: Uint8Array) {
  await getUploads().put(key, bytes, { httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${key.split("/").at(-1)}"` } });
}

export async function generateQuotePdf(quoteId: string) {
  const db = getD1();
  const row = await db.prepare(`SELECT q.quote_number, q.currency, q.current_version, qv.id AS version_id, qv.subtotal_minor, qv.fees_minor, qv.tax_minor, qv.total_minor, qv.notes, tr.contact_name, tr.destination, tr.departure_date, tr.return_date FROM quotes q JOIN quote_versions qv ON qv.quote_id=q.id AND qv.version=q.current_version JOIN trip_requests tr ON tr.id=q.trip_request_id WHERE q.id=?`).bind(quoteId).first<Record<string, unknown>>();
  if (!row) throw new Error("Quote not found");
  const items = (await db.prepare("SELECT description, quantity, total_minor FROM quote_items WHERE quote_version_id = ? ORDER BY position").bind(row.version_id).all<{ description: string; quantity: number; total_minor: number }>()).results;
  const currency = row.currency as Currency; const key = `documents/quotes/${row.quote_number}-v${row.current_version}.pdf`;
  const bytes = await buildPdf({ title: "Travel proposal", reference: String(row.quote_number), subtitle: `${row.contact_name} · ${row.destination} · ${row.departure_date} to ${row.return_date}`, sections: [
    { heading: "Your journey", lines: items.map((item) => `${item.description} × ${item.quantity} — ${formatMoney(item.total_minor, currency)}`) },
    { heading: "Investment", lines: [`Subtotal: ${formatMoney(Number(row.subtotal_minor), currency)}`, `Service fees: ${formatMoney(Number(row.fees_minor), currency)}`, `Tax: ${formatMoney(Number(row.tax_minor), currency)}`, `Total: ${formatMoney(Number(row.total_minor), currency)}`] },
    ...(row.notes ? [{ heading: "Notes", lines: [String(row.notes)] }] : []),
  ] });
  await storePdf(key, bytes); await db.prepare("UPDATE quote_versions SET pdf_key = ? WHERE id = ?").bind(key, row.version_id).run();
  return key;
}

export async function generateInvoicePdf(invoiceId: string) {
  const db = getD1(); const row = await db.prepare(`SELECT i.*, b.booking_number, b.destination FROM invoices i JOIN bookings b ON b.id=i.booking_id WHERE i.id=?`).bind(invoiceId).first<Record<string, unknown>>();
  if (!row) throw new Error("Invoice not found"); const currency = row.currency as Currency;
  const items = (await db.prepare("SELECT description, quantity, total_minor FROM invoice_items WHERE invoice_id=? ORDER BY position").bind(invoiceId).all<{ description: string; quantity: number; total_minor: number }>()).results;
  const key = `documents/invoices/${row.invoice_number}.pdf`;
  const bytes = await buildPdf({ title: "Invoice", reference: String(row.invoice_number), subtitle: `${row.booking_number} · ${row.destination}`, sections: [
    { heading: "Services", lines: items.map((item) => `${item.description} × ${item.quantity} — ${formatMoney(item.total_minor, currency)}`) },
    { heading: "Balance", lines: [`Total: ${formatMoney(Number(row.total_minor), currency)}`, `Paid: ${formatMoney(Number(row.paid_minor), currency)}`, `Due: ${formatMoney(Number(row.due_minor), currency)}`, `Due date: ${row.due_date}`] },
  ], footer: "TVSE Travel Agency Ltd · Payment instructions are supplied separately by your travel specialist." });
  await storePdf(key, bytes); await db.prepare("UPDATE invoices SET pdf_key=? WHERE id=?").bind(key, invoiceId).run(); return key;
}

export async function generateReceiptPdf(paymentId: string) {
  const db = getD1(); const row = await db.prepare(`SELECT p.*, i.invoice_number, b.booking_number, b.destination FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN bookings b ON b.id=i.booking_id WHERE p.id=?`).bind(paymentId).first<Record<string, unknown>>();
  if (!row) throw new Error("Payment not found"); const currency = row.currency as Currency; const key = `documents/receipts/${row.receipt_number}.pdf`;
  const bytes = await buildPdf({ title: "Payment receipt", reference: String(row.receipt_number), subtitle: `${row.invoice_number} · ${row.booking_number}`, sections: [
    { heading: "Payment received", lines: [`Amount: ${formatMoney(Number(row.amount_minor), currency)}`, `Method: ${String(row.method).replaceAll("_", " ")}`, `Reference: ${row.reference || "—"}`, `Date: ${new Date(Number(row.paid_at)).toLocaleDateString("en-KE")}`, `Journey: ${row.destination}`] },
  ] });
  await storePdf(key, bytes); await db.prepare("UPDATE payments SET receipt_key=? WHERE id=?").bind(key, paymentId).run(); return key;
}

export async function generateItineraryPdf(bookingId: string) {
  const db = getD1(); const row = await db.prepare("SELECT * FROM bookings WHERE id=?").bind(bookingId).first<Record<string, unknown>>(); if (!row) throw new Error("Booking not found");
  const days = (await db.prepare("SELECT day_number, date, title, description, location FROM itinerary_days WHERE booking_id=? ORDER BY day_number").bind(bookingId).all<Record<string, unknown>>()).results;
  const key = `documents/itineraries/${row.booking_number}.pdf`; const bytes = await buildPdf({ title: "Travel itinerary", reference: String(row.booking_number), subtitle: `${row.destination} · ${row.departure_date} to ${row.return_date}`, sections: days.length ? days.map((day) => ({ heading: `Day ${day.day_number} · ${day.date}`, lines: [`${day.title}${day.location ? ` · ${day.location}` : ""}`, String(day.description || "Details will be confirmed by your TVSE specialist.")] })) : [{ heading: "Journey overview", lines: ["Your confirmed day-by-day itinerary will appear here as TVSE finalizes each service."] }] });
  await storePdf(key, bytes); await db.prepare("UPDATE bookings SET itinerary_pdf_key=? WHERE id=?").bind(key, bookingId).run(); return key;
}
