import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../../lib/http";
import { updateLead } from "../../../../../lib/repository";
import { leadUpdateSchema } from "../../../../../lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const actor=authorize(await getActor(),["owner","admin","agent"]); const input=await parseJson(request,leadUpdateSchema); return NextResponse.json({data:await updateLead((await params).id,input,actor)}); }
  catch(error){return apiError(error);}
}
