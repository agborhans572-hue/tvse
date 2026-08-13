import type { Role } from "./travel";

export type SecurityResource =
  | "requests"
  | "quotes"
  | "bookings"
  | "invoices"
  | "receipts"
  | "support"
  | "leads"
  | "approvals"
  | "assignments"
  | "notifications"
  | "audit"
  | "users"
  | "organizations"
  | "suppliers"
  | "content"
  | "reports";

export type SecurityAction = "read" | "create" | "update" | "delete" | "decide";

const readRoles: Record<SecurityResource, readonly Role[]> = {
  requests: ["owner", "admin", "agent", "traveler", "corporate_requester", "corporate_approver"],
  quotes: ["owner", "admin", "agent", "finance", "traveler", "corporate_requester", "corporate_approver"],
  bookings: ["owner", "admin", "agent", "finance", "traveler", "corporate_requester", "corporate_approver"],
  invoices: ["owner", "admin", "finance", "traveler", "corporate_requester", "corporate_approver"],
  receipts: ["owner", "admin", "finance", "traveler", "corporate_requester", "corporate_approver"],
  support: ["owner", "admin", "agent", "traveler", "corporate_requester", "corporate_approver", "partner"],
  leads: ["owner", "admin", "agent"],
  approvals: ["owner", "admin", "agent", "corporate_approver"],
  assignments: ["owner", "admin", "agent", "partner"],
  notifications: ["owner", "admin"],
  audit: ["owner", "admin"],
  users: ["owner", "admin"],
  organizations: ["owner", "admin", "agent", "finance"],
  suppliers: ["owner", "admin", "agent"],
  content: ["owner", "admin", "content"],
  reports: ["owner", "admin", "agent", "finance", "traveler", "corporate_requester", "corporate_approver", "partner"],
};

const mutateRoles: Partial<Record<SecurityResource, readonly Role[]>> = {
  requests: ["owner", "admin", "agent"],
  quotes: ["owner", "admin", "agent"],
  bookings: ["owner", "admin", "agent"],
  invoices: ["owner", "admin", "finance"],
  receipts: ["owner", "admin", "finance"],
  support: ["owner", "admin", "agent"],
  leads: ["owner", "admin", "agent"],
  approvals: ["owner", "admin", "agent"],
  assignments: ["owner", "admin", "agent"],
  users: ["owner", "admin"],
  organizations: ["owner", "admin"],
  suppliers: ["owner", "admin", "agent"],
  content: ["owner", "admin", "content"],
};

export function canAccessResource(role: Role, resource: SecurityResource, action: SecurityAction = "read"): boolean {
  if (action === "read") return readRoles[resource].includes(role);
  if (action === "decide") {
    if (resource === "quotes") return ["owner", "admin", "agent", "traveler", "corporate_approver"].includes(role);
    if (resource === "approvals") return ["owner", "admin", "agent", "corporate_approver"].includes(role);
  }
  return mutateRoles[resource]?.includes(role) ?? false;
}

export function canOverrideTenant(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "agent";
}

export type ReportScope = "full" | "travel" | "finance" | "tenant" | "none";

export function reportScopeForRole(role: Role): ReportScope {
  if (role === "owner" || role === "admin") return "full";
  if (role === "agent") return "travel";
  if (role === "finance") return "finance";
  if (["traveler", "corporate_requester", "corporate_approver", "partner"].includes(role)) return "tenant";
  return "none";
}

export function isOrganizationRole(role: Role): boolean {
  return role === "corporate_requester" || role === "corporate_approver" || role === "partner";
}

export function isOrganizationRoleCompatible(role: Role, organizationType: string | null | undefined): boolean {
  if (role === "corporate_requester" || role === "corporate_approver") return organizationType === "corporate";
  if (role === "partner") return organizationType === "partner";
  return !organizationType;
}

export function resourceForDocumentKind(kind: "quote" | "booking" | "invoice" | "receipt"): SecurityResource {
  return kind === "receipt" ? "receipts" : `${kind}s` as SecurityResource;
}

export function resourceForUploadEntity(entityType: string): SecurityResource | null {
  const resources: Record<string, SecurityResource> = {
    trip_request: "requests",
    quote: "quotes",
    booking: "bookings",
    invoice: "invoices",
    receipt: "receipts",
    support_ticket: "support",
    content: "content",
  };
  return resources[entityType] ?? null;
}
