import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { createPartnerAssignment } from "../../../../lib/repository";
import { assignmentSchema } from "../../../../lib/validation";

export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const input = await parseJson(request, assignmentSchema); return NextResponse.json({ data: await createPartnerAssignment(input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
