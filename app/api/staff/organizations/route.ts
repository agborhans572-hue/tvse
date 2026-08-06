import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { createOrganization, listOrganizations } from "../../../../lib/repository";
import { organizationSchema } from "../../../../lib/validation";

export async function GET() { try { const actor = authorize(await getActor(), ["owner", "admin", "agent", "finance"]); return NextResponse.json({ data: await listOrganizations(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin"]); const input = await parseJson(request, organizationSchema); return NextResponse.json({ data: await createOrganization(input, actor) }, { status: 201 }); } catch (error) { return apiError(error); } }
