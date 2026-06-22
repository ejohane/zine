CREATE TABLE IF NOT EXISTS `api_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `token_hash` text NOT NULL,
  `token_prefix` text NOT NULL,
  `scopes_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `last_used_at` integer,
  `expires_at` integer,
  `revoked_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX IF NOT EXISTS `api_tokens_token_hash_idx` ON `api_tokens` (`token_hash`);
CREATE INDEX IF NOT EXISTS `api_tokens_user_created_idx` ON `api_tokens` (`user_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `api_tokens_user_revoked_idx` ON `api_tokens` (`user_id`, `revoked_at`);
