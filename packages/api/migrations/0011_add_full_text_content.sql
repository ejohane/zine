-- Add full_text_content and full_text_extracted_at columns to content table
ALTER TABLE content ADD COLUMN full_text_content text;
ALTER TABLE content ADD COLUMN full_text_extracted_at integer;
