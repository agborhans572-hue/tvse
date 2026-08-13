import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  phone: text("phone"),
  kind: text("kind", { enum: ["traveler", "corporate", "partner", "staff"] }).notNull().default("traveler"),
  role: text("role", { enum: ["traveler", "corporate_requester", "corporate_approver", "partner", "agent", "finance", "content", "admin", "owner"] }).notNull().default("traveler"),
  status: text("status", { enum: ["active", "invited", "suspended"] }).notNull().default("active"),
  authVersion: integer("auth_version").notNull().default(1),
  platformUserId: text("platform_user_id"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_users_email").on(table.email),
  uniqueIndex("idx_users_platform_user_id").on(table.platformUserId),
  index("idx_users_role_status").on(table.role, table.status),
]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_sessions_token_hash").on(table.tokenHash),
  index("idx_sessions_user_expiry").on(table.userId, table.expiresAt),
]);

export const magicLinks = sqliteTable("magic_links", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  intendedRole: text("intended_role").notNull().default("traveler"),
  returnTo: text("return_to").notNull().default("/portal"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp_ms" }),
  requestIpHash: text("request_ip_hash"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_magic_links_token_hash").on(table.tokenHash),
  index("idx_magic_links_email_created").on(table.email, table.createdAt),
]);

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type", { enum: ["corporate", "partner"] }).notNull(),
  status: text("status", { enum: ["active", "prospect", "suspended"] }).notNull().default("prospect"),
  billingEmail: text("billing_email"),
  defaultCurrency: text("default_currency", { enum: ["KES", "USD"] }).notNull().default("KES"),
  approverUserId: text("approver_user_id"),
  travelPolicyJson: text("travel_policy_json").notNull().default("{}"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_organizations_slug").on(table.slug),
  index("idx_organizations_type_status").on(table.type, table.status),
]);

export const memberships = sqliteTable("memberships", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["requester", "approver", "traveler", "partner_admin", "partner_user"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_memberships_org_user").on(table.organizationId, table.userId),
  uniqueIndex("idx_memberships_user").on(table.userId),
]);

