import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { retryNotification } from "../../../../../lib/email";
import { apiError, assertSameOrigin, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);const key=requireIdempotencyKey(request);const actor=authorize(await getActor(),["owner","admin"]);const id=(await params).id;const data=await runIdempotent(`notification:${id}:retry`,key,actor,()=>retryNotification(id));return NextResponse.json({data});}catch(error){return apiError(error);}}
