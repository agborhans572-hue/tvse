import { NextResponse } from "next/server";
import { issueMagicLink } from "../../../../lib/auth";
import { apiError, parseJson } from "../../../../lib/http";
import { magicLinkRequestSchema } from "../../../../lib/validation";
import { enforcePublicRateLimit } from "../../../../lib/rate-limit";

export async function POST(request: Request) {
  try { const input = await parseJson(request, magicLinkRequestSchema); await enforcePublicRateLimit("magic-link", input.email, 5, 15 * 60 * 1000); const fallback = input.portal === "traveler" ? "/portal" : `/${input.portal}`; const result = await issueMagicLink(input.email, input.portal, input.returnTo || fallback, request); return NextResponse.json({ data: { message: "If the account is available, a secure sign-in link is on its way.", ...(result.debugLink ? { debugLink: result.debugLink } : {}) } }); } catch (error) { return apiError(error); }
}
