-- Transactional change capture for v1 writes. These triggers are additive and
-- keep the existing tables authoritative while shard backfill/shadow reads run.
CREATE TRIGGER trg_leads_scale_insert AFTER INSERT ON leads BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),CASE WHEN NEW.user_id IS NOT NULL THEN 'user:'||NEW.user_id ELSE 'anonymous-email:'||lower(NEW.email) END,'leads',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_leads_scale_update AFTER UPDATE ON leads BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),CASE WHEN NEW.user_id IS NOT NULL THEN 'user:'||NEW.user_id ELSE 'anonymous-email:'||lower(NEW.email) END,'leads',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_requests_scale_insert AFTER INSERT ON trip_requests BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),CASE WHEN NEW.organization_id IS NOT NULL THEN 'org:'||NEW.organization_id WHEN NEW.user_id IS NOT NULL THEN 'user:'||NEW.user_id ELSE 'anonymous-email:'||lower(NEW.contact_email) END,'trip_requests',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_requests_scale_update AFTER UPDATE ON trip_requests BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),CASE WHEN NEW.organization_id IS NOT NULL THEN 'org:'||NEW.organization_id WHEN NEW.user_id IS NOT NULL THEN 'user:'||NEW.user_id ELSE 'anonymous-email:'||lower(NEW.contact_email) END,'trip_requests',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_quotes_scale_insert AFTER INSERT ON quotes BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT CASE WHEN organization_id IS NOT NULL THEN 'org:'||organization_id WHEN user_id IS NOT NULL THEN 'user:'||user_id ELSE 'anonymous-email:'||lower(contact_email) END FROM trip_requests WHERE id=NEW.trip_request_id)),'quotes',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_quotes_scale_update AFTER UPDATE ON quotes BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT CASE WHEN organization_id IS NOT NULL THEN 'org:'||organization_id WHEN user_id IS NOT NULL THEN 'user:'||user_id ELSE 'anonymous-email:'||lower(contact_email) END FROM trip_requests WHERE id=NEW.trip_request_id)),'quotes',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_bookings_scale_insert AFTER INSERT ON bookings BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='trip_requests' AND entity_id=NEW.trip_request_id ORDER BY row_version DESC LIMIT 1)),'bookings',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_bookings_scale_update AFTER UPDATE ON bookings BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='trip_requests' AND entity_id=NEW.trip_request_id ORDER BY row_version DESC LIMIT 1)),'bookings',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_assignments_scale_insert AFTER INSERT ON service_assignments BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'service_assignments',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_assignments_scale_update AFTER UPDATE ON service_assignments BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'service_assignments',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_invoices_scale_insert AFTER INSERT ON invoices BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1)),'invoices',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_invoices_scale_update AFTER UPDATE ON invoices BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1)),'invoices',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_payments_scale_insert AFTER INSERT ON payments BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'payments',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at FROM core_change_events WHERE entity_type='invoices' AND entity_id=NEW.invoice_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_support_scale_insert AFTER INSERT ON support_tickets BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1)),'support_tickets',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_support_scale_update AFTER UPDATE ON support_tickets BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES ('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.user_id,(SELECT tenant_key FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1)),'support_tickets',NEW.id,'upsert',NEW.updated_at,'{}','pending',0,NEW.updated_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_messages_scale_insert AFTER INSERT ON messages BEGIN
  INSERT OR IGNORE INTO core_change_events (id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'messages',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at FROM core_change_events WHERE entity_type='support_tickets' AND entity_id=NEW.ticket_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
WITH RECURSIVE search_source(entity_type, entity_id, rest) AS (
  SELECT 'destination', id, lower(replace(replace(replace(name||' '||country||' '||region||' '||summary, ',', ' '), '.', ' '), '-', ' '))||' ' FROM destinations
  UNION ALL SELECT 'package', id, lower(replace(replace(replace(title||' '||summary, ',', ' '), '.', ' '), '-', ' '))||' ' FROM packages
  UNION ALL SELECT 'content', id, lower(replace(replace(replace(title||' '||excerpt, ',', ' '), '.', ' '), '-', ' '))||' ' FROM content_entries
), tokens(entity_type, entity_id, term, rest) AS (
  SELECT entity_type, entity_id, substr(rest, 1, instr(rest, ' ') - 1), ltrim(substr(rest, instr(rest, ' ') + 1)) FROM search_source
  UNION ALL
  SELECT entity_type, entity_id, substr(rest, 1, instr(rest, ' ') - 1), ltrim(substr(rest, instr(rest, ' ') + 1)) FROM tokens WHERE rest <> ''
)
INSERT OR IGNORE INTO content_search_terms (id, entity_type, entity_id, term, weight, updated_at)
SELECT entity_type||':'||entity_id||':'||term, entity_type, entity_id, term, CASE WHEN length(term) >= 5 THEN 2 ELSE 1 END, unixepoch()*1000
FROM tokens WHERE length(term) >= 2;
--> statement-breakpoint
CREATE TRIGGER trg_travelers_scale_insert AFTER INSERT ON trip_request_travelers BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'trip_request_travelers',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at FROM core_change_events WHERE entity_type='trip_requests' AND entity_id=NEW.trip_request_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_approvals_scale_insert AFTER INSERT ON approvals BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'approvals',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at FROM core_change_events WHERE entity_id=NEW.entity_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_quote_versions_scale_insert AFTER INSERT ON quote_versions BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'quote_versions',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at FROM core_change_events WHERE entity_type='quotes' AND entity_id=NEW.quote_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_quote_items_scale_insert AFTER INSERT ON quote_items BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),e.tenant_key,'quote_items',NEW.id,'upsert',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'{}','pending',0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) FROM quote_versions v JOIN core_change_events e ON e.entity_type='quotes' AND e.entity_id=v.quote_id WHERE v.id=NEW.quote_version_id ORDER BY e.row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_itinerary_scale_insert AFTER INSERT ON itinerary_days BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'itinerary_days',NEW.id,'upsert',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'{}','pending',0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_segments_scale_insert AFTER INSERT ON booking_segments BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'booking_segments',NEW.id,'upsert',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'{}','pending',0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) FROM core_change_events WHERE entity_type='bookings' AND entity_id=NEW.booking_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_invoice_items_scale_insert AFTER INSERT ON invoice_items BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),tenant_key,'invoice_items',NEW.id,'upsert',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'{}','pending',0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER) FROM core_change_events WHERE entity_type='invoices' AND entity_id=NEW.invoice_id ORDER BY row_version DESC LIMIT 1;
END;
--> statement-breakpoint
CREATE TRIGGER trg_media_scale_insert AFTER INSERT ON media_assets BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  SELECT 'chg_'||lower(hex(randomblob(16))),COALESCE('user:'||NEW.owner_user_id,(SELECT tenant_key FROM core_change_events WHERE entity_id=NEW.entity_id ORDER BY row_version DESC LIMIT 1)),'media_assets',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at;
END;
--> statement-breakpoint
CREATE TRIGGER trg_notifications_scale_insert AFTER INSERT ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES('chg_'||lower(hex(randomblob(16))),'user:'||NEW.user_id,'notifications',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_notifications_scale_update AFTER UPDATE ON notifications WHEN NEW.user_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES('chg_'||lower(hex(randomblob(16))),'user:'||NEW.user_id,'notifications',NEW.id,'upsert',CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),'{}','pending',0,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),CAST((julianday('now')-2440587.5)*86400000 AS INTEGER));
END;
--> statement-breakpoint
CREATE TRIGGER trg_activity_scale_insert AFTER INSERT ON activity_logs WHEN NEW.actor_id IS NOT NULL OR NEW.organization_id IS NOT NULL BEGIN
  INSERT OR IGNORE INTO core_change_events(id,tenant_key,entity_type,entity_id,operation,row_version,payload_json,status,attempts,available_at,created_at)
  VALUES('chg_'||lower(hex(randomblob(16))),COALESCE('org:'||NEW.organization_id,'user:'||NEW.actor_id),'activity_logs',NEW.id,'upsert',NEW.created_at,'{}','pending',0,NEW.created_at,NEW.created_at);
END;
