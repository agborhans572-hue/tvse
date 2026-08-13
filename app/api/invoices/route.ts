import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { generateInvoicePdf } from "../../../lib/documents";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../lib/http";
import { runIdempotent } from "../../../lib/idempotency";
import { createInvoice, listInvoices } from "../../../lib/repository";
import { invoiceSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listInvoices(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "finance"]); const key=requireIdempotencyKey(request); const input = await parseJson(request, invoiceSchema); const invoice = await runIdempotent(`invoice:${input.bookingId}`, key, actor, async()=>{const value=await createInvoice(input.bookingId, input.dueDate, input.taxMinor, actor); await generateInvoicePdf(value.id).catch(() => null); return value;}); return NextResponse.json({ data: invoice }, { status: 201 }); } catch (error) { return apiError(error); } }
