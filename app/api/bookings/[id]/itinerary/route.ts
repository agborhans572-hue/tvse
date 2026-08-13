import { NextResponse } from "next/server";
import { authorize, getActor } from "../../../../../lib/auth";
import { generateItineraryPdf } from "../../../../../lib/documents";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../../../lib/http";
import { runIdempotent } from "../../../../../lib/idempotency";
import { upsertItineraryDay } from "../../../../../lib/repository";
import { itineraryDaySchema } from "../../../../../lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request);const key=requireIdempotencyKey(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const id = (await params).id; const input = await parseJson(request, itineraryDaySchema); const day=await runIdempotent(`booking:${id}:itinerary:${input.dayNumber}`,key,actor,async()=>{const value=await upsertItineraryDay(id,input,actor);await generateItineraryPdf(id);return value;}); return NextResponse.json({ data: day }, { status: 201 }); } catch (error) { return apiError(error); } }
