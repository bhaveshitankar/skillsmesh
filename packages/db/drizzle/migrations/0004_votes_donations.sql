CREATE TABLE IF NOT EXISTS skill_votes (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  voter_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('up','down')),
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_votes_voter ON skill_votes(skill_id, voter_id);

CREATE TABLE IF NOT EXISTS skill_donations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL REFERENCES skills(id),
  donor_email TEXT,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  creator_payout_cents INTEGER NOT NULL,
  stripe_session_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

ALTER TABLE skills ADD COLUMN upvotes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN downvotes INTEGER NOT NULL DEFAULT 0;
