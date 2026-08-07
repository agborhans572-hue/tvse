import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { listLeads, updateLead } from "../../../../lib/repository";
import { leadPatchSchema } from "../../../../lib/validation";

export async function GET(request: Request) {
  try {
    const actor = authorize(await getActor(), ["owner", "admin", "agent"]);
    const status = new URL(request.url).searchParams.get("status") || undefined;
    return NextResponse.json({ data: await listLeads(actor, status) });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: Request) {
  try { assertSameOrigin(request); const actor=authorize(await getActor(),["owner","admin","agent"]); const {id,...input}=await parseJson(request,leadPatchSchema); return NextResponse.json({data:await updateLead(id,input,actor)}); }
  catch(error){return apiError(error);}
}
