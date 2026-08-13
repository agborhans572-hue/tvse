import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../../lib/auth";
import { generateQuotePdf } from "../../../../../lib/documents";
import { sendQuoteEmail } from "../../../../../lib/email";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { sendQuote } from "../../../../../lib/repository";
import { publicBaseUrl } from "../../../../../lib/runtime";
import { formatMoney } from "../../../../../lib/travel";
import { forwardOperationsMutation } from "../../../../../lib/operations-client";
import { tenantOverrideSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const key=requireIdempotencyKey(request);const { id } = await params; const input=await parseJson(request,tenantOverrideSchema); const operationsResponse=await forwardOperationsMutation(request,actor,`/v2/quotes/${id}/send`,input);if(operationsResponse)return operationsResponse; const quote=await runIdempotent(`quote-send:${id}`, key, actor, async()=>{await generateQuotePdf(id); const value=await sendQuote(id, actor); await sendQuoteEmail(value.contact_email, value.quote_number, formatMoney(value.total_minor, value.currency), `${publicBaseUrl(request)}/portal`); return value;}); return NextResponse.json({ data: quote }); } catch (error) { return apiError(error); } }
