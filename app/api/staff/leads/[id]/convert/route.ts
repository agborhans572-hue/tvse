import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../../lib/http";
import { runIdempotent } from "../../../../../../lib/idempotency";
import { convertLead } from "../../../../../../lib/repository";
import { leadConversionSchema } from "../../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { assertSameOrigin(request); const actor=authorize(await getActor(),["owner","admin","agent"]); const key=requireIdempotencyKey(request); const id=(await params).id; const input=await parseJson(request,leadConversionSchema); const data=await runIdempotent(`lead-convert:${id}`,key,actor,()=>convertLead(id,input,actor)); return NextResponse.json({data},{status:201}); }
  catch(error){return apiError(error);}
}
