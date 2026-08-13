DELETE FROM `memberships`
WHERE `user_id` IN (
  SELECT `id` FROM `users`
  WHERE `kind` IN ('staff','traveler')
     OR `role` IN ('owner','admin','agent','finance','content','traveler')
);--> statement-breakpoint
DELETE FROM `memberships`
WHERE NOT EXISTS (
  SELECT 1 FROM `users` u JOIN `organizations` o ON o.`id` = `memberships`.`organization_id`
  WHERE u.`id` = `memberships`.`user_id`
    AND (
      (u.`role` = 'corporate_requester' AND o.`type` = 'corporate' AND `memberships`.`role` IN ('requester','traveler'))
      OR (u.`role` = 'corporate_approver' AND o.`type` = 'corporate' AND `memberships`.`role` = 'approver')
      OR (u.`role` = 'partner' AND o.`type` = 'partner' AND `memberships`.`role` IN ('partner_admin','partner_user'))
    )
);--> statement-breakpoint
DELETE FROM `memberships`
WHERE EXISTS (
  SELECT 1 FROM `memberships` newer
  WHERE newer.`user_id` = `memberships`.`user_id`
    AND (newer.`created_at` > `memberships`.`created_at` OR (newer.`created_at` = `memberships`.`created_at` AND newer.`id` > `memberships`.`id`))
);--> statement-breakpoint
UPDATE `organizations` SET `approver_user_id` = NULL, `updated_at` = unixepoch() * 1000
WHERE `approver_user_id` IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM `memberships` m JOIN `users` u ON u.`id` = m.`user_id`
  WHERE u.`id` = `organizations`.`approver_user_id` AND m.`organization_id` = `organizations`.`id`
    AND u.`role` = 'corporate_approver' AND m.`role` = 'approver'
);--> statement-breakpoint
DELETE FROM `sessions` WHERE `user_id` IN (SELECT `id` FROM `users` WHERE `role` IN ('corporate_requester','corporate_approver','partner'));--> statement-breakpoint
UPDATE `users` SET `auth_version` = `auth_version` + 1, `updated_at` = unixepoch() * 1000
WHERE `role` IN ('corporate_requester','corporate_approver','partner');--> statement-breakpoint
UPDATE `users` SET `status` = 'suspended', `updated_at` = unixepoch() * 1000
WHERE `role` IN ('corporate_requester','corporate_approver','partner')
  AND NOT EXISTS (SELECT 1 FROM `memberships` m WHERE m.`user_id` = `users`.`id`);--> statement-breakpoint
DROP INDEX `idx_memberships_user`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_memberships_user` ON `memberships` (`user_id`);
--> statement-breakpoint
PRAGMA optimize;
