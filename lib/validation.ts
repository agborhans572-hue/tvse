import { z } from "zod";

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().toLowerCase().email().max(254);
const currency = z.enum(["KES", "USD"]);
const safePath = z.string().trim().max(300).refine((value) => value.startsWith("/") && !value.startsWith("//"), "Invalid return path");

export const magicLinkRequestSchema = z.object({
  email,
  portal: z.enum(["traveler", "business", "partner"]).default("traveler"),
  returnTo: safePath.optional(),
});

export const contactSchema = z.object({
  name: trimmed(120), email, phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(160).optional().default(""),
  type: z.enum(["personal", "support", "corporate", "partner"]).default("personal"),
  message: trimmed(4000),
});

export const tripRequestSchema = z.object({
  kind: z.enum(["personal", "corporate", "event"]).default("personal"),
  contactName: trimmed(120), contactEmail: email, contactPhone: z.string().trim().max(40).optional().default(""),
  origin: trimmed(120), destination: trimmed(180),
  departureDate: z.string().date(), returnDate: z.string().date(),
  travelerCount: z.coerce.number().int().min(1).max(100),
  budgetMinor: z.coerce.number().int().min(0).max(2_000_000_000), currency: currency.default("KES"),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  notes: z.string().trim().max(4000).optional().default(""),
  organizationId: z.string().trim().max(80).optional(),
}).superRefine((value, ctx) => {
  if (value.returnDate < value.departureDate) ctx.addIssue({ code: "custom", path: ["returnDate"], message: "Return date must be on or after departure" });
});

export const quoteItemSchema = z.object({
  category: z.enum(["flight", "hotel", "transfer", "activity", "visa", "insurance", "fee", "other"]),
  description: trimmed(500), serviceDate: z.string().date().optional().or(z.literal("")),
  quantity: z.coerce.number().int().min(1).max(999), unitPriceMinor: z.coerce.number().int().min(0).max(2_000_000_000),
  markupMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0), taxMinor: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
  supplierId: z.string().trim().max(80).optional(),
});

export const createQuoteSchema = z.object({
  tripRequestId: trimmed(80), currency, exchangeRate: z.coerce.number().positive().max(1_000_000).default(1),
  expiresAt: z.coerce.number().int().positive().optional(), feesMinor: z.coerce.number().int().min(0).default(0),
  taxMinor: z.coerce.number().int().min(0).default(0), notes: z.string().trim().max(4000).optional().default(""),
  items: z.array(quoteItemSchema).min(1).max(100),
});

export const quoteDecisionSchema = z.object({ decision: z.enum(["approved", "declined"]), comment: z.string().trim().max(2000).optional().default("") });

export const invoiceSchema = z.object({ bookingId: trimmed(80), dueDate: z.string().date(), taxMinor: z.coerce.number().int().min(0).default(0), note: z.string().trim().max(2000).optional().default("") });
export const paymentSchema = z.object({ amountMinor: z.coerce.number().int().positive().max(2_000_000_000), currency, method: z.enum(["bank_transfer", "cash", "external_link", "mobile_money", "card", "other"]), reference: z.string().trim().max(160).optional().default(""), paidAt: z.coerce.number().int().positive().optional(), note: z.string().trim().max(2000).optional().default("") });
export const supportSchema = z.object({ bookingId: z.string().trim().max(80).optional(), subject: trimmed(180), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"), message: trimmed(5000) });

export const userInviteSchema = z.object({ email, fullName: trimmed(120), role: z.enum(["corporate_requester", "corporate_approver", "partner", "agent", "finance", "content", "admin"]), organizationId: z.string().trim().max(80).optional() });

export const organizationSchema = z.object({
  name: trimmed(160), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  type: z.enum(["corporate", "partner"]), status: z.enum(["active", "prospect", "suspended"]).default("prospect"),
  billingEmail: email.optional().or(z.literal("")), defaultCurrency: currency.default("KES"),
  travelPolicy: z.string().trim().max(5000).optional().default(""),
});

export const supplierSchema = z.object({
  organizationId: z.string().trim().max(80).optional(), name: trimmed(160), category: trimmed(80),
  email: email.optional().or(z.literal("")), phone: z.string().trim().max(40).optional().default(""),
  country: z.string().trim().max(100).optional().default(""), status: z.enum(["active", "pending", "suspended"]).default("pending"),
  notes: z.string().trim().max(4000).optional().default(""),
});

export const assignmentSchema = z.object({
  bookingId: trimmed(80), supplierId: trimmed(80), serviceType: trimmed(100),
  travelerSummary: z.string().trim().max(1000).optional().default(""), serviceDetails: z.string().trim().max(5000).optional().default(""),
});

export const itineraryDaySchema = z.object({
  dayNumber: z.coerce.number().int().min(1).max(365), date: z.string().date(), title: trimmed(180),
  description: z.string().trim().max(4000).optional().default(""), location: z.string().trim().max(180).optional().default(""),
});

export const tripRequestStatusSchema = z.object({ status: z.enum(["qualified", "quoting", "quoted", "approved", "declined", "converted", "closed"]) });
export const bookingStatusSchema = z.object({ status: z.enum(["confirmed", "in_progress", "completed", "cancelled"]) });

export const contentSchema = z.object({
  kind: z.enum(["destination", "package", "article", "guide"]), id: z.string().trim().max(80).optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  title: trimmed(180), summary: trimmed(500), description: trimmed(20_000), imagePath: z.string().trim().max(500).default("/hero-zanzibar.jpg"),
  status: z.enum(["draft", "published", "archived"]).default("draft"), country: z.string().trim().max(100).optional(), region: z.string().trim().max(100).optional(),
  durationDays: z.coerce.number().int().min(1).max(365).optional(), fromPriceMinor: z.coerce.number().int().min(0).optional(), currency: currency.optional(), destinationId: z.string().trim().max(80).optional(),
  seoTitle: z.string().trim().max(180).optional(), seoDescription: z.string().trim().max(300).optional(),
});

export function validationError(error: z.ZodError) {
  return { error: "Please check the highlighted information.", fields: error.flatten().fieldErrors };
}
