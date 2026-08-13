export const internalRoles = ["owner", "admin", "agent", "finance", "content"] as const;
export const externalRoles = ["traveler", "corporate_requester", "corporate_approver", "partner"] as const;
export const allRoles = [...internalRoles, ...externalRoles] as const;

export type Role = (typeof allRoles)[number];
export type Currency = "KES" | "USD";
export type Actor = { id: string; email: string; fullName: string | null; role: Role; organizationId?: string | null; source: "magic_link" | "platform"; authVersion?: number };
export type Money = { amountMinor: number; currency: Currency };
export type TripRequestStatus = "submitted" | "qualified" | "quoting" | "quoted" | "approved" | "declined" | "converted" | "closed";
export type QuoteStatus = "draft" | "sent" | "viewed" | "approved" | "declined" | "expired" | "superseded";
export type BookingStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void";

export type TripRequest = {
  id: string;
  requestNumber: string;
  kind: "personal" | "corporate" | "event";
  status: TripRequestStatus;
  contactName: string;
  contactEmail: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  travelerCount: number;
  budgetMinor: number;
  currency: Currency;
};

export type QuoteVersion = {
  id: string;
  quoteId: string;
  version: number;
  subtotalMinor: number;
  feesMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: Currency;
};

export type Booking = { id: string; bookingNumber: string; status: BookingStatus; destination: string; departureDate: string; returnDate: string; travelerCount: number };
export type Invoice = { id: string; invoiceNumber: string; status: InvoiceStatus; currency: Currency; totalMinor: number; paidMinor: number; dueMinor: number; dueDate: string | null };
export type ContentEntry = { id: string; type: "destination" | "package" | "article" | "guide" | "page"; slug: string; title: string; status: "draft" | "published" | "archived" };
export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };

export const transitions = {
  tripRequest: {
    submitted: ["qualified", "closed"], qualified: ["quoting", "closed"], quoting: ["quoted", "closed"], quoted: ["approved", "declined", "quoting"], approved: ["converted"], declined: ["quoting", "closed"], converted: [], closed: [],
  } satisfies Record<TripRequestStatus, TripRequestStatus[]>,
  quote: {
    draft: ["sent"], sent: ["viewed", "approved", "declined", "expired", "superseded"], viewed: ["approved", "declined", "expired", "superseded"], approved: ["superseded"], declined: ["superseded"], expired: ["superseded"], superseded: [],
  } satisfies Record<QuoteStatus, QuoteStatus[]>,
  booking: {
    pending: ["confirmed", "cancelled"], confirmed: ["in_progress", "cancelled"], in_progress: ["completed", "cancelled"], completed: [], cancelled: [],
  } satisfies Record<BookingStatus, BookingStatus[]>,
  invoice: {
    draft: ["issued", "void"], issued: ["partially_paid", "paid", "overdue", "void"], partially_paid: ["paid", "overdue", "void"], paid: [], overdue: ["partially_paid", "paid", "void"], void: [],
  } satisfies Record<InvoiceStatus, InvoiceStatus[]>,
};

export function canTransition<T extends keyof typeof transitions>(entity: T, from: keyof (typeof transitions)[T], to: string): boolean {
  return ((transitions[entity][from] as readonly string[]) ?? []).includes(to);
}

export function assertTransition<T extends keyof typeof transitions>(entity: T, from: keyof (typeof transitions)[T], to: string): void {
  if (!canTransition(entity, from, to)) throw new Error(`Invalid ${entity} transition: ${String(from)} → ${to}`);
}

export function calculateLineTotal(quantity: number, unitPriceMinor: number, markupMinor = 0, taxMinor = 0): number {
  for (const value of [quantity, unitPriceMinor, markupMinor, taxMinor]) if (!Number.isSafeInteger(value) || value < 0) throw new Error("Money values must be non-negative safe integers");
  return quantity * unitPriceMinor + markupMinor + taxMinor;
}

export function calculateInvoiceBalance(totalMinor: number, payments: number[]): { paidMinor: number; dueMinor: number; status: "issued" | "partially_paid" | "paid" } {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || payments.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("Invalid money value");
  const paidMinor = payments.reduce((sum, value) => sum + value, 0);
  if (paidMinor > totalMinor) throw new Error("Payment total cannot exceed invoice total");
  return { paidMinor, dueMinor: totalMinor - paidMinor, status: paidMinor === 0 ? "issued" : paidMinor === totalMinor ? "paid" : "partially_paid" };
}

export function formatMoney(amountMinor: number, currency: Currency): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: currency === "KES" ? 0 : 2 }).format(amountMinor / 100);
}

export function isInternalRole(role: Role): boolean { return (internalRoles as readonly string[]).includes(role); }
export function can(role: Role, action: "manage_users" | "manage_finance" | "manage_content" | "manage_travel" | "view_audit"): boolean {
  const permissions: Record<Role, string[]> = {
    owner: ["manage_users", "manage_finance", "manage_content", "manage_travel", "view_audit"],
    admin: ["manage_users", "manage_finance", "manage_content", "manage_travel", "view_audit"],
    agent: ["manage_travel"], finance: ["manage_finance"], content: ["manage_content"],
    traveler: [], corporate_requester: [], corporate_approver: [], partner: [],
  };
  return permissions[role].includes(action);
}
