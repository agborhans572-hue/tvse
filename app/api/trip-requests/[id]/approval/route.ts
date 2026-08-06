import { NextResponse } from "next/server";
import { getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin } from "../../../../../lib/http";
import { decideTripApproval } from "../../../../../lib/repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const body = await request.json() as { decision?: string; comment?: string }; if (!body.decision || !["approved", "declined"].includes(body.decision)) return NextResponse.json({ error: "Choose approve or decline" }, { status: 422 }); const { id } = await params; return NextResponse.json({ data: await decideTripApproval(id, actor, body.decision as "approved" | "declined", body.comment || "") }); } catch (error) { return apiError(error); }
}
