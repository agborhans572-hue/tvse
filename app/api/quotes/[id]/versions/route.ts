import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../../lib/http";
import { reviseQuote } from "../../../../../lib/repository";
import { createQuoteSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, createQuoteSchema); const { id } = await params; return NextResponse.json({ data: await reviseQuote(id, input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
