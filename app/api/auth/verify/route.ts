import { NextResponse } from "next/server";
import { consumeMagicLink, setSessionCookie } from "../../../../lib/auth";
import { publicBaseUrl } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const baseUrl=publicBaseUrl(request);const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${baseUrl}/login/traveler?error=missing-link`);
  try { const session = await consumeMagicLink(token); const response = NextResponse.redirect(`${baseUrl}${session.returnTo}`); setSessionCookie(response, session.sessionToken); return response; }
  catch { return NextResponse.redirect(`${baseUrl}/login/traveler?error=expired-link`); }
}
