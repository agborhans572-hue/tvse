import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../../lib/auth";
import { generateReceiptPdf } from "../../../../../lib/documents";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { recordPayment } from "../../../../../lib/repository";
import { paymentSchema } from "../../../../../lib/validation";
import { runIdempotent } from "../../../../../lib/idempotency";
import { sendPaymentReceiptEmail } from "../../../../../lib/email";
import { formatMoney } from "../../../../../lib/travel";
import { publicBaseUrl } from "../../../../../lib/runtime";
import { forwardOperationsMutation } from "../../../../../lib/operations-client";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "finance"]); const key=requireIdempotencyKey(request); const input = await parseJson(request, paymentSchema); const { id } = await params; const operationsResponse=await forwardOperationsMutation(request,actor,`/v2/invoices/${id}/payments`,input);if(operationsResponse)return operationsResponse; const payment = await runIdempotent(`payment:${id}`, key, actor, async()=>{const value=await recordPayment(id, input, actor, key); await generateReceiptPdf(value.id).catch(() => null); await sendPaymentReceiptEmail(value.contactEmail, value.receiptNumber, formatMoney(value.amountMinor, value.currency), `${publicBaseUrl(request)}/portal/documents`); return value;}); return NextResponse.json({ data: payment }, { status: 201 }); } catch (error) { return apiError(error); } }
