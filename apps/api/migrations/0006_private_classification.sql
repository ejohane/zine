ALTER TABLE personal_items ADD COLUMN content_type TEXT;
UPDATE personal_items SET content_type=(SELECT kind FROM content_items WHERE id=personal_items.content_id);
-- A feed is an ingestion route, not a globally observable property of a URL.
UPDATE content_items SET platform='web' WHERE platform='rss';
UPDATE content_items SET kind='article' WHERE platform='web' AND identity_key LIKE 'url:%';
