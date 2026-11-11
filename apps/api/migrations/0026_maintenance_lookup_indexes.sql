-- Correlated scheduler checks need a lookup by item, even without an owner filter.
CREATE INDEX jobs_active_by_item_kind
  ON jobs(item_id, kind, status)
  WHERE status IN ('pending','running');

-- Subscription snapshots remain live until all referencing jobs finish using them.
CREATE INDEX jobs_unapplied_feed_artifact
  ON jobs(json_extract(payload_json,'$.feedEntryArtifactKey'))
  WHERE status IN ('pending','running','failed')
    AND COALESCE(json_extract(payload_json,'$.feedMetadataApplied'),0)=0
    AND json_extract(payload_json,'$.feedEntryArtifactKey') IS NOT NULL;

-- Material maintenance checks liveness by object key, independently of content.
CREATE INDEX contributions_by_artifact_key
  ON contributions(artifact_key)
  WHERE artifact_key IS NOT NULL;
