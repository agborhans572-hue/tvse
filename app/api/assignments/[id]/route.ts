import { NextResponse } from "next/server";
import { getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../lib/http";
import { runIdempotent } from "../../../../lib/idempotency";
import { updatePartnerAssignment } from "../../../../lib/repository";
import { assignmentDecisionSchema } from "../../../../lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request);const key=requireIdempotencyKey(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const body = await parseJson(request,assignmentDecisionSchema); const { id } = await params; const data=await runIdempotent(`assignment:${id}:decision`,key,actor,()=>updatePartnerAssignment(id,body.status,body.note,actor));return NextResponse.json({ data }); } catch (error) { return apiError(error); } }
