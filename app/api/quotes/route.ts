import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { generateQuotePdf } from "../../../lib/documents";
import { apiError, assertSameOrigin, idempotencyKey, parseJson } from "../../../lib/http";
import { runIdempotent } from "../../../lib/idempotency";
import { createQuote, listQuotes } from "../../../lib/repository";
import { createQuoteSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listQuotes(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const key=idempotencyKey(request); const input = await parseJson(request, createQuoteSchema); const quote = await runIdempotent(`quote-create:${input.tripRequestId}`,key,actor,async()=>{const value=await createQuote(input,actor);await generateQuotePdf(value.id).catch(()=>null);return value;}); return NextResponse.json({ data: quote }, { status: 201 }); } catch (error) { return apiError(error); } }
