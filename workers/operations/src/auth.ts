import { verifyOperationsAccessToken } from "../../../lib/operations-token";
import { allRoles, type Role } from "../../../lib/travel";
import { isOrganizationRole, isOrganizationRoleCompatible } from "../../../lib/authorization";
import { ApiError, assertAllowedOrigin } from "./http";
import type { Env } from "./types";

export async function authenticate(request: Request, env: Env) {
  assertAllowedOrigin(request, env);
  if (new TextEncoder().encode(env.TOKEN_CURRENT_SECRET ?? "").byteLength < 32 || !env.TOKEN_CURRENT_KID) throw new ApiError(503, "AUTH_CONFIGURATION_UNAVAILABLE", "Service authentication is unavailable");
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "AUTH_REQUIRED", "A bearer access token is required");
  let actor;
  try {
    actor = await verifyOperationsAccessToken(authorization.slice(7), {
      [env.TOKEN_CURRENT_KID]: env.TOKEN_CURRENT_SECRET,
      ...(env.TOKEN_PREVIOUS_KID ? { [env.TOKEN_PREVIOUS_KID]: env.TOKEN_PREVIOUS_SECRET } : {}),
    });
  } catch {
    throw new ApiError(401, "INVALID_ACCESS_TOKEN", "The access token is invalid or expired");
  }
  if (!(allRoles as readonly string[]).includes(actor.role)) throw new ApiError(403, "ROLE_DENIED", "The access token role is not allowed");
  const user = await env.CORE_DB.prepare(`
      SELECT u.role, u.status, u.auth_version, o.type AS organization_type, o.status AS organization_status,
             m.organization_id AS membership_organization_id
      FROM users u
      LEFT JOIN memberships m ON m.user_id = u.id
      LEFT JOIN organizations o ON o.id = m.organization_id
      WHERE u.id = ? LIMIT 1
  `).bind(actor.sub).first<{ role: Role; status: string; auth_version: number; organization_type: string | null; organization_status: string | null; membership_organization_id: string | null }>();
  if (!user || user.status !== "active" || user.role !== actor.role || user.auth_version !== actor.authVersion) throw new ApiError(401, "ACCESS_REVOKED", "This account or access token has been revoked");
  if (isOrganizationRole(actor.role) && (
    !user.membership_organization_id
    || user.membership_organization_id !== actor.organizationId
    || user.organization_status !== "active"
    || !isOrganizationRoleCompatible(actor.role, user.organization_type)
  )) throw new ApiError(401, "ORGANIZATION_ACCESS_REVOKED", "Organization access is unavailable");
  return actor;
}

export function requireRoles(role: Role, allowed: readonly Role[]): void {
  if (!allowed.includes(role)) throw new ApiError(403, "ROLE_DENIED", "You do not have permission for this operation");
}

export function isInternal(role: Role): boolean {
  return ["owner", "admin", "agent", "finance", "content"].includes(role);
}

export function canReadTenant(actor: { role: Role; sub: string; organizationId: string | null }, tenantKey: string): boolean {
  return isInternal(actor.role) || tenantKey === `user:${actor.sub}` || (!!actor.organizationId && tenantKey === `org:${actor.organizationId}`);
}
