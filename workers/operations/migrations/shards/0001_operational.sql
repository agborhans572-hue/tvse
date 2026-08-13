PRAGMA foreign_keys = ON;

-- Every tenant is permanently assigned by CORE_DB. Root and child rows keep
-- tenant_key so authorization never depends on an unbounded join.
CREATE TABLE leads (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, user_id TEXT, type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT, company TEXT, message TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'website',
  source_path TEXT, marketing_context_json TEXT NOT NULL DEFAULT '{}', consent_at INTEGER,
  consent_version TEXT, assigned_agent_id TEXT, converted_trip_request_id TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_leads_tenant_status_created ON leads(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_leads_tenant_email ON leads(tenant_key, email);

CREATE TABLE trip_requests (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, request_number TEXT NOT NULL,
  user_id TEXT, organization_id TEXT, kind TEXT NOT NULL DEFAULT 'personal',
  status TEXT NOT NULL DEFAULT 'submitted', approval_status TEXT NOT NULL DEFAULT 'not_required',
  approver_id TEXT, assigned_agent_id TEXT, contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL, contact_phone TEXT, origin TEXT NOT NULL,
  destination TEXT NOT NULL, departure_date TEXT NOT NULL, return_date TEXT NOT NULL,
  traveler_count INTEGER NOT NULL DEFAULT 1, budget_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES', interests_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT, source TEXT NOT NULL DEFAULT 'website', source_path TEXT,
  marketing_context_json TEXT NOT NULL DEFAULT '{}', consent_at INTEGER, consent_version TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_trip_requests_number ON trip_requests(request_number);
CREATE INDEX idx_trip_requests_tenant_status_created ON trip_requests(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_trip_requests_tenant_email_created ON trip_requests(tenant_key, contact_email, created_at DESC, id DESC);
CREATE INDEX idx_trip_requests_user_created ON trip_requests(user_id, created_at DESC, id DESC);
CREATE INDEX idx_trip_requests_org_created ON trip_requests(organization_id, created_at DESC, id DESC);

CREATE TABLE trip_request_travelers (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, trip_request_id TEXT NOT NULL,
  user_id TEXT, full_name TEXT NOT NULL, traveler_type TEXT NOT NULL DEFAULT 'adult',
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
  FOREIGN KEY(trip_request_id) REFERENCES trip_requests(id) ON DELETE CASCADE
);
CREATE INDEX idx_trip_travelers_request ON trip_request_travelers(tenant_key, trip_request_id);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, approver_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  comment TEXT, decided_at INTEGER, row_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_approvals_tenant_status_created ON approvals(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_approvals_entity ON approvals(tenant_key, entity_type, entity_id);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, quote_number TEXT NOT NULL,
  trip_request_id TEXT NOT NULL, user_id TEXT, organization_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft', current INTEGER NOT NULL DEFAULT 1,
  current_version INTEGER NOT NULL DEFAULT 1, currency TEXT NOT NULL DEFAULT 'KES',
  exchange_rate REAL NOT NULL DEFAULT 1, expires_at INTEGER, sent_at INTEGER,
  approved_at INTEGER, pdf_status TEXT NOT NULL DEFAULT 'pending',
  delivery_status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  FOREIGN KEY(trip_request_id) REFERENCES trip_requests(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_quotes_number ON quotes(quote_number);
CREATE UNIQUE INDEX idx_quotes_request_current ON quotes(trip_request_id) WHERE current = 1;
CREATE INDEX idx_quotes_tenant_status_created ON quotes(tenant_key, status, created_at DESC, id DESC);

CREATE TABLE quote_versions (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, quote_id TEXT NOT NULL, version INTEGER NOT NULL,
  subtotal_minor INTEGER NOT NULL DEFAULT 0, fees_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
  notes TEXT, snapshot_json TEXT NOT NULL DEFAULT '{}', pdf_key TEXT, created_by TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_quote_versions_number ON quote_versions(quote_id, version);

CREATE TABLE quote_items (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, quote_version_id TEXT NOT NULL, supplier_id TEXT,
  category TEXT NOT NULL, description TEXT NOT NULL, service_date TEXT, quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_minor INTEGER NOT NULL DEFAULT 0, markup_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(quote_version_id) REFERENCES quote_versions(id) ON DELETE CASCADE
);
CREATE INDEX idx_quote_items_version ON quote_items(tenant_key, quote_version_id, position);

CREATE TABLE bookings (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, booking_number TEXT NOT NULL,
  quote_id TEXT NOT NULL, trip_request_id TEXT NOT NULL, user_id TEXT, organization_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', destination TEXT NOT NULL, departure_date TEXT NOT NULL,
  return_date TEXT NOT NULL, traveler_count INTEGER NOT NULL DEFAULT 1, itinerary_pdf_key TEXT,
  pdf_status TEXT NOT NULL DEFAULT 'pending', delivery_status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_bookings_number ON bookings(booking_number);
CREATE INDEX idx_bookings_tenant_status_created ON bookings(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_bookings_request ON bookings(trip_request_id);

CREATE TABLE itinerary_days (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, booking_id TEXT NOT NULL, day_number INTEGER NOT NULL,
  date TEXT NOT NULL, title TEXT NOT NULL, description TEXT, location TEXT,
  row_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_itinerary_day ON itinerary_days(booking_id, day_number);

CREATE TABLE booking_segments (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, booking_id TEXT NOT NULL, type TEXT NOT NULL,
  supplier_id TEXT, confirmation_code TEXT, start_at INTEGER, end_at INTEGER,
  details_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
  row_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);
CREATE INDEX idx_segments_booking ON booking_segments(tenant_key, booking_id, start_at);

CREATE TABLE service_assignments (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, booking_id TEXT NOT NULL, supplier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned', service_type TEXT NOT NULL, traveler_summary TEXT,
  service_details_json TEXT NOT NULL DEFAULT '{}', partner_note TEXT, confirmed_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_assignments_tenant_status_created ON service_assignments(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_assignments_supplier_status ON service_assignments(supplier_id, status, created_at DESC, id DESC);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, invoice_number TEXT NOT NULL, booking_id TEXT NOT NULL,
  user_id TEXT, organization_id TEXT, status TEXT NOT NULL DEFAULT 'draft', current INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL DEFAULT 'KES', exchange_rate REAL NOT NULL DEFAULT 1,
  subtotal_minor INTEGER NOT NULL DEFAULT 0, tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0, paid_minor INTEGER NOT NULL DEFAULT 0,
  due_minor INTEGER NOT NULL DEFAULT 0, issue_date TEXT, due_date TEXT, pdf_key TEXT,
  pdf_status TEXT NOT NULL DEFAULT 'pending', delivery_status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_tenant_status_created ON invoices(tenant_key, status, created_at DESC, id DESC);
CREATE INDEX idx_invoices_tenant_due ON invoices(tenant_key, due_date, status);

CREATE TABLE invoice_items (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, invoice_id TEXT NOT NULL, description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1, unit_price_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0, total_minor INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(tenant_key, invoice_id, position);

CREATE TABLE payments (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, receipt_number TEXT NOT NULL, invoice_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL, reference TEXT,
  paid_at INTEGER NOT NULL, recorded_by TEXT NOT NULL, receipt_key TEXT, note TEXT,
  pdf_status TEXT NOT NULL DEFAULT 'pending', delivery_status TEXT NOT NULL DEFAULT 'pending', last_error TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_payments_receipt ON payments(receipt_number);
CREATE UNIQUE INDEX idx_payments_invoice_reference ON payments(invoice_id, reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_payments_tenant_paid ON payments(tenant_key, paid_at DESC, id DESC);

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, ticket_number TEXT NOT NULL, user_id TEXT,
  organization_id TEXT, booking_id TEXT, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal', assigned_agent_id TEXT,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_support_number ON support_tickets(ticket_number);
CREATE INDEX idx_support_tenant_status_created ON support_tickets(tenant_key, status, created_at DESC, id DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, ticket_id TEXT NOT NULL, sender_id TEXT,
  body TEXT NOT NULL, internal INTEGER NOT NULL DEFAULT 0, row_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);
CREATE INDEX idx_messages_ticket_created ON messages(tenant_key, ticket_id, created_at DESC, id DESC);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, owner_user_id TEXT, entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL, r2_key TEXT NOT NULL, filename TEXT NOT NULL, content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL, visibility TEXT NOT NULL DEFAULT 'private',
  status TEXT NOT NULL DEFAULT 'pending', upload_expires_at INTEGER,
  row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_media_r2_key ON media_assets(r2_key);
CREATE INDEX idx_media_tenant_entity ON media_assets(tenant_key, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_media_abandoned ON media_assets(status, upload_expires_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, user_id TEXT, channel TEXT NOT NULL DEFAULT 'email',
  template TEXT NOT NULL, destination TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  payload_json TEXT NOT NULL DEFAULT '{}', provider_id TEXT, dedupe_key TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT, sent_at INTEGER, row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_notifications_tenant_status_created ON notifications(tenant_key, status, created_at DESC, id DESC);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, provider TEXT NOT NULL, event_id TEXT NOT NULL,
  event_type TEXT NOT NULL, payload_json TEXT, processed_at INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_webhook_provider_event ON webhook_events(provider, event_id);
CREATE INDEX idx_webhook_retention ON webhook_events(created_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, actor_id TEXT, organization_id TEXT,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}', row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_tenant_created ON audit_events(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_audit_entity_created ON audit_events(tenant_key, entity_type, entity_id, created_at DESC);

CREATE TABLE idempotency_records (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, scope TEXT NOT NULL, key_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', response_json TEXT, expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_idempotency_actor_scope_key ON idempotency_records(actor_id, scope, key_hash);
CREATE INDEX idx_idempotency_expiry ON idempotency_records(status, expires_at);

CREATE TABLE async_jobs (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, type TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending', dedupe_key TEXT NOT NULL, payload_json TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL, lease_owner TEXT, lease_expires_at INTEGER,
  last_error TEXT, result_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE UNIQUE INDEX idx_jobs_dedupe ON async_jobs(dedupe_key);
CREATE INDEX idx_jobs_recovery ON async_jobs(state, available_at, lease_expires_at);
CREATE INDEX idx_jobs_tenant_created ON async_jobs(tenant_key, created_at DESC, id DESC);

CREATE TABLE daily_aggregates (
  id TEXT PRIMARY KEY, tenant_key TEXT NOT NULL, day TEXT NOT NULL, metric TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT '', value_integer INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_daily_aggregate_key ON daily_aggregates(tenant_key, day, metric, currency);
CREATE INDEX idx_daily_aggregate_range ON daily_aggregates(tenant_key, metric, day);

CREATE TABLE migration_applied_events (
  event_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  row_version INTEGER NOT NULL, applied_at INTEGER NOT NULL
);
