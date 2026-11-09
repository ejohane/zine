-- Existing credentials retain their existing library/subscription capabilities.
-- Newly issued credentials use explicit scopes with a read-only default.
ALTER TABLE api_tokens ADD COLUMN scopes_json TEXT NOT NULL DEFAULT '["library:read","library:write","subscriptions:read","subscriptions:write"]' CHECK(json_valid(scopes_json) AND json_type(scopes_json)='array');
