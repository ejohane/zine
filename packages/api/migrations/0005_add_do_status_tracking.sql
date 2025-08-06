-- Add Durable Object status tracking and metrics tables

-- Table to track DO health and status
CREATE TABLE durable_object_status (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  durableObjectId TEXT NOT NULL,
  status TEXT NOT NULL, -- healthy, unhealthy, inactive
  lastPollTime INTEGER,
  lastPollSuccess INTEGER DEFAULT 1, -- boolean
  lastPollError TEXT,
  totalPollCount INTEGER DEFAULT 0,
  successfulPollCount INTEGER DEFAULT 0,
  failedPollCount INTEGER DEFAULT 0,
  totalNewItems INTEGER DEFAULT 0,
  lastHealthCheckTime INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Table to track DO polling metrics
CREATE TABLE durable_object_metrics (
  id TEXT PRIMARY KEY,
  durableObjectId TEXT NOT NULL,
  pollTimestamp INTEGER NOT NULL,
  provider TEXT NOT NULL, -- spotify, youtube
  subscriptionCount INTEGER NOT NULL,
  newItemsFound INTEGER NOT NULL,
  pollDurationMs INTEGER NOT NULL,
  errors TEXT, -- JSON array of errors
  createdAt INTEGER NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_do_status_userId ON durable_object_status(userId);
CREATE INDEX idx_do_status_durableObjectId ON durable_object_status(durableObjectId);
CREATE INDEX idx_do_metrics_durableObjectId ON durable_object_metrics(durableObjectId);
CREATE INDEX idx_do_metrics_pollTimestamp ON durable_object_metrics(pollTimestamp);

-- Add lastPollTime column to subscriptions table
ALTER TABLE subscriptions ADD COLUMN lastPollTime INTEGER;