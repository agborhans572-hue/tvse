import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../../lib/auth";
import { generateReceiptPdf } from "../../../../../lib/documents";
import { apiError, assertSameOrigin, parseJson } from "../../../../../lib/http";
import { recordPayment } from "../../../../../lib/repository";
import { paymentSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "finance"]); const input = await parseJson(request, paymentSchema); const { id } = await params; const payment = await recordPayment(id, input, actor); await generateReceiptPdf(payment.id).catch(() => null); return NextResponse.json({ data: payment }, { status: 201 }); } catch (error) { return apiError(error); } }
