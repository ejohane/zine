CREATE TABLE service_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  occurred_at TEXT NOT NULL
);
CREATE INDEX service_events_owner ON service_events(owner_id,sequence);
CREATE INDEX service_events_retention ON service_events(occurred_at);
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_envelope TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_sequence INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX webhooks_owner ON webhooks(owner_id,id);
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_sequence INTEGER NOT NULL REFERENCES service_events(sequence) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  http_status INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(webhook_id,event_sequence)
);
CREATE INDEX webhook_deliveries_due ON webhook_deliveries(status,available_at,lease_until);
CREATE TABLE webhook_guards (
  id TEXT PRIMARY KEY,
  within_limit INTEGER NOT NULL CHECK(within_limit=1)
);
CREATE TRIGGER event_item_created AFTER INSERT ON personal_items BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'item.created',new.id,json_object('status',new.status,'revision',new.revision),new.updated_at);
END;
CREATE TRIGGER event_item_updated AFTER UPDATE ON personal_items WHEN new.status!=old.status OR new.archived!=old.archived OR new.revision!=old.revision OR new.generation!=old.generation BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'item.updated',new.id,json_object('status',new.status,'revision',new.revision,'archived',new.archived),new.updated_at);
END;
CREATE TRIGGER event_context_created AFTER INSERT ON context_entries BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  SELECT 'evt_'||lower(hex(randomblob(16))),p.owner_id,'item.context_added',new.item_id,json_object('contextId',new.id),new.created_at FROM personal_items p WHERE p.id=new.item_id;
END;
CREATE TRIGGER event_contribution_created AFTER INSERT ON contributions WHEN new.owner_id IS NOT NULL BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'enrichment.contributed',new.content_id,json_object('contributionId',new.id,'field',new.field),new.created_at);
END;
CREATE TRIGGER event_job_updated AFTER UPDATE OF status ON jobs WHEN new.status!=old.status BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'job.status_changed',new.id,json_object('status',new.status,'kind',new.kind,'errorCode',new.last_error_code),new.updated_at);
END;
CREATE TRIGGER event_subscription_created AFTER INSERT ON subscriptions BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'subscription.created',new.id,json_object('status',new.status),new.created_at);
END;
CREATE TRIGGER event_subscription_updated AFTER UPDATE ON subscriptions WHEN new.status!=old.status OR new.last_success_at IS NOT old.last_success_at OR new.last_error_code IS NOT old.last_error_code OR new.auto_save!=old.auto_save OR new.filters_json!=old.filters_json BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'subscription.updated',new.id,json_object('status',new.status,'lastSuccessAt',new.last_success_at,'errorCode',new.last_error_code),new.updated_at);
END;
CREATE TRIGGER event_alert_created AFTER INSERT ON operational_alerts BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'ops.alert_changed',new.code,json_object('status',new.status),new.last_seen_at);
END;
CREATE TRIGGER event_alert_updated AFTER UPDATE OF status ON operational_alerts WHEN new.status!=old.status BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  VALUES('evt_'||lower(hex(randomblob(16))),new.owner_id,'ops.alert_changed',new.code,json_object('status',new.status),new.last_seen_at);
END;

CREATE TRIGGER event_progress_created AFTER INSERT ON progress BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  SELECT 'evt_'||lower(hex(randomblob(16))),p.owner_id,'item.progress_changed',new.item_id,'{}',new.updated_at FROM personal_items p WHERE p.id=new.item_id;
END;
CREATE TRIGGER event_progress_updated AFTER UPDATE ON progress BEGIN
  INSERT INTO service_events(id,owner_id,type,subject_id,data_json,occurred_at)
  SELECT 'evt_'||lower(hex(randomblob(16))),p.owner_id,'item.progress_changed',new.item_id,'{}',new.updated_at FROM personal_items p WHERE p.id=new.item_id;
END;
