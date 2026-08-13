import { NextResponse } from "next/server";
import { getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { decideQuote } from "../../../../../lib/repository";
import { quoteDecisionSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request);const key=requireIdempotencyKey(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const input = await parseJson(request, quoteDecisionSchema); const { id } = await params; const data=await runIdempotent(`quote:${id}:decision`,key,actor,()=>decideQuote(id,actor,input.decision,input.comment));return NextResponse.json({ data }); } catch (error) { return apiError(error); } }
