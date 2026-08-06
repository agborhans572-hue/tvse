import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../lib/http";
import { createSupportTicket, listSupportTickets } from "../../../lib/repository";
import { supportSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listSupportTickets(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const input = await parseJson(request, supportSchema); return NextResponse.json({ data: await createSupportTicket(input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
