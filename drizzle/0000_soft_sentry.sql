CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`organization_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_entity_created` ON `activity_logs` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_actor_created` ON `activity_logs` (`actor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`approver_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`comment` text,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_approvals_approver_status` ON `approvals` (`approver_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_approvals_entity` ON `approvals` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `booking_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`supplier_id` text,
	`confirmation_code` text,
	`start_at` integer,
	`end_at` integer,
	`details_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_booking_segments_booking_start` ON `booking_segments` (`booking_id`,`start_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_number` text NOT NULL,
	`quote_id` text NOT NULL,
	`trip_request_id` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`destination` text NOT NULL,
	`departure_date` text NOT NULL,
	`return_date` text NOT NULL,
	`traveler_count` integer DEFAULT 1 NOT NULL,
	`itinerary_pdf_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_number` ON `bookings` (`booking_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_quote` ON `bookings` (`quote_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_user_status` ON `bookings` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_org_status` ON `bookings` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `content_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`body` text NOT NULL,
	`image_path` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`author_id` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_content_type_slug` ON `content_entries` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_content_status_published` ON `content_entries` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`region` text NOT NULL,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`image_path` text NOT NULL,
	`highlights_json` text DEFAULT '[]' NOT NULL,
	`best_time` text,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_destinations_slug` ON `destinations` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_destinations_status_featured` ON `destinations` (`status`,`featured`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice_position` ON `invoice_items` (`invoice_id`,`position`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_number` text NOT NULL,
	`booking_id` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`paid_minor` integer DEFAULT 0 NOT NULL,
	`due_minor` integer DEFAULT 0 NOT NULL,
	`issue_date` text,
	`due_date` text,
	`pdf_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_number` ON `invoices` (`invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoices_booking` ON `invoices` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_invoices_status_due` ON `invoices` (`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `idx_invoices_user_status` ON `invoices` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `itinerary_days` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`day_number` integer NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_itinerary_days_booking_day` ON `itinerary_days` (`booking_id`,`day_number`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`company` text,
	`message` text NOT NULL,
	`source` text DEFAULT 'website' NOT NULL,
	`assigned_agent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_leads_status_created` ON `leads` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_leads_email` ON `leads` (`email`);--> statement-breakpoint
CREATE TABLE `magic_links` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`intended_role` text DEFAULT 'traveler' NOT NULL,
	`return_to` text DEFAULT '/portal' NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`request_ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_magic_links_token_hash` ON `magic_links` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_magic_links_email_created` ON `magic_links` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_assets_r2_key` ON `media_assets` (`r2_key`);--> statement-breakpoint
CREATE INDEX `idx_media_assets_entity` ON `media_assets` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `idx_media_assets_owner` ON `media_assets` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_org_user` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_id` text,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_messages_ticket_created` ON `messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`channel` text DEFAULT 'email' NOT NULL,
	`template` text NOT NULL,
	`destination` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`provider_id` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_status_created` ON `notifications` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_provider` ON `notifications` (`provider_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'prospect' NOT NULL,
	`billing_email` text,
	`default_currency` text DEFAULT 'KES' NOT NULL,
	`approver_user_id` text,
	`travel_policy_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_organizations_slug` ON `organizations` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_organizations_type_status` ON `organizations` (`type`,`status`);--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`destination_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`description` text NOT NULL,
	`duration_days` integer NOT NULL,
	`from_price_minor` integer NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`image_path` text NOT NULL,
	`inclusions_json` text DEFAULT '[]' NOT NULL,
	`exclusions_json` text DEFAULT '[]' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_packages_slug` ON `packages` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_packages_status_featured` ON `packages` (`status`,`featured`);--> statement-breakpoint
CREATE INDEX `idx_packages_destination` ON `packages` (`destination_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`paid_at` integer NOT NULL,
	`recorded_by` text NOT NULL,
	`receipt_key` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_receipt` ON `payments` (`receipt_number`);--> statement-breakpoint
CREATE INDEX `idx_payments_invoice_paid` ON `payments` (`invoice_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `quote_items` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_version_id` text NOT NULL,
	`supplier_id` text,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`service_date` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`markup_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`quote_version_id`) REFERENCES `quote_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_quote_items_version_position` ON `quote_items` (`quote_version_id`,`position`);--> statement-breakpoint
CREATE TABLE `quote_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`version` integer NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`fees_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`pdf_key` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quote_versions_quote_version` ON `quote_versions` (`quote_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_quote_versions_created` ON `quote_versions` (`quote_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_number` text NOT NULL,
	`trip_request_id` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`exchange_rate` real DEFAULT 1 NOT NULL,
	`expires_at` integer,
	`sent_at` integer,
	`approved_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quotes_number` ON `quotes` (`quote_number`);--> statement-breakpoint
CREATE INDEX `idx_quotes_request` ON `quotes` (`trip_request_id`);--> statement-breakpoint
CREATE INDEX `idx_quotes_user_status` ON `quotes` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`current_value` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`supplier_id` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`service_type` text NOT NULL,
	`traveler_summary` text,
	`service_details_json` text DEFAULT '{}' NOT NULL,
	`partner_note` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_service_assignments_supplier_status` ON `service_assignments` (`supplier_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_service_assignments_booking` ON `service_assignments` (`booking_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_expiry` ON `sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`email` text,
	`phone` text,
	`country` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_suppliers_category_status` ON `suppliers` (`category`,`status`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_number` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`booking_id` text,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`assigned_agent_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_support_tickets_number` ON `support_tickets` (`ticket_number`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_status_priority` ON `support_tickets` (`status`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_user` ON `support_tickets` (`user_id`);--> statement-breakpoint
CREATE TABLE `traveler_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`nationality` text,
	`passport_last_four` text,
	`dietary_requirements` text,
	`accessibility_needs` text,
	`preferences_json` text DEFAULT '{}' NOT NULL,
	`emergency_contact_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_traveler_profiles_user` ON `traveler_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `trip_request_travelers` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_request_id` text NOT NULL,
	`user_id` text,
	`full_name` text NOT NULL,
	`traveler_type` text DEFAULT 'adult' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_request_id`) REFERENCES `trip_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_trip_request_travelers_request` ON `trip_request_travelers` (`trip_request_id`);--> statement-breakpoint
CREATE TABLE `trip_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`request_number` text NOT NULL,
	`user_id` text,
	`organization_id` text,
	`kind` text DEFAULT 'personal' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`approval_status` text DEFAULT 'not_required' NOT NULL,
	`approver_id` text,
	`assigned_agent_id` text,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`contact_phone` text,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`departure_date` text NOT NULL,
	`return_date` text NOT NULL,
	`traveler_count` integer DEFAULT 1 NOT NULL,
	`budget_minor` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'KES' NOT NULL,
	`interests_json` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`source` text DEFAULT 'website' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_requests_number` ON `trip_requests` (`request_number`);--> statement-breakpoint
CREATE INDEX `idx_trip_requests_user_status` ON `trip_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_trip_requests_org_status` ON `trip_requests` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_trip_requests_pipeline` ON `trip_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text,
	`phone` text,
	`kind` text DEFAULT 'traveler' NOT NULL,
	`role` text DEFAULT 'traveler' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`platform_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_platform_user_id` ON `users` (`platform_user_id`);--> statement-breakpoint
CREATE INDEX `idx_users_role_status` ON `users` (`role`,`status`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_webhook_provider_event` ON `webhook_events` (`provider`,`event_id`);
--> statement-breakpoint
INSERT INTO `destinations` (`id`,`slug`,`name`,`country`,`region`,`summary`,`description`,`image_path`,`highlights_json`,`best_time`,`featured`,`status`,`seo_title`,`seo_description`,`published_at`,`created_at`,`updated_at`) VALUES
('dst_zanzibar','zanzibar','Zanzibar','Tanzania','East Africa','Stone Town stories, spice-farm afternoons and barefoot Indian Ocean days.','Pair historic Stone Town with quiet beaches, dhow sunsets and locally guided island experiences.','/hero-zanzibar.jpg','["Stone Town","Spice farms","Private dhow sail"]','June to October',1,'published','Zanzibar holidays with TVSE','Tailor-made Zanzibar journeys from Nairobi.',1785997500000,1785997500000,1785997500000),
('dst_mara','maasai-mara','Maasai Mara','Kenya','East Africa','Big skies, exceptional wildlife and safari camps chosen with care.','A tailor-made safari with trusted guides, considered pacing and a camp style that fits you.','/maasai-mara.jpg','["Game drives","Conservancy stays","Balloon safari"]','July to October',1,'published','Maasai Mara safaris with TVSE','Thoughtfully designed Maasai Mara safaris.',1785997500000,1785997500000,1785997500000),
('dst_cape','cape-town','Cape Town','South Africa','Southern Africa','Mountain mornings, vineyard lunches and long Atlantic evenings.','Blend Cape Town food, culture and coast with the Winelands or a Garden Route extension.','/cape-town.jpg','["Table Mountain","Cape Peninsula","Winelands"]','October to April',1,'published','Cape Town holidays with TVSE','Cape Town and Winelands journeys.',1785997500000,1785997500000,1785997500000),
('dst_santorini','santorini','Santorini','Greece','Europe','Caldera views, quiet villages and Aegean sunsets beyond the postcard.','Explore Santorini through food, sailing and slower village days.','/santorini.jpg','["Caldera cruise","Oia","Local wineries"]','May to October',0,'published','Santorini holidays with TVSE','Tailor-made Santorini escapes.',1785997500000,1785997500000,1785997500000),
('dst_bali','bali','Bali','Indonesia','Asia','Temple mornings, design-led stays and tropical landscapes at your own rhythm.','Combine Ubud, the coast and creative culture around wellness, food and discovery.','/bali.jpg','["Ubud","Temple trail","Private villas"]','April to October',0,'published','Bali holidays with TVSE','Personal Bali journeys and retreats.',1785997500000,1785997500000,1785997500000),
('dst_amboseli','amboseli','Amboseli','Kenya','East Africa','Elephant country beneath Kilimanjaro’s unforgettable silhouette.','A compact Kenyan safari ideal for photography, family adventures and thoughtful lodge stays.','/maasai-mara.jpg','["Elephant herds","Kilimanjaro views","Maasai culture"]','June to October',0,'published','Amboseli safaris with TVSE','Tailor-made Amboseli safari planning.',1785997500000,1785997500000,1785997500000),
('dst_diani','diani-beach','Diani Beach','Kenya','East Africa','White sand, warm water and an easy finish to an East African journey.','Choose intimate boutique hotels or relaxed family resorts with diving and coastal culture nearby.','/hero-zanzibar.jpg','["Kisite Marine Park","Kitesurfing","Coastal dining"]','January to March',0,'published','Diani Beach holidays with TVSE','Curated Diani Beach escapes.',1785997500000,1785997500000,1785997500000),
('dst_mombasa','mombasa','Mombasa','Kenya','East Africa','Swahili heritage, ocean air and centuries of stories along the coast.','Explore Old Town and Fort Jesus before unwinding at a coast resort.','/hero-zanzibar.jpg','["Fort Jesus","Old Town","Indian Ocean"]','July to October',0,'published','Mombasa holidays with TVSE','Mombasa culture and coast journeys.',1785997500000,1785997500000,1785997500000),
('dst_dubai','dubai','Dubai','United Arab Emirates','Middle East','Bold city energy, desert quiet and effortless stopover experiences.','A polished city break balancing architecture, food, family attractions, beaches and desert.','/cape-town.jpg','["Old Dubai","Desert safari","City dining"]','November to March',0,'published','Dubai holidays with TVSE','Dubai city breaks from Nairobi.',1785997500000,1785997500000,1785997500000),
('dst_seychelles','seychelles','Seychelles','Seychelles','Indian Ocean','Granite coves, forested islands and rare space to properly switch off.','Island-hop or settle into one exceptional resort with every transfer coordinated.','/hero-zanzibar.jpg','["Mahé","Praslin","La Digue"]','April to May',0,'published','Seychelles holidays with TVSE','Tailor-made Seychelles island escapes.',1785997500000,1785997500000,1785997500000),
('dst_rwanda','rwanda','Rwanda','Rwanda','East Africa','Remarkable wildlife, green highlands and one of Africa’s most compelling cities.','Combine Kigali with gorilla trekking, conservation-led lodges and Lake Kivu.','/maasai-mara.jpg','["Gorilla trekking","Kigali","Lake Kivu"]','June to September',0,'published','Rwanda journeys with TVSE','Gorilla trekking and Rwanda travel.',1785997500000,1785997500000,1785997500000),
('dst_victoria','victoria-falls','Victoria Falls','Zimbabwe & Zambia','Southern Africa','The smoke that thunders, with river adventures and beautiful lodge stays.','Experience both sides of the falls and add a Zambezi sunset or Botswana safari.','/cape-town.jpg','["Falls viewpoints","Zambezi cruise","Livingstone Island"]','February to May',0,'published','Victoria Falls with TVSE','Victoria Falls and Zambezi journeys.',1785997500000,1785997500000,1785997500000);
--> statement-breakpoint
INSERT INTO `packages` (`id`,`destination_id`,`slug`,`title`,`summary`,`description`,`duration_days`,`from_price_minor`,`currency`,`image_path`,`inclusions_json`,`exclusions_json`,`featured`,`status`,`seo_title`,`seo_description`,`published_at`,`created_at`,`updated_at`) VALUES
('pkg_zanzibar','dst_zanzibar','zanzibar-culture-and-coast','Zanzibar: culture & coast','Stone Town, spice-country stories and a private beach finish.','A balanced island week with handpicked stays, private transfers and room to slow down.',7,28500000,'KES','/hero-zanzibar.jpg','["Six nights accommodation","Breakfast daily","Private transfers","Stone Town and spice tour"]','["International flights","Travel insurance","Personal expenses"]',1,'published','Zanzibar culture and coast','A seven-day TVSE Zanzibar itinerary.',1785997500000,1785997500000,1785997500000),
('pkg_mara','dst_mara','maasai-mara-signature-safari','Maasai Mara signature safari','A seamless fly-in safari with expert guiding and beautiful camp life.','Four nights in a conservancy camp with twice-daily activities and scenic flights.',5,46500000,'KES','/maasai-mara.jpg','["Return flights from Nairobi","Four nights full board","Game drives","Conservancy fees"]','["Premium drinks","Gratuities","Insurance"]',1,'published','Maasai Mara signature safari','A five-day fly-in Mara safari.',1785997500000,1785997500000,1785997500000),
('pkg_cape','dst_cape','cape-town-and-winelands','Cape Town & the Winelands','A stylish city-and-country escape with food, coast and mountain views.','Six nights split between central Cape Town and Franschhoek with private touring.',7,240000,'USD','/cape-town.jpg','["Six nights accommodation","Airport transfers","Cape Peninsula tour","Winelands experience"]','["International flights","Most meals","Visa costs"]',1,'published','Cape Town and Winelands','Seven days across Cape Town and Franschhoek.',1785997500000,1785997500000,1785997500000),
('pkg_santorini','dst_santorini','santorini-slow-island','Santorini, slowly','Five nights of caldera views, sailing and island flavors.','A romantic, design-led Santorini stay with a catamaran cruise and food experience.',6,310000,'USD','/santorini.jpg','["Five nights accommodation","Private transfers","Sunset cruise","Food and wine tour"]','["Flights","Travel insurance","City tax"]',0,'published','Santorini slowly','A six-day Santorini escape.',1785997500000,1785997500000,1785997500000),
('pkg_bali','dst_bali','bali-wellness-and-discovery','Bali wellness & discovery','Ubud rituals, tropical design and a relaxed coastal finale.','Ten days across Ubud and the coast with private transport and cultural experiences.',10,295000,'USD','/bali.jpg','["Nine nights accommodation","Private transfers","Temple day","Wellness experience"]','["Flights","Visa","Most meals"]',0,'published','Bali wellness and discovery','A ten-day TVSE Bali journey.',1785997500000,1785997500000,1785997500000),
('pkg_family','dst_amboseli','kenya-family-adventure','Kenya family adventure','Wildlife, hands-on discovery and a gentle coast finish for all ages.','A family-paced circuit through Nairobi, Amboseli and Diani.',10,78000000,'KES','/maasai-mara.jpg','["Nine nights accommodation","Private safari vehicle","Domestic transport","Selected meals"]','["International flights","Insurance","Personal expenses"]',0,'published','Kenya family adventure','A ten-day safari and beach family trip.',1785997500000,1785997500000,1785997500000),
('pkg_rwanda','dst_rwanda','rwanda-gorillas-and-kivu','Rwanda: gorillas & Kivu','A conservation-led journey from Kigali to the Virungas and lake country.','Seven nights with private touring, gorilla trekking and a Lake Kivu finish.',8,520000,'USD','/maasai-mara.jpg','["Seven nights accommodation","Private vehicle and guide","Gorilla permit","Selected meals"]','["Flights","Tips","Insurance"]',0,'published','Rwanda gorillas and Kivu','An eight-day conservation-led Rwanda journey.',1785997500000,1785997500000,1785997500000),
('pkg_seychelles','dst_seychelles','seychelles-island-hideaway','Seychelles island hideaway','A deeply restful Indian Ocean week with every transfer handled.','Seven nights at a handpicked resort with an optional island-hopping extension.',8,410000,'USD','/hero-zanzibar.jpg','["Seven nights accommodation","Breakfast daily","Airport and ferry transfers","Island experience"]','["International flights","Insurance","Resort extras"]',0,'published','Seychelles island hideaway','An eight-day Seychelles escape.',1785997500000,1785997500000,1785997500000);
--> statement-breakpoint
INSERT INTO `content_entries` (`id`,`type`,`slug`,`title`,`excerpt`,`body`,`image_path`,`status`,`published_at`,`created_at`,`updated_at`) VALUES
('cnt_policy','guide','build-a-travel-policy','Build a travel policy people will actually use','Practical guardrails that help travelers and finance teams.','Start with the journeys people actually take, make the preferred choice the easiest choice and explain the reason behind each rule.','/bali.jpg','published',1785997500000,1785997500000,1785997500000),
('cnt_mara','guide','when-to-book-maasai-mara','When to book the Maasai Mara','A month-by-month view of wildlife, weather and camp atmosphere.','Your best time depends on more than the migration. TVSE matches season, conservancy and camp style to the experience you want.','/maasai-mara.jpg','published',1785997500000,1785997500000,1785997500000),
('cnt_zanzibar','article','zanzibar-beyond-the-beach','Zanzibar beyond the beach','Culture, food and island history worth adding to your stay.','Stone Town, spice farms and dhow traditions add texture to an Indian Ocean escape.','/hero-zanzibar.jpg','published',1785997500000,1785997500000,1785997500000);
--> statement-breakpoint
PRAGMA optimize;
