ALTER TABLE subscriptions ADD COLUMN feed_etag TEXT;
ALTER TABLE subscriptions ADD COLUMN feed_last_modified TEXT;
UPDATE contributions SET provenance_json=json_patch(provenance_json,json_extract(provenance_json,'$.description')) WHERE json_extract(provenance_json,'$.method')='zine-understanding-v1' AND json_valid(json_extract(provenance_json,'$.description'));
