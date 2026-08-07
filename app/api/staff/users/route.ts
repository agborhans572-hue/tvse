import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../lib/auth";
import { sendGenericUpdate } from "../../../../lib/email";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { inviteUser, listUsers } from "../../../../lib/repository";
import { publicBaseUrl } from "../../../../lib/runtime";
import { userInviteSchema } from "../../../../lib/validation";

export async function GET() { try { const actor = authorize(await getActor(), ["owner", "admin"]); return NextResponse.json({ data: await listUsers(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin"]); const input = await parseJson(request, userInviteSchema); const user = await inviteUser(input, actor); const loginPath = input.role === "partner" ? "/login/partner" : input.role.startsWith("corporate_") ? "/login/business" : "/staff"; await sendGenericUpdate(user.email, "You have been invited to TVSE", "Your TVSE workspace is ready", input.role === "partner" || input.role.startsWith("corporate_") ? "Use the secure sign-in page to request your access link." : "Use your approved ChatGPT account to open TVSE operations.", `${publicBaseUrl(request)}${loginPath}`); return NextResponse.json({ data: user }, { status: 201 }); } catch (error) { return apiError(error); } }
