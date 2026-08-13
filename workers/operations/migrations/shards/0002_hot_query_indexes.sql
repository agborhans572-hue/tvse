-- Separate tenant-only and staff-wide order indexes are intentional. The
-- tenant/status indexes in 0001 cannot satisfy ORDER BY created_at when the
-- optional status predicate is absent, and their tenant prefix cannot serve a
-- staff-wide merge.
CREATE INDEX idx_leads_tenant_created ON leads(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_leads_global_created ON leads(created_at DESC, id DESC);
CREATE INDEX idx_leads_global_status_created ON leads(status, created_at DESC, id DESC);

CREATE INDEX idx_requests_tenant_created ON trip_requests(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_requests_global_created ON trip_requests(created_at DESC, id DESC);
CREATE INDEX idx_requests_global_status_created ON trip_requests(status, created_at DESC, id DESC);

CREATE INDEX idx_approvals_tenant_created ON approvals(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_approvals_global_created ON approvals(created_at DESC, id DESC);
CREATE INDEX idx_approvals_global_status_created ON approvals(status, created_at DESC, id DESC);

CREATE INDEX idx_quotes_tenant_created ON quotes(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_quotes_global_created ON quotes(created_at DESC, id DESC);
CREATE INDEX idx_quotes_global_status_created ON quotes(status, created_at DESC, id DESC);

CREATE INDEX idx_bookings_tenant_created ON bookings(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_bookings_global_created ON bookings(created_at DESC, id DESC);
CREATE INDEX idx_bookings_global_status_created ON bookings(status, created_at DESC, id DESC);

CREATE INDEX idx_assignments_tenant_created ON service_assignments(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_assignments_global_created ON service_assignments(created_at DESC, id DESC);
CREATE INDEX idx_assignments_global_status_created ON service_assignments(status, created_at DESC, id DESC);

CREATE INDEX idx_invoices_tenant_created ON invoices(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_invoices_global_created ON invoices(created_at DESC, id DESC);
CREATE INDEX idx_invoices_global_status_created ON invoices(status, created_at DESC, id DESC);
CREATE INDEX idx_invoices_tenant_issue_currency_status ON invoices(tenant_key, issue_date, currency, status);

CREATE INDEX idx_support_tenant_created ON support_tickets(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_support_global_created ON support_tickets(created_at DESC, id DESC);
CREATE INDEX idx_support_global_status_created ON support_tickets(status, created_at DESC, id DESC);
CREATE INDEX idx_messages_ticket_public_created ON messages(ticket_id, internal, created_at DESC, id DESC);

CREATE INDEX idx_notifications_tenant_created ON notifications(tenant_key, created_at DESC, id DESC);
CREATE INDEX idx_notifications_global_created ON notifications(created_at DESC, id DESC);
CREATE INDEX idx_notifications_global_status_created ON notifications(status, created_at DESC, id DESC);

CREATE INDEX idx_audit_global_created ON audit_events(created_at DESC, id DESC);
CREATE INDEX idx_jobs_global_created ON async_jobs(created_at DESC, id DESC);

-- Prefix-search indexes used by the v2 server-side search predicates.
CREATE INDEX idx_requests_tenant_reference ON trip_requests(tenant_key, request_number, created_at DESC, id DESC);
CREATE INDEX idx_quotes_tenant_reference ON quotes(tenant_key, quote_number, created_at DESC, id DESC);
CREATE INDEX idx_bookings_tenant_reference ON bookings(tenant_key, booking_number, created_at DESC, id DESC);
CREATE INDEX idx_invoices_tenant_reference ON invoices(tenant_key, invoice_number, created_at DESC, id DESC);
CREATE INDEX idx_support_tenant_reference ON support_tickets(tenant_key, ticket_number, created_at DESC, id DESC);
