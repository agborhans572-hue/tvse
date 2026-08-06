import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../../lib/auth";
import { generateQuotePdf } from "../../../../../lib/documents";
import { sendQuoteEmail } from "../../../../../lib/email";
import { apiError, assertSameOrigin } from "../../../../../lib/http";
import { sendQuote } from "../../../../../lib/repository";
import { publicBaseUrl } from "../../../../../lib/runtime";
import { formatMoney } from "../../../../../lib/travel";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const { id } = await params; await generateQuotePdf(id); const quote = await sendQuote(id, actor); await sendQuoteEmail(quote.contact_email, quote.quote_number, formatMoney(quote.total_minor, quote.currency), `${publicBaseUrl(request)}/portal`); return NextResponse.json({ data: quote }); } catch (error) { return apiError(error); } }
