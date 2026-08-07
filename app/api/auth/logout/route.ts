import { NextResponse } from "next/server";
import { clearSessionCookie, revokeSession } from "../../../../lib/auth";
import { publicBaseUrl } from "../../../../lib/runtime";
import { apiError, assertSameOrigin } from "../../../../lib/http";

export async function POST(request: Request) { try { assertSameOrigin(request); await revokeSession(); const response = NextResponse.redirect(`${publicBaseUrl(request)}/`); clearSessionCookie(response); return response; } catch (error) { return apiError(error); } }
