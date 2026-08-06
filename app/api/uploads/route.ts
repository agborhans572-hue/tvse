import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { apiError, assertSameOrigin } from "../../../lib/http";
import { saveUpload } from "../../../lib/storage";
import { can } from "../../../lib/travel";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const form = await request.formData(); const file = form.get("file"); const entityType = String(form.get("entityType") || "profile"); const entityId = String(form.get("entityId") || actor.id); const requested = form.get("visibility") === "public" ? "public" : "private";
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload" }, { status: 422 });
    const visibility = requested === "public" && can(actor.role, "manage_content") ? "public" : "private";
    return NextResponse.json({ data: await saveUpload(file, actor, entityType, entityId, visibility) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
