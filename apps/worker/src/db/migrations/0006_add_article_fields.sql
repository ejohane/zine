-- Add article-specific metadata fields to items table

ALTER TABLE items ADD COLUMN word_count INTEGER;
ALTER TABLE items ADD COLUMN reading_time_minutes INTEGER;
ALTER TABLE items ADD COLUMN article_content_key TEXT;
