import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().toLowerCase().email().max(254);
const currency = z.enum(["KES", "USD"]);
const safePath = z.string().trim().max(300).refine((value) => value.startsWith("/") && !value.startsWith("//"), "Invalid return path");
const id = z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/u, "Invalid identifier");
const tenantKey = z.string().trim().min(3).max(200).regex(/^(?:user|org|anonymous):[A-Za-z0-9._:-]+$/u, "Invalid tenant key");
const siteImagePath = z.string().trim().max(500).refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/[\u0000-\u001f]/u.test(value), "Use a safe site-relative image path");
const marketingContext = z.object({
  sourcePath: safePath.optional(),
  destinationSlug: z.string().trim().max(120).optional(),
  packageSlug: z.string().trim().max(120).optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(160).optional(),
}).strict().optional().default({});

export const magicLinkRequestSchema = z.object({
  email,
  portal: z.enum(["traveler", "business", "partner"]).default("traveler"),
  returnTo: safePath.optional(),
  turnstileToken:z.string().trim().max(2048).optional(),
}).strict();

export const contactSchema = z.object({
  name: trimmed(120), email, phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  type: z.enum(["personal", "support", "corporate", "partner"]).default("personal"),
  message: trimmed(4000),
  consent: z.literal(true),
  consentVersion: z.string().trim().max(40).default("2026-08"),
  marketing: marketingContext,
  turnstileToken:z.string().trim().max(2048).optional(),
}).strict();

export const tripRequestSchema = z.object({
  kind: z.enum(["personal", "corporate", "event"]).default("personal"),
  contactName: trimmed(120), contactEmail: email, contactPhone: z.string().trim().max(40).optional().default(""),
  origin: trimmed(120), destination: trimmed(180),
  departureDate: z.string().date(), returnDate: z.string().date(),
  travelerCount: z.coerce.number().int().min(1).max(100),
  budgetMinor: z.coerce.number().int().min(0).max(2_000_000_000), currency: currency.default("KES"),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  notes: z.string().trim().max(4000).optional().default(""),
  organizationId: id.optional(),
  consent: z.literal(true),
  consentVersion: z.string().trim().max(40).default("2026-08"),
  marketing: marketingContext,
  turnstileToken:z.string().trim().max(2048).optional(),
}).strict().superRefine((value, ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  if (value.departureDate < today) ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure date cannot be in the past" });
  if (value.returnDate < value.departureDate) ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Return date must be on or after departure" });
});

export const quoteItemSchema = z.object({
  category: z.enum(["flight", "hotel", "transfer", "activity", "visa", "insurance", "fee", "other"]),
  description: trimmed(500), serviceDate: z.string().date().optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(999), unitPriceMinor: z.coerce.number().int().min(0).max(2_000_000_000),
  markupMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0), taxMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  supplierId: id.optional(),
}).strict();

export const createQuoteSchema = z.object({
  tripRequestId: id, currency, exchangeRate: z.coerce.number().positive().max(1_000_000).default(1),
  expiresAt: z.coerce.number().int().positive().optional(), feesMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  taxMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0), notes: z.string().trim().max(4000).optional().default(""),
  items: z.array(quoteItemSchema).min(1).max(100),
}).strict();
export const reviseQuoteSchema = createQuoteSchema.omit({ tripRequestId: true });

export const quoteDecisionSchema = z.object({ decision: z.enum(["approved", "declined"]), comment: z.string().trim().max(2000).optional().default(""), tenantKey: tenantKey.optional() }).strict();
export const approvalDecisionSchema = quoteDecisionSchema;
export const tenantOverrideSchema = z.object({ tenantKey: tenantKey.optional() }).strict();
export const bookingFromQuoteSchema = z.object({ quoteId: id, tenantKey: tenantKey.optional() }).strict();
export const assignmentDecisionSchema = z.object({ status: z.enum(["confirmed", "declined", "completed"]), note: z.string().trim().max(2000).optional().default("") }).strict();
export const uploadInitializeSchema = z.object({
  filename: z.string().trim().min(1).max(120),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z.coerce.number().int().min(1).max(10 * 1024 * 1024),
  entityType: z.enum(["trip_request", "quote", "booking", "invoice", "support_ticket"]),
  entityId: id,
  visibility: z.enum(["private", "public"]).default("private"),
  tenantKey: tenantKey.optional(),
}).strict();
export const uploadCompleteSchema = z.object({ tenantKey: tenantKey.optional() }).strict();

