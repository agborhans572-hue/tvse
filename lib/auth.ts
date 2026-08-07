import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { getD1 } from "../db";
import { chatGPTSignInPath, getChatGPTUser } from "../app/chatgpt-auth";
import { createId, randomToken, sha256 } from "./ids";
import { publicBaseUrl, runtimeEnv } from "./runtime";
import type { Actor, Role } from "./travel";
import { internalRoles, isInternalRole } from "./travel";
import { sendMagicLinkEmail } from "./email";

const SESSION_COOKIE = "tvse_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

type UserRow = { id: string; email: string; full_name: string | null; role: Role; status: string; platform_user_id: string | null; organization_id?: string | null };

export async function getActor(): Promise<Actor | null> {
  const platformUser = await getChatGPTUser();
  if (platformUser) {
    const staff = await staffActor(platformUser.userId, platformUser.email, platformUser.fullName);
    if (staff) return staff;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = await sha256(token);
  const now = Date.now();
  const row = await getD1().prepare(`
    SELECT u.id, u.email, u.full_name, u.role, u.status, u.platform_user_id,
      (SELECT organization_id FROM memberships WHERE user_id = u.id ORDER BY created_at LIMIT 1) AS organization_id
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
  `).bind(hash, now).first<UserRow>();
  if (!row) return null;
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, organizationId: row.organization_id ?? null, source: "magic_link" };
}

