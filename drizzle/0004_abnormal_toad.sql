CREATE INDEX `idx_bookings_user_created` ON `bookings` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_org_created` ON `bookings` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_status_created` ON `bookings` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_user_created` ON `invoices` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_org_created` ON `invoices` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status_created` ON `invoices` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_quotes_user_current_created` ON `quotes` (`user_id`,`current`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_quotes_org_current_created` ON `quotes` (`organization_id`,`current`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_support_user_updated` ON `support_tickets` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_support_org_updated` ON `support_tickets` (`organization_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_trip_requests_user_created` ON `trip_requests` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_trip_requests_org_created` ON `trip_requests` (`organization_id`,`created_at`,`id`);