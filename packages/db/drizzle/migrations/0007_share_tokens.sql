ALTER TABLE skills ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS skills_share_token_idx ON skills(share_token) WHERE share_token IS NOT NULL;
