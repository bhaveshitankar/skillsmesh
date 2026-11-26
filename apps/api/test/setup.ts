import { env } from 'cloudflare:test'

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS \`orgs\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL UNIQUE,
  \`plan\` text DEFAULT 'free' NOT NULL,
  \`settings\` text NOT NULL,
  \`created_at\` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`email\` text NOT NULL UNIQUE,
  \`name\` text NOT NULL,
  \`org_id\` text NOT NULL,
  \`role\` text DEFAULT 'member' NOT NULL,
  \`api_key\` text NOT NULL UNIQUE,
  \`github_id\` text UNIQUE,
  \`last_active_at\` integer NOT NULL,
  FOREIGN KEY (\`org_id\`) REFERENCES \`orgs\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`skills\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`org_id\` text NOT NULL,
  \`author_id\` text NOT NULL,
  \`name\` text NOT NULL,
  \`slug\` text NOT NULL,
  \`version\` text DEFAULT '1.0.0' NOT NULL,
  \`description\` text NOT NULL,
  \`prompt_template\` text NOT NULL,
  \`tools_required\` text DEFAULT '[]' NOT NULL,
  \`triggers\` text DEFAULT '[]' NOT NULL,
  \`tags\` text DEFAULT '[]' NOT NULL,
  \`visibility\` text DEFAULT 'private' NOT NULL,
  \`status\` text DEFAULT 'draft' NOT NULL,
  \`token_estimate\` integer DEFAULT 0 NOT NULL,
  \`avg_token_savings\` real DEFAULT 0 NOT NULL,
  \`use_count\` integer DEFAULT 0 NOT NULL,
  \`created_at\` integer NOT NULL,
  \`published_at\` integer,
  \`deprecated_at\` integer,
  FOREIGN KEY (\`org_id\`) REFERENCES \`orgs\`(\`id\`),
  FOREIGN KEY (\`author_id\`) REFERENCES \`users\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`skill_versions\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`skill_id\` text NOT NULL,
  \`version\` text NOT NULL,
  \`prompt_template\` text NOT NULL,
  \`changelog\` text DEFAULT '' NOT NULL,
  \`created_at\` integer NOT NULL,
  FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`approvals\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`skill_id\` text NOT NULL,
  \`reviewer_id\` text NOT NULL,
  \`verdict\` text NOT NULL,
  \`comment\` text DEFAULT '' NOT NULL,
  \`created_at\` integer NOT NULL,
  FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`),
  FOREIGN KEY (\`reviewer_id\`) REFERENCES \`users\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`ci_checks\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`skill_id\` text NOT NULL,
  \`check_type\` text NOT NULL,
  \`status\` text NOT NULL,
  \`output\` text NOT NULL,
  \`ran_at\` integer NOT NULL,
  FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`usage_events\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`skill_id\` text,
  \`user_id\` text NOT NULL,
  \`org_id\` text NOT NULL,
  \`matched_at\` integer NOT NULL,
  \`query_text\` text NOT NULL,
  \`match_score\` real,
  \`tokens_used\` integer,
  \`tokens_saved\` integer,
  \`outcome\` text NOT NULL,
  FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`),
  FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`),
  FOREIGN KEY (\`org_id\`) REFERENCES \`orgs\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`org_shares\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`from_org_id\` text NOT NULL,
  \`to_org_id\` text NOT NULL,
  \`skill_id\` text NOT NULL,
  \`granted_at\` integer NOT NULL,
  FOREIGN KEY (\`from_org_id\`) REFERENCES \`orgs\`(\`id\`),
  FOREIGN KEY (\`to_org_id\`) REFERENCES \`orgs\`(\`id\`),
  FOREIGN KEY (\`skill_id\`) REFERENCES \`skills\`(\`id\`)
);
`

export async function applyMigrations() {
  const statements = MIGRATION_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  for (const stmt of statements) {
    await env.DB.prepare(stmt).run()
  }
}
