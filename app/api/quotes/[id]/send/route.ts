import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../../lib/auth";
import { generateQuotePdf } from "../../../../../lib/documents";
import { sendQuoteEmail } from "../../../../../lib/email";
import { apiError, assertSameOrigin, idempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { sendQuote } from "../../../../../lib/repository";
import { publicBaseUrl } from "../../../../../lib/runtime";
import { formatMoney } from "../../../../../lib/travel";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const { id } = await params; const quote=await runIdempotent(`quote-send:${id}`, idempotencyKey(request), actor, async()=>{await generateQuotePdf(id); const value=await sendQuote(id, actor); await sendQuoteEmail(value.contact_email, value.quote_number, formatMoney(value.total_minor, value.currency), `${publicBaseUrl(request)}/portal`); return value;}); return NextResponse.json({ data: quote }); } catch (error) { return apiError(error); } }
