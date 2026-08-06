import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { sendTripRequestEmail } from "../../../lib/email";
import { apiError, parseJson } from "../../../lib/http";
import { createTripRequest, listTripRequests } from "../../../lib/repository";
import { publicBaseUrl } from "../../../lib/runtime";
import { tripRequestSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  try {
    const input = await parseJson(request, tripRequestSchema); const actor = await getActor(); const trip = await createTripRequest(input, actor);
    await sendTripRequestEmail(trip.contactEmail, trip.contactName, trip.requestNumber, `${publicBaseUrl(request)}/login/traveler?return_to=/portal`);
    return NextResponse.json({ ok: true, id: trip.id, requestNumber: trip.requestNumber, message: "Your travel brief is with TVSE." }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listTripRequests(actor) }); } catch (error) { return apiError(error); } }
