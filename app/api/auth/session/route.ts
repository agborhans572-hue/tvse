import { NextResponse } from "next/server";
import { getActor } from "../../../../lib/auth";

export async function GET() { const actor = await getActor(); return actor ? NextResponse.json({ actor }) : NextResponse.json({ actor: null }, { status: 401 }); }
