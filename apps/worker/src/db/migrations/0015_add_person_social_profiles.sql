-- Created: 2026-05-19
-- Store inferred social profiles for private per-user people records

CREATE TABLE IF NOT EXISTS `person_social_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`),
  `user_person_id` text NOT NULL REFERENCES `user_people`(`id`),
  `provider` text NOT NULL,
  `provider_profile_id` text NOT NULL,
  `handle` text NOT NULL,
  `display_name` text NOT NULL,
  `avatar_url` text,
  `profile_url` text NOT NULL,
  `description` text,
  `verified` integer NOT NULL DEFAULT false,
  `confidence` real NOT NULL,
  `status` text NOT NULL,
  `evidence_json` text,
  `last_checked_at` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `person_social_profiles_person_provider_profile_idx`
  ON `person_social_profiles` (`user_person_id`, `provider`, `provider_profile_id`);

CREATE INDEX IF NOT EXISTS `person_social_profiles_person_status_idx`
  ON `person_social_profiles` (`user_person_id`, `provider`, `status`, `confidence`);

CREATE INDEX IF NOT EXISTS `person_social_profiles_provider_profile_idx`
  ON `person_social_profiles` (`provider`, `provider_profile_id`);
