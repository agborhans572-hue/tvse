import { NextResponse } from "next/server";
import { getActor } from "../../../lib/auth";
import { apiError, assertSameOrigin, parseFormData } from "../../../lib/http";
import { saveUpload, type UploadEntityType } from "../../../lib/storage";
import { can } from "../../../lib/travel";
import { enforcePublicRateLimit } from "../../../lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    await enforcePublicRateLimit("upload", actor.id, 20, 60 * 60 * 1000);
    const form = await parseFormData(request, 10 * 1024 * 1024 + 256 * 1024); const file = form.get("file"); const rawEntityType = String(form.get("entityType") || "profile"); const entityId = String(form.get("entityId") || actor.id); const requested = form.get("visibility") === "public" ? "public" : "private";
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload" }, { status: 422 });
    if (!(["profile","booking","support","content"] as const).includes(rawEntityType as UploadEntityType)) return NextResponse.json({ error: "Unsupported upload destination" }, { status: 422 });
    const entityType=rawEntityType as UploadEntityType;
    const visibility = requested === "public" && entityType === "content" && can(actor.role, "manage_content") ? "public" : "private";
    return NextResponse.json({ data: await saveUpload(file, actor, entityType, entityId, visibility) }, { status: 201 });
  } catch (error) { return apiError(error); }
}
