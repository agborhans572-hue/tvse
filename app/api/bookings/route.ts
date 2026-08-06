import { NextResponse } from "next/server";
import { getActor, authorize } from "../../../lib/auth";
import { generateItineraryPdf } from "../../../lib/documents";
import { apiError, assertSameOrigin } from "../../../lib/http";
import { createBookingFromQuote, listBookings } from "../../../lib/repository";

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listBookings(actor) }); } catch (error) { return apiError(error); } }
export async function POST(request: Request) { try { assertSameOrigin(request); const actor = authorize(await getActor(), ["owner", "admin", "agent"]); const body = await request.json() as { quoteId?: string }; if (!body.quoteId) return NextResponse.json({ error: "quoteId is required" }, { status: 422 }); const booking = await createBookingFromQuote(body.quoteId, actor); await generateItineraryPdf(booking.id).catch(() => null); return NextResponse.json({ data: booking }, { status: 201 }); } catch (error) { return apiError(error); } }
