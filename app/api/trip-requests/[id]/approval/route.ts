import { NextResponse } from "next/server";
import { getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { decideTripApproval } from "../../../../../lib/repository";
import { approvalDecisionSchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const key=requireIdempotencyKey(request);const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const body = await parseJson(request,approvalDecisionSchema); const { id } = await params; const data=await runIdempotent(`trip-request:${id}:approval`,key,actor,()=>decideTripApproval(id,actor,body.decision,body.comment));return NextResponse.json({ data }); } catch (error) { return apiError(error); }
}
