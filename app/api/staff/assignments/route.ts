import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../lib/http";
import { runIdempotent } from "../../../../lib/idempotency";
import { createPartnerAssignment } from "../../../../lib/repository";
import { assignmentSchema } from "../../../../lib/validation";

export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const key=requireIdempotencyKey(request); const input = await parseJson(request, assignmentSchema); const data=await runIdempotent(`assignment:${input.bookingId}:${input.supplierId}`,key,actor,()=>createPartnerAssignment(input,actor)); return NextResponse.json({ data }, { status: 201 }); } catch (error) { return apiError(error); } }
