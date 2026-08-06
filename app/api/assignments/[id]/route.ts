import { NextResponse } from "next/server";
import { getActor } from "../../../../lib/auth";
import { apiError, assertSameOrigin } from "../../../../lib/http";
import { updatePartnerAssignment } from "../../../../lib/repository";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertSameOrigin(request); const actor = await getActor(); if (!actor) return NextResponse.json({ error: "Authentication required" }, { status: 401 }); const body = await request.json() as { status?: string; note?: string }; if (!body.status || !["confirmed", "declined", "completed"].includes(body.status)) return NextResponse.json({ error: "Invalid assignment status" }, { status: 422 }); const { id } = await params; return NextResponse.json({ data: await updatePartnerAssignment(id, body.status as "confirmed" | "declined" | "completed", body.note || "", actor) }); } catch (error) { return apiError(error); } }
