import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { apiError, assertSameOrigin, idempotencyKey, parseJson } from "../../../lib/http";
import { createLead } from "../../../lib/repository";
import { contactSchema } from "../../../lib/validation";
import { enforcePublicRateLimit, verifyTurnstile } from "../../../lib/rate-limit";
import { sendAdminAlert } from "../../../lib/email";
import { publicBaseUrl } from "../../../lib/runtime";
import { runPublicIdempotent } from "../../../lib/idempotency";
import { forwardOperationsMutation } from "../../../lib/operations-client";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = await parseJson(request, contactSchema);
    const actor = await getActor();
    const operationsResponse = await forwardOperationsMutation(request, actor, "/v2/public/contact", input, input.email);
    if (operationsResponse) return operationsResponse;
    await verifyTurnstile(input.turnstileToken, "contact");
    await enforcePublicRateLimit("contact", input.email, 5, 60 * 60 * 1000);
    const data = await runPublicIdempotent("contact:create", idempotencyKey(request), input.email, async () => {
      const lead = await createLead(input, actor);
      await sendAdminAlert(`New TVSE ${input.type} enquiry`, "A new enquiry is waiting", `${input.name} submitted a ${input.type} enquiry.`, `lead:${lead.id}:staff`, `${publicBaseUrl(request)}/staff/leads`);
      return { leadId: lead.id, message: "Thank you. A TVSE specialist will follow up with you." };
    });
    return NextResponse.json({ data }, { status: 201 });
  }
  catch (error) { return apiError(error); }
}
