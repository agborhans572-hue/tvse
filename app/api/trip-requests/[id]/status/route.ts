import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { updateTripRequestStatus } from "../../../../../lib/repository";
import { tripRequestStatusSchema } from "../../../../../lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request);const key=requireIdempotencyKey(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, tripRequestStatusSchema);const id=(await params).id;const data=await runIdempotent(`trip-request:${id}:status`,key,actor,()=>updateTripRequestStatus(id,input.status,actor));return NextResponse.json({ data }); } catch (error) { return apiError(error); } }
