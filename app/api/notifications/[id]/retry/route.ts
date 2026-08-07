import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { retryNotification } from "../../../../../lib/email";
import { apiError, assertSameOrigin } from "../../../../../lib/http";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{assertSameOrigin(request);authorize(await getActor(),["owner","admin"]);return NextResponse.json({data:await retryNotification((await params).id)});}catch(error){return apiError(error);}}
