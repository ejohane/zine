ALTER TABLE x_posts ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS x_post_links (
  user_id TEXT NOT NULL,
  source_tweet_id TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  url TEXT NOT NULL,
  display_url TEXT,
  redirect_url TEXT,
  source TEXT NOT NULL,
  card_json TEXT,
  PRIMARY KEY (user_id, source_tweet_id, normalized_url),
  FOREIGN KEY (user_id, source_tweet_id)
    REFERENCES x_posts(user_id, tweet_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS x_post_links_user_normalized_idx
  ON x_post_links(user_id, normalized_url, source_tweet_id);

CREATE INDEX IF NOT EXISTS x_post_links_user_source_idx
  ON x_post_links(user_id, source, source_tweet_id);