export const travelerProfiles = sqliteTable("traveler_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  nationality: text("nationality"),
  passportLastFour: text("passport_last_four"),
  dietaryRequirements: text("dietary_requirements"),
  accessibilityNeeds: text("accessibility_needs"),
  preferencesJson: text("preferences_json").notNull().default("{}"),
  emergencyContactJson: text("emergency_contact_json").notNull().default("{}"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_traveler_profiles_user").on(table.userId)]);

export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type", { enum: ["personal", "support", "corporate", "partner"] }).notNull(),
  status: text("status", { enum: ["new", "contacted", "qualified", "converted", "closed"] }).notNull().default("new"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  message: text("message").notNull(),
  source: text("source").notNull().default("website"),
  sourcePath: text("source_path"),
  marketingContextJson: text("marketing_context_json").notNull().default("{}"),
  consentAt: integer("consent_at", { mode: "timestamp_ms" }),
  consentVersion: text("consent_version"),
  assignedAgentId: text("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
  convertedTripRequestId: text("converted_trip_request_id"),
  ...timestamps,
}, (table) => [
  index("idx_leads_status_created").on(table.status, table.createdAt),
  index("idx_leads_email").on(table.email),
  index("idx_leads_converted_request").on(table.convertedTripRequestId),
]);

export const tripRequests = sqliteTable("trip_requests", {
  id: text("id").primaryKey(),
  requestNumber: text("request_number").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  kind: text("kind", { enum: ["personal", "corporate", "event"] }).notNull().default("personal"),
  status: text("status", { enum: ["submitted", "qualified", "quoting", "quoted", "approved", "declined", "converted", "closed"] }).notNull().default("submitted"),
  approvalStatus: text("approval_status", { enum: ["not_required", "pending", "approved", "declined"] }).notNull().default("not_required"),
  approverId: text("approver_id").references(() => users.id, { onDelete: "set null" }),
  assignedAgentId: text("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  departureDate: text("departure_date").notNull(),
  returnDate: text("return_date").notNull(),
  travelerCount: integer("traveler_count").notNull().default(1),
  budgetMinor: integer("budget_minor").notNull().default(0),
  currency: text("currency", { enum: ["KES", "USD"] }).notNull().default("KES"),
  interestsJson: text("interests_json").notNull().default("[]"),
  notes: text("notes"),
  source: text("source").notNull().default("website"),
  sourcePath: text("source_path"),
  marketingContextJson: text("marketing_context_json").notNull().default("{}"),
  consentAt: integer("consent_at", { mode: "timestamp_ms" }),
  consentVersion: text("consent_version"),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_trip_requests_number").on(table.requestNumber),
  index("idx_trip_requests_user_status").on(table.userId, table.status),
  index("idx_trip_requests_org_status").on(table.organizationId, table.status),
  index("idx_trip_requests_pipeline").on(table.status, table.createdAt),
  index("idx_trip_requests_user_created").on(table.userId, table.createdAt, table.id),
  index("idx_trip_requests_org_created").on(table.organizationId, table.createdAt, table.id),
]);

export const tripRequestTravelers = sqliteTable("trip_request_travelers", {
  id: text("id").primaryKey(),
  tripRequestId: text("trip_request_id").notNull().references(() => tripRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  fullName: text("full_name").notNull(),
  travelerType: text("traveler_type", { enum: ["adult", "child", "infant"] }).notNull().default("adult"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_trip_request_travelers_request").on(table.tripRequestId)]);

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["trip_request", "quote"] }).notNull(),
  entityId: text("entity_id").notNull(),
  approverId: text("approver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["pending", "approved", "declined"] }).notNull().default("pending"),
  comment: text("comment"),
  decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_approvals_approver_status").on(table.approverId, table.status), index("idx_approvals_entity").on(table.entityType, table.entityId)]);

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  email: text("email"),
  phone: text("phone"),
  country: text("country"),
  status: text("status", { enum: ["active", "pending", "suspended"] }).notNull().default("pending"),
  notes: text("notes"),
  ...timestamps,
}, (table) => [index("idx_suppliers_category_status").on(table.category, table.status)]);

export const quotes = sqliteTable("quotes", {
  id: text("id").primaryKey(),
  quoteNumber: text("quote_number").notNull(),
  tripRequestId: text("trip_request_id").notNull().references(() => tripRequests.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  status: text("status", { enum: ["draft", "sent", "viewed", "approved", "declined", "expired", "superseded"] }).notNull().default("draft"),
  current: integer("current", { mode: "boolean" }).notNull().default(true),
  currentVersion: integer("current_version").notNull().default(1),
  currency: text("currency", { enum: ["KES", "USD"] }).notNull().default("KES"),
  exchangeRate: real("exchange_rate").notNull().default(1),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  approvedAt: integer("approved_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [uniqueIndex("idx_quotes_number").on(table.quoteNumber), uniqueIndex("idx_quotes_request_current").on(table.tripRequestId).where(sql`${table.current} = 1`), index("idx_quotes_request").on(table.tripRequestId), index("idx_quotes_user_status").on(table.userId, table.status), index("idx_quotes_user_current_created").on(table.userId, table.current, table.createdAt, table.id), index("idx_quotes_org_current_created").on(table.organizationId, table.current, table.createdAt, table.id)]);

export const quoteVersions = sqliteTable("quote_versions", {
  id: text("id").primaryKey(),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  subtotalMinor: integer("subtotal_minor").notNull().default(0),
  feesMinor: integer("fees_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  notes: text("notes"),
  snapshotJson: text("snapshot_json").notNull().default("{}"),
  pdfKey: text("pdf_key"),
  createdBy: text("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("idx_quote_versions_quote_version").on(table.quoteId, table.version), index("idx_quote_versions_created").on(table.quoteId, table.createdAt)]);

export const quoteItems = sqliteTable("quote_items", {
  id: text("id").primaryKey(),
  quoteVersionId: text("quote_version_id").notNull().references(() => quoteVersions.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  category: text("category", { enum: ["flight", "hotel", "transfer", "activity", "visa", "insurance", "fee", "other"] }).notNull(),
  description: text("description").notNull(),
  serviceDate: text("service_date"),
  quantity: integer("quantity").notNull().default(1),
  unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  markupMinor: integer("markup_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  position: integer("position").notNull().default(0),
}, (table) => [index("idx_quote_items_version_position").on(table.quoteVersionId, table.position)]);

export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  bookingNumber: text("booking_number").notNull(),
  quoteId: text("quote_id").notNull().references(() => quotes.id, { onDelete: "restrict" }),
  tripRequestId: text("trip_request_id").notNull().references(() => tripRequests.id, { onDelete: "restrict" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  status: text("status", { enum: ["pending", "confirmed", "in_progress", "completed", "cancelled"] }).notNull().default("pending"),
  destination: text("destination").notNull(),
  departureDate: text("departure_date").notNull(),
  returnDate: text("return_date").notNull(),
  travelerCount: integer("traveler_count").notNull().default(1),
  itineraryPdfKey: text("itinerary_pdf_key"),
  ...timestamps,
}, (table) => [uniqueIndex("idx_bookings_number").on(table.bookingNumber), uniqueIndex("idx_bookings_quote").on(table.quoteId), uniqueIndex("idx_bookings_request").on(table.tripRequestId), index("idx_bookings_user_status").on(table.userId, table.status), index("idx_bookings_org_status").on(table.organizationId, table.status), index("idx_bookings_user_created").on(table.userId, table.createdAt, table.id), index("idx_bookings_org_created").on(table.organizationId, table.createdAt, table.id), index("idx_bookings_status_created").on(table.status, table.createdAt, table.id)]);

export const itineraryDays = sqliteTable("itinerary_days", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
}, (table) => [uniqueIndex("idx_itinerary_days_booking_day").on(table.bookingId, table.dayNumber)]);

export const bookingSegments = sqliteTable("booking_segments", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["flight", "hotel", "transfer", "activity", "visa", "insurance", "other"] }).notNull(),
  supplierId: text("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  confirmationCode: text("confirmation_code"),
  startAt: integer("start_at", { mode: "timestamp_ms" }),
  endAt: integer("end_at", { mode: "timestamp_ms" }),
  detailsJson: text("details_json").notNull().default("{}"),
  status: text("status", { enum: ["pending", "confirmed", "cancelled"] }).notNull().default("pending"),
}, (table) => [index("idx_booking_segments_booking_start").on(table.bookingId, table.startAt)]);

export const serviceAssignments = sqliteTable("service_assignments", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
  supplierId: text("supplier_id").notNull().references(() => suppliers.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["assigned", "confirmed", "declined", "completed"] }).notNull().default("assigned"),
  serviceType: text("service_type").notNull(),
  travelerSummary: text("traveler_summary"),
  serviceDetailsJson: text("service_details_json").notNull().default("{}"),
  partnerNote: text("partner_note"),
  confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [index("idx_service_assignments_supplier_status").on(table.supplierId, table.status), index("idx_service_assignments_booking").on(table.bookingId)]);

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  bookingId: text("booking_id").notNull().references(() => bookings.id, { onDelete: "restrict" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  status: text("status", { enum: ["draft", "issued", "partially_paid", "paid", "overdue", "void"] }).notNull().default("draft"),
  currency: text("currency", { enum: ["KES", "USD"] }).notNull().default("KES"),
  exchangeRate: real("exchange_rate").notNull().default(1),
  subtotalMinor: integer("subtotal_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  paidMinor: integer("paid_minor").notNull().default(0),
  dueMinor: integer("due_minor").notNull().default(0),
  issueDate: text("issue_date"),
  dueDate: text("due_date"),
  pdfKey: text("pdf_key"),
  current: integer("current", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("idx_invoices_number").on(table.invoiceNumber),
  uniqueIndex("idx_invoices_booking_current").on(table.bookingId).where(sql`${table.current} = 1`),
  index("idx_invoices_booking").on(table.bookingId),
  index("idx_invoices_status_due").on(table.status, table.dueDate),
  index("idx_invoices_user_status").on(table.userId, table.status),
  index("idx_invoices_user_created").on(table.userId, table.createdAt, table.id),
  index("idx_invoices_org_created").on(table.organizationId, table.createdAt, table.id),
  index("idx_invoices_status_created").on(table.status, table.createdAt, table.id),
]);

export const invoiceItems = sqliteTable("invoice_items", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  position: integer("position").notNull().default(0),
}, (table) => [index("idx_invoice_items_invoice_position").on(table.invoiceId, table.position)]);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency", { enum: ["KES", "USD"] }).notNull(),
  method: text("method", { enum: ["bank_transfer", "cash", "external_link", "mobile_money", "card", "other"] }).notNull(),
  reference: text("reference"),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }).notNull(),
  recordedBy: text("recorded_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  receiptKey: text("receipt_key"),
  note: text("note"),
  idempotencyKey: text("idempotency_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_payments_receipt").on(table.receiptNumber),
  uniqueIndex("idx_payments_idempotency").on(table.idempotencyKey),
  uniqueIndex("idx_payments_invoice_reference").on(table.invoiceId, table.reference),
  index("idx_payments_invoice_paid").on(table.invoiceId, table.paidAt),
]);

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  ticketNumber: text("ticket_number").notNull(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  bookingId: text("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  status: text("status", { enum: ["open", "waiting_customer", "waiting_tvse", "resolved", "closed"] }).notNull().default("open"),
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).notNull().default("normal"),
  assignedAgentId: text("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [uniqueIndex("idx_support_tickets_number").on(table.ticketNumber), index("idx_support_tickets_status_priority").on(table.status, table.priority), index("idx_support_tickets_user").on(table.userId), index("idx_support_user_updated").on(table.userId, table.updatedAt, table.id), index("idx_support_org_updated").on(table.organizationId, table.updatedAt, table.id)]);

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  senderId: text("sender_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  internal: integer("internal", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_messages_ticket_created").on(table.ticketId, table.createdAt)]);

export const mediaAssets = sqliteTable("media_assets", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  visibility: text("visibility", { enum: ["private", "public"] }).notNull().default("private"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("idx_media_assets_r2_key").on(table.r2Key), index("idx_media_assets_entity").on(table.entityType, table.entityId), index("idx_media_assets_owner").on(table.ownerUserId)]);

export const destinations = sqliteTable("destinations", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  region: text("region").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  imagePath: text("image_path").notNull(),
  highlightsJson: text("highlights_json").notNull().default("[]"),
  bestTime: text("best_time"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [uniqueIndex("idx_destinations_slug").on(table.slug), index("idx_destinations_status_featured").on(table.status, table.featured)]);

export const packages = sqliteTable("packages", {
  id: text("id").primaryKey(),
  destinationId: text("destination_id").references(() => destinations.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  durationDays: integer("duration_days").notNull(),
  fromPriceMinor: integer("from_price_minor").notNull(),
  currency: text("currency", { enum: ["KES", "USD"] }).notNull().default("KES"),
  imagePath: text("image_path").notNull(),
  inclusionsJson: text("inclusions_json").notNull().default("[]"),
  exclusionsJson: text("exclusions_json").notNull().default("[]"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [uniqueIndex("idx_packages_slug").on(table.slug), index("idx_packages_status_featured").on(table.status, table.featured), index("idx_packages_destination").on(table.destinationId)]);

export const contentEntries = sqliteTable("content_entries", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["article", "guide", "page"] }).notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  body: text("body").notNull(),
  imagePath: text("image_path"),
  status: text("status", { enum: ["draft", "published", "archived"] }).notNull().default("draft"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (table) => [uniqueIndex("idx_content_type_slug").on(table.type, table.slug), index("idx_content_status_published").on(table.status, table.publishedAt)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  channel: text("channel", { enum: ["email", "in_app"] }).notNull().default("email"),
  template: text("template").notNull(),
  destination: text("destination").notNull(),
  status: text("status", { enum: ["pending", "sending", "sent", "delivered", "failed", "bounced"] }).notNull().default("pending"),
  payloadJson: text("payload_json").notNull().default("{}"),
  providerId: text("provider_id"),
  dedupeKey: text("dedupe_key"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("idx_notifications_dedupe").on(table.dedupeKey), index("idx_notifications_status_created").on(table.status, table.createdAt), index("idx_notifications_provider").on(table.providerId)]);

export const idempotencyRecords = sqliteTable("idempotency_records", {
  id: text("id").primaryKey(),
  // Authenticated mutations use the user id; anonymous mutations use a
  // one-way hash of their email. This deliberately is not a foreign key.
  actorId: text("actor_id").notNull(),
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  status: text("status", { enum: ["pending", "completed"] }).notNull().default("pending"),
  responseJson: text("response_json"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_idempotency_actor_scope_key").on(table.actorId, table.scope, table.keyHash),
  index("idx_idempotency_expiry").on(table.expiresAt),
]);

export const rateLimits = sqliteTable("rate_limits", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  bucketStart: integer("bucket_start").notNull(),
  count: integer("count").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_rate_limits_scope_key_bucket").on(table.scope, table.keyHash, table.bucketStart),
  index("idx_rate_limits_updated").on(table.updatedAt),
]);

export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [uniqueIndex("idx_webhook_provider_event").on(table.provider, table.eventId)]);

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("idx_activity_entity_created").on(table.entityType, table.entityId, table.createdAt), index("idx_activity_actor_created").on(table.actorId, table.createdAt)]);

export const sequences = sqliteTable("sequences", {
  id: text("id").primaryKey(),
  currentValue: integer("current_value").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Additive control-plane tables for the v2 operational-shard rollout. The
// legacy operational tables above intentionally remain in core during the
// compatibility and rollback window.
export const tenantRoutes = sqliteTable("tenant_routes", {
  id: text("id").primaryKey(),
  tenantKey: text("tenant_key").notNull(),
  tenantType: text("tenant_type", { enum: ["organization", "user", "anonymous"] }).notNull(),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
  shard: integer("shard").notNull(),
  readMode: text("read_mode", { enum: ["core", "shadow", "shard"] }).notNull().default("core"),
  mirrorWrites: integer("mirror_writes", { mode: "boolean" }).notNull().default(false),
  assignedAt: integer("assigned_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_tenant_routes_key").on(table.tenantKey),
  index("idx_tenant_routes_shard_mode").on(table.shard, table.readMode),
  index("idx_tenant_routes_org").on(table.organizationId),
  index("idx_tenant_routes_user").on(table.userId),
]);

export const coreChangeEvents = sqliteTable("core_change_events", {
  id: text("id").primaryKey(),
  tenantKey: text("tenant_key").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  operation: text("operation", { enum: ["upsert", "delete"] }).notNull(),
  rowVersion: integer("row_version").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status", { enum: ["pending", "published", "applied", "dead"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: integer("available_at", { mode: "timestamp_ms" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_core_change_entity_version").on(table.entityType, table.entityId, table.rowVersion),
  index("idx_core_change_pending").on(table.status, table.availableAt),
  index("idx_core_change_tenant").on(table.tenantKey, table.createdAt),
]);

export const migrationState = sqliteTable("migration_state", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const contentSearchTerms = sqliteTable("content_search_terms", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["destination", "package", "content"] }).notNull(),
  entityId: text("entity_id").notNull(),
  term: text("term").notNull(),
  weight: integer("weight").notNull().default(1),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_content_search_entity_term").on(table.entityType, table.entityId, table.term),
  index("idx_content_search_term_weight").on(table.term, table.weight),
]);
