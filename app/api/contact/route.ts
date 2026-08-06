import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { apiError, parseJson } from "../../../lib/http";
import { createLead } from "../../../lib/repository";
import { contactSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  try { const input = await parseJson(request, contactSchema); const lead = await createLead(input, await getActor()); return NextResponse.json({ ok: true, leadId: lead.id, message: "Thank you. A TVSE specialist will follow up with you." }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
