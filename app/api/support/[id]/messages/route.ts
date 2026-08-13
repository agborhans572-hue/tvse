import { NextResponse } from "next/server";
import { getActor } from "../../../../../lib/auth";
import { apiError, assertSameOrigin, idempotencyKey, parseJson } from "../../../../../lib/http";
import { addSupportMessage, getSupportConversation } from "../../../../../lib/repository";
import { supportMessageSchema } from "../../../../../lib/validation";
import { forwardOperationsMutation } from "../../../../../lib/operations-client";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const actor=await getActor();if(!actor)return NextResponse.json({error:"Authentication required"},{status:401});const input=await parseJson(request,supportMessageSchema);const id=(await params).id;const forwarded=new Request(request.url,{method:"POST",headers:new Headers(request.headers)});forwarded.headers.set("Idempotency-Key",request.headers.get("Idempotency-Key")??idempotencyKey(request)??crypto.randomUUID());const operationsResponse=await forwardOperationsMutation(forwarded,actor,`/v2/support/${id}/messages`,input);if(operationsResponse)return operationsResponse;return NextResponse.json({data:await addSupportMessage(id,input.message,input.internal,actor)},{status:201});}catch(error){return apiError(error);}}
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const actor=await getActor();if(!actor)return NextResponse.json({error:"Authentication required"},{status:401});const conversation=await getSupportConversation((await params).id,actor);return NextResponse.json({data:conversation.messages});}catch(error){return apiError(error);}}