async function staffActor(platformUserId: string, email: string, fullName: string | null): Promise<Actor | null> {
  const db = getD1();
  const normalizedEmail = email.trim().toLowerCase();
  const adminEmails = (runtimeEnv.TVSE_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  let row = await db.prepare("SELECT id, email, full_name, role, status, platform_user_id FROM users WHERE platform_user_id = ? OR email = ? LIMIT 1").bind(platformUserId, normalizedEmail).first<UserRow>();
  if (!row && adminEmails.includes(normalizedEmail)) {
    const id = createId("usr"); const now = Date.now();
    await db.prepare("INSERT INTO users (id, email, full_name, kind, role, status, platform_user_id, created_at, updated_at) VALUES (?, ?, ?, 'staff', 'owner', 'active', ?, ?, ?)")
      .bind(id, normalizedEmail, fullName, platformUserId, now, now).run();
    row = { id, email: normalizedEmail, full_name: fullName, role: "owner", status: "active", platform_user_id: platformUserId };
  } else if (row && isInternalRole(row.role) && row.platform_user_id !== platformUserId) {
    await db.prepare("UPDATE users SET platform_user_id = ?, full_name = COALESCE(?, full_name), updated_at = ? WHERE id = ?").bind(platformUserId, fullName, Date.now(), row.id).run();
  }
  if (!row || row.status !== "active" || !isInternalRole(row.role)) return null;
  return { id: row.id, email: row.email, fullName: row.full_name, role: row.role, source: "platform" };
}

export async function requirePageActor(area: "portal" | "business" | "partner" | "staff"): Promise<Actor> {
  const actor = await getActor();
  const allowed: Record<typeof area, Role[]> = {
    portal: ["traveler", "corporate_requester", "corporate_approver", "owner", "admin", "agent"],
    business: ["corporate_requester", "corporate_approver", "owner", "admin", "agent", "finance"],
    partner: ["partner", "owner", "admin", "agent"],
    staff: [...internalRoles],
  };
  if (actor && allowed[area].includes(actor.role) && (area !== "staff" || actor.source === "platform")) return actor;
  if (area === "staff") {
    const platform = await getChatGPTUser();
    if (platform) redirect("/access-denied");
    redirect(chatGPTSignInPath("/staff"));
  }
  if (actor) redirect("/access-denied");
  redirect(`/login/${area === "portal" ? "traveler" : area}?return_to=/${area}`);
}

export function authorize(actor: Actor | null, roles: Role[]): Actor {
  if (!actor) throw new AuthError("Authentication required", 401);
  if (!roles.includes(actor.role)) throw new AuthError("You do not have permission for this action", 403);
  return actor;
}

export class AuthError extends Error { status:401|403;constructor(message: string,status: 401 | 403) { super(message);this.status=status; } }

export async function issueMagicLink(email: string, portal: "traveler" | "business" | "partner", returnTo: string, request: Request) {
  const db = getD1();
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();
  const recent = await db.prepare("SELECT COUNT(*) AS count FROM magic_links WHERE email = ? AND created_at > ?").bind(normalizedEmail, now - 15 * 60 * 1000).first<{ count: number }>();
  if ((recent?.count ?? 0) >= 5) return { accepted: true, debugLink: null };
  const expectedRoles: Record<typeof portal, Role[]> = { traveler: ["traveler"], business: ["corporate_requester", "corporate_approver"], partner: ["partner"] };
  const existing = await db.prepare("SELECT id, role FROM users WHERE email = ? AND status IN ('active','invited')").bind(normalizedEmail).first<{ id: string; role: Role }>();
  if (existing && !expectedRoles[portal].includes(existing.role)) return { accepted: true, debugLink: null };
  if (portal !== "traveler" && !existing) return { accepted: true, debugLink: null };

  const token = randomToken(32); const tokenHash = await sha256(token); const id = createId("ml");
  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? requestHeaders.get("x-forwarded-for") ?? "unknown";
  const ipHash = await sha256(ip);
  const safeReturn = safeReturnTo(returnTo, portal);
  await db.prepare("INSERT INTO magic_links (id, email, token_hash, intended_role, return_to, expires_at, request_ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, normalizedEmail, tokenHash, portal, safeReturn, now + MAGIC_LINK_TTL_MS, ipHash, now).run();
  const link = `${publicBaseUrl(request)}/api/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMagicLinkEmail(normalizedEmail, link, portal);
  const localDebug = !runtimeEnv.RESEND_API_KEY && publicBaseUrl(request).includes("localhost") ? link : null;
  return { accepted: true, debugLink: localDebug };
}

export async function consumeMagicLink(token: string): Promise<{ sessionToken: string; returnTo: string }> {
  const db = getD1();
  const tokenHash = await sha256(token); const now = Date.now();
  const link = await db.prepare("SELECT id, email, intended_role, return_to FROM magic_links WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(tokenHash, now).first<{ id: string; email: string; intended_role: "traveler" | "business" | "partner"; return_to: string }>();
  if (!link) throw new Error("This sign-in link is invalid or has expired");
  const consumed = await db.prepare("UPDATE magic_links SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, link.id).run();
  if ((consumed.meta?.changes ?? 0) !== 1) throw new Error("This sign-in link has already been used");
  let user = await db.prepare("SELECT id, role, status FROM users WHERE email = ?").bind(link.email).first<{ id: string; role: Role; status: string }>();
  if (!user && link.intended_role === "traveler") {
    const id = createId("usr");
    await db.prepare("INSERT INTO users (id, email, kind, role, status, created_at, updated_at) VALUES (?, ?, 'traveler', 'traveler', 'active', ?, ?)").bind(id, link.email, now, now).run();
    user = { id, role: "traveler", status: "active" };
  }
  if (!user || !["active", "invited"].includes(user.status)) throw new Error("This account is not available");
  const sessionToken = randomToken(32); const sessionHash = await sha256(sessionToken);
  await db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(createId("ses"), user.id, sessionHash, now + SESSION_TTL_MS, now, now).run();
  await db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").bind(now, user.id).run();
  return { sessionToken, returnTo: safeReturnTo(link.return_to, link.intended_role) };
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: publicBaseUrl().startsWith("https://"), sameSite: "lax", path: "/", maxAge: SESSION_TTL_MS / 1000 });
}

export async function revokeSession(): Promise<void> {
  const store = await cookies(); const token = store.get(SESSION_COOKIE)?.value;
  if (token) await getD1().prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export function clearSessionCookie(response: NextResponse) { response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: publicBaseUrl().startsWith("https://"), sameSite: "lax", path: "/", maxAge: 0 }); }

function safeReturnTo(value: string, portal: "traveler" | "business" | "partner") {
  const fallback = portal === "traveler" ? "/portal" : `/${portal}`;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  try { const url = new URL(value, "https://tvse.local"); return url.origin === "https://tvse.local" ? `${url.pathname}${url.search}${url.hash}` : fallback; } catch { return fallback; }
}
