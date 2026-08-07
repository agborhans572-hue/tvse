import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, idempotencyKey, parseJson } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { generateQuotePdf } from "../../../../../lib/documents";
import { reviseQuote } from "../../../../../lib/repository";
import { reviseQuoteSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, reviseQuoteSchema); const { id } = await params; const value=await runIdempotent(`quote-revise:${id}`,idempotencyKey(request),actor,async()=>{const result=await reviseQuote(id,input,actor);await generateQuotePdf(id).catch(()=>null);return result;}); return NextResponse.json({ data:value }, { status: 201 }); } catch (error) { return apiError(error); } }
