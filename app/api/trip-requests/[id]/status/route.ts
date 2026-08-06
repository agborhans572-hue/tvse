import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../../lib/http";
import { updateTripRequestStatus } from "../../../../../lib/repository";
import { tripRequestStatusSchema } from "../../../../../lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, tripRequestStatusSchema); return NextResponse.json({ data: await updateTripRequestStatus((await params).id, input.status, actor) }); } catch (error) { return apiError(error); } }
