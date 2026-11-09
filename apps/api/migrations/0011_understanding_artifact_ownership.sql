ALTER TABLE understanding_artifacts ADD COLUMN item_id TEXT;
UPDATE understanding_artifacts SET item_id=(SELECT item_id FROM understanding_runs WHERE state_key=understanding_artifacts.artifact_key);
CREATE INDEX understanding_artifact_item ON understanding_artifacts(owner_id,item_id);
