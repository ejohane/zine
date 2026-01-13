-- Add creator_image_url column to items table
-- This stores the image URL of the creator/channel/podcast show
-- (as opposed to thumbnailUrl which is the episode/video image)
ALTER TABLE `items` ADD COLUMN `creator_image_url` text;
