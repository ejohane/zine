-- Created: 2026-05-04
-- Add profile image provenance for private per-user people records

ALTER TABLE `user_people` ADD COLUMN `profile_image_url` text;
ALTER TABLE `user_people` ADD COLUMN `profile_image_source` text;
ALTER TABLE `user_people` ADD COLUMN `profile_image_source_url` text;
ALTER TABLE `user_people` ADD COLUMN `x_handle` text;
