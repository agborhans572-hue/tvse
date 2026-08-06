import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../lib/auth";
import { sendGenericUpdate } from "../../../../lib/email";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { inviteUser, listUsers } from "../../../../lib/repository";
import { publicBaseUrl } from "../../../../lib/runtime";
import { userInviteSchema } from "../../../../lib/validation";

export async function GET() { try { const actor = authorize(await getActor(), ["owner", "admin"]); return NextResponse.json({ data: await listUsers(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin"]); const input = await parseJson(request, userInviteSchema); const user = await inviteUser(input, actor); await sendGenericUpdate(user.email, "You have been invited to TVSE", "Your TVSE workspace is ready", "Use the secure sign-in page to request your access link.", `${publicBaseUrl(request)}/login/${input.role === "partner" ? "partner" : input.role.startsWith("corporate_") ? "business" : "traveler"}`); return NextResponse.json({ data: user }, { status: 201 }); } catch (error) { return apiError(error); } }
