import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../../lib/auth";
import { sendGenericUpdate } from "../../../../lib/email";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../lib/http";
import { runIdempotent } from "../../../../lib/idempotency";
import { inviteUser, listUsers } from "../../../../lib/repository";
import { publicBaseUrl } from "../../../../lib/runtime";
import { userInviteSchema } from "../../../../lib/validation";

export async function GET() { try { const actor = authorize(await getActor(), ["owner", "admin"]); return NextResponse.json({ data: await listUsers(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin"]); const key=requireIdempotencyKey(request); const input = await parseJson(request, userInviteSchema); const baseUrl=publicBaseUrl(request); const user=await runIdempotent(`user-invite:${input.email.toLowerCase()}`,key,actor,async()=>{const invited=await inviteUser(input, actor); const loginPath = input.role === "partner" ? "/login/partner" : input.role.startsWith("corporate_") ? "/login/business" : "/staff"; await sendGenericUpdate(invited.email, "You have been invited to TVSE", "Your TVSE workspace is ready", input.role === "partner" || input.role.startsWith("corporate_") ? "Use the secure sign-in page to request your access link." : "Use your approved ChatGPT account to open TVSE operations.", `${baseUrl}${loginPath}`); return invited;}); return NextResponse.json({ data: user }, { status: 201 }); } catch (error) { return apiError(error); } }
