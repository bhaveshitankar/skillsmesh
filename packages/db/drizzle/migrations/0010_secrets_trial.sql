ALTER TABLE orgs ADD COLUMN trial_ends_at INTEGER;

CREATE TABLE org_secrets (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT REFERENCES users(id),
  scope TEXT NOT NULL DEFAULT 'org',
  name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX org_secrets_org_name_idx ON org_secrets(org_id, name);
