import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { generateItineraryPdf } from "../../../lib/documents";
import { apiError, assertSameOrigin, parseJson, requireIdempotencyKey } from "../../../lib/http";
import { runIdempotent } from "../../../lib/idempotency";
import { createBookingFromQuote, listBookings } from "../../../lib/repository";
import { bookingFromQuoteSchema } from "../../../lib/validation";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listBookings(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const key=requireIdempotencyKey(request); const body = await parseJson(request,bookingFromQuoteSchema); const booking = await runIdempotent(`booking:${body.quoteId}`, key, actor, async()=>{const value=await createBookingFromQuote(body.quoteId, actor); await generateItineraryPdf(value.id).catch(() => null); return value;}); return NextResponse.json({ data: booking }, { status: 201 }); } catch (error) { return apiError(error); } }
