import { NextResponse } from "next/server";
import { clearSessionCookie, revokeSession } from "../../../../lib/auth";
import { publicBaseUrl } from "../../../../lib/runtime";

export async function POST(request: Request) { await revokeSession(); const response = NextResponse.redirect(`${publicBaseUrl(request)}/`); clearSessionCookie(response); return response; }
