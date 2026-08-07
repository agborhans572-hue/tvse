import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin, parseJson } from "../../../../lib/http";
import { getSupportConversation, updateSupportTicket } from "../../../../lib/repository";
import { supportUpdateSchema } from "../../../../lib/validation";

export async function GET(_request: Request,{params}:{params:Promise<{id:string}>}){try{const actor=await getActor();if(!actor)return NextResponse.json({error:"Authentication required"},{status:401});return NextResponse.json({data:await getSupportConversation((await params).id,actor)});}catch(error){return apiError(error);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const actor=authorize(await getActor(),["owner","admin","agent"]);const input=await parseJson(request,supportUpdateSchema);return NextResponse.json({data:await updateSupportTicket((await params).id,input,actor)});}catch(error){return apiError(error);}}
