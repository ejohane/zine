-- Bind enrichment to the source document that was actually read and retain
-- evidence-bearing article understanding separately from display summaries.

ALTER TABLE `item_enrichments` ADD COLUMN `source_coverage` text;
ALTER TABLE `item_enrichments` ADD COLUMN `source_kind` text;
ALTER TABLE `item_enrichments` ADD COLUMN `source_content_hash` text;
ALTER TABLE `item_enrichments` ADD COLUMN `source_word_count` integer;
ALTER TABLE `item_enrichments` ADD COLUMN `source_quality_score` real;
ALTER TABLE `item_enrichments` ADD COLUMN `source_quality_warnings_json` text;
ALTER TABLE `item_enrichments` ADD COLUMN `understanding_json` text;

CREATE INDEX IF NOT EXISTS `item_enrichments_source_hash_idx`
  ON `item_enrichments` (`item_id`, `source_content_hash`, `updated_at` DESC);
