import { NextResponse } from "next/server";
import { getActor } from "../../../../lib/auth";

export async function GET() { const actor = await getActor(); return actor ? NextResponse.json({ data: { actor } }) : NextResponse.json({ error: "Authentication required" }, { status: 401 }); }
