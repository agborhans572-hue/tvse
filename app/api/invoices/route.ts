import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { generateInvoicePdf } from "../../../lib/documents";
import { apiError, assertSameOrigin, parseJson } from "../../../lib/http";
import { createInvoice, listInvoices } from "../../../lib/repository";
import { invoiceSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listInvoices(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "finance"]); const input = await parseJson(request, invoiceSchema); const invoice = await createInvoice(input.bookingId, input.dueDate, input.taxMinor, actor); await generateInvoicePdf(invoice.id).catch(() => null); return NextResponse.json({ data: invoice }, { status: 201 }); } catch (error) { return apiError(error); } }
