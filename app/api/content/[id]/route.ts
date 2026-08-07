import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { upsertContent } from "../../../../lib/repository";
import { contentSchema } from "../../../../lib/validation";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const actor=authorize(await getActor(),["owner","admin","content"]);const id=(await params).id;const input=await parseJson(request,contentSchema);return NextResponse.json({data:await upsertContent({...input,id},actor)});}catch(error){return apiError(error);}}
