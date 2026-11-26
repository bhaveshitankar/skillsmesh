CREATE TABLE chat_endpoints (id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id), workflow_id TEXT, name TEXT NOT NULL, token TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE INDEX chat_endpoints_org_idx ON chat_endpoints(org_id);
CREATE INDEX chat_endpoints_token_idx ON chat_endpoints(token);
