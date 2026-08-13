import { NextResponse, type NextRequest } from "next/server";
import { runtimeEnv } from "./lib/runtime";

export function proxy(request: NextRequest) {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const chatConfigured = /^[A-Za-z0-9_-]+$/u.test(runtimeEnv.TAWK_PROPERTY_ID ?? "") && /^[A-Za-z0-9_-]+$/u.test(runtimeEnv.TAWK_WIDGET_ID ?? "");
  const chatScript = chatConfigured ? " https://embed.tawk.to" : "";
  const chatConnect = chatConfigured ? " https://*.tawk.to https://*.tawk.link wss://*.tawk.to" : "";
  const chatImages = chatConfigured ? " https://*.tawk.to https://*.tawk.link" : "";
  const chatFrames = chatConfigured ? " https://*.tawk.to" : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${chatScript}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${chatImages}`,
    "font-src 'self' data:",
    `connect-src 'self' https://challenges.cloudflare.com${chatConnect}`,
    `frame-src https://challenges.cloudflare.com${chatFrames}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(runtimeEnv.APP_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  // Browsers ignore HSTS on HTTP; emitting it consistently keeps every deployment
  // surface covered without weakening local development.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)" }],
};
