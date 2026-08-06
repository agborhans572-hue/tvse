import { NextResponse } from "next/server";
import { getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../../lib/http";
import { decideQuote } from "../../../../../lib/repository";
import { quoteDecisionSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const input = await parseJson(request, quoteDecisionSchema); const { id } = await params; return NextResponse.json({ data: await decideQuote(id, actor, input.decision, input.comment) }); } catch (error) { return apiError(error); } }
