import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { sendAdminAlert, sendTripRequestEmail } from "../../../lib/email";
import { apiError, assertSameOrigin, idempotencyKey, parseJson } from "../../../lib/http";
import { createTripRequest, listTripRequests } from "../../../lib/repository";
import { publicBaseUrl } from "../../../lib/runtime";
import { tripRequestSchema } from "../../../lib/validation";
import { enforcePublicRateLimit, verifyTurnstile } from "../../../lib/rate-limit";
import { runPublicIdempotent } from "../../../lib/idempotency";
import { forwardOperationsMutation } from "../../../lib/operations-client";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, tripRequestSchema);
    const actor = await getActor();
    const operationsResponse = await forwardOperationsMutation(request, actor, actor ? "/v2/requests" : "/v2/public/trip-requests", input, input.contactEmail);
    if (operationsResponse) return operationsResponse;
    await verifyTurnstile(input.turnstileToken, "trip-request");
    await enforcePublicRateLimit("trip-request", input.contactEmail, 5, 60 * 60 * 1000);
    const data = await runPublicIdempotent("trip-request:create", idempotencyKey(request), input.contactEmail, async () => {
      const trip = await createTripRequest(input, actor);
      await sendTripRequestEmail(trip.contactEmail, trip.contactName, trip.requestNumber, `${publicBaseUrl(request)}/login/traveler?return_to=/portal`);
      await sendAdminAlert(`${trip.requestNumber}: new travel brief`, "A new journey is ready to review", `${trip.contactName} submitted a travel request for ${input.destination}.`, `trip-request:${trip.requestNumber}:staff`, `${publicBaseUrl(request)}/staff/pipeline`);
      return { id: trip.id, requestNumber: trip.requestNumber, message: "Your travel brief is with TVSE." };
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function GET() { try { const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); return NextResponse.json({ data: await listTripRequests(actor) }); } catch (error) { return apiError(error); } }