export const invoiceSchema = z.object({ bookingId: id, dueDate: z.string().date(), taxMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0), note: z.string().trim().max(2000).optional().default("") }).strict();
export const paymentSchema = z.object({ amountMinor: z.coerce.number().int().positive().max(2_000_000_000), currency, method: z.enum(["bank_transfer", "cash", "external_link", "mobile_money", "card", "other"]), reference: z.string().trim().max(160).optional().default(""), paidAt: z.coerce.number().int().positive().optional(), note: z.string().trim().max(2000).optional().default(""), tenantKey: tenantKey.optional() }).strict().superRefine((value, ctx) => {
  if (value.method !== "cash" && !value.reference) ctx.addIssue({ code: "custom", path: ["reference"], message: "A payment reference is required for this method" });
});
export const supportSchema = z.object({ bookingId: id.optional(), subject: trimmed(180), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), message: trimmed(5000) }).strict();
export const supportMessageSchema = z.object({ message: trimmed(5000), internal: z.boolean().optional().default(false), tenantKey: tenantKey.optional() }).strict();
export const supportUpdateSchema = z.object({ status: z.enum(["open", "waiting_customer", "waiting_tvse", "resolved", "closed"]).optional(), priority: z.enum(["low", "normal", "high", "urgent"]).optional(), assignedAgentId: id.nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0, "Choose a support update");

export const leadUpdateSchema = z.object({ status: z.enum(["new", "contacted", "qualified", "converted", "closed"]).optional(), assignedAgentId: id.nullable().optional() }).strict().refine((value) => Object.keys(value).length > 0, "Choose a lead update");
export const leadPatchSchema = z.object({ id, status: z.enum(["new", "contacted", "qualified", "closed"]).optional(), assignedAgentId: id.nullable().optional() }).strict().refine((value) => Object.keys(value).some((key) => key !== "id"), "Choose a lead update");
export const leadConversionSchema = z.object({
  kind: z.enum(["personal", "corporate", "event"]).default("personal"), origin: trimmed(120), destination: trimmed(180),
  departureDate: z.string().date(), returnDate: z.string().date(), travelerCount: z.coerce.number().int().min(1).max(100),
  budgetMinor: z.coerce.number().int().min(0).max(2_000_000_000), currency: currency.default("KES"),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]), notes: z.string().trim().max(4000).optional().default(""),
}).strict().superRefine((value, ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  if (value.departureDate < today) ctx.addIssue({ code: "custom", path: ["departureDate"], message: "Departure date cannot be in the past" });
  if (value.returnDate < value.departureDate) ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Return date must be on or after departure" });
});

export const userInviteSchema = z.object({ email, fullName: trimmed(120), role: z.enum(["corporate_requester", "corporate_approver", "partner", "agent", "finance", "content", "admin"]), organizationId: id.optional(), replaceAccess: z.boolean().optional().default(false) }).strict();

export const organizationSchema = z.object({
  name: trimmed(160), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  type: z.enum(["corporate", "partner"]), status: z.enum(["active", "prospect", "suspended"]).default("prospect"),
  billingEmail: email.optional().or(z.literal("")), defaultCurrency: currency.default("KES"),
  travelPolicy: z.string().trim().max(5000).optional().default(""),
}).strict();

export const supplierSchema = z.object({
  organizationId: id.optional().or(z.literal("")), name: trimmed(160), category: trimmed(80),
  email: email.optional().or(z.literal("")), phone: z.string().trim().max(40).optional().default(""),
  country: z.string().trim().max(100).optional().default(""), status: z.enum(["active", "pending", "suspended"]).default("pending"),
  notes: z.string().trim().max(4000).optional().default(""),
}).strict();

export const assignmentSchema = z.object({
  bookingId: id, supplierId: id, serviceType: trimmed(100),
  travelerSummary: z.string().trim().max(1000).optional().default(""), serviceDetails: z.string().trim().max(5000).optional().default(""),
}).strict();

export const itineraryDaySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(365), date: z.string().date(), title: trimmed(180),
  description: z.string().trim().max(4000).optional().default(""), location: z.string().trim().max(180).optional().default(""),
}).strict();

export const tripRequestStatusSchema = z.object({ status: z.enum(["qualified", "quoting", "quoted", "approved", "declined", "converted", "closed"]) }).strict();
export const bookingStatusSchema = z.object({ status: z.enum(["confirmed", "in_progress", "completed", "cancelled"]) }).strict();

export const contentSchema = z.object({
  kind: z.enum(["destination", "package", "article", "guide"]), id: id.optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title: trimmed(180), summary: trimmed(500), description: trimmed(20_000), imagePath: siteImagePath.default("/hero-zanzibar.jpg"),
  status: z.enum(["draft", "published", "archived"]).default("draft"), country: z.string().trim().max(100).optional(), region: z.string().trim().max(100).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(), fromPriceMinor: z.coerce.number().int().min(0).max(2_000_000_000).optional(), currency: currency.optional(), destinationId: id.optional(),
  seoTitle: z.string().trim().max(180).optional(), seoDescription: z.string().trim().max(300).optional(),
}).strict();

export type ContentInput = z.infer<typeof contentSchema>;

export function validationError(error: z.ZodError) {
  return { error: "Please check the highlighted information.", fields: error.flatten().fieldErrors };
}
