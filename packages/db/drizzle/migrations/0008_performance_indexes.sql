-- Performance indexes for heavily-queried columns
CREATE INDEX IF NOT EXISTS skills_org_status_idx ON skills(org_id, status);
CREATE INDEX IF NOT EXISTS skills_visibility_status_idx ON skills(visibility, status);
CREATE INDEX IF NOT EXISTS usage_events_org_idx ON usage_events(org_id);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS invites_token_idx ON invites(token);
CREATE INDEX IF NOT EXISTS org_shares_to_org_idx ON org_shares(to_org_id);
CREATE INDEX IF NOT EXISTS skill_eval_runs_skill_ran_idx ON skill_eval_runs(skill_id, ran_at);
