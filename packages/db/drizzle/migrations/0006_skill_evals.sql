-- skill_test_cases
CREATE TABLE IF NOT EXISTS `skill_test_cases` (
  `id` text PRIMARY KEY NOT NULL,
  `skill_id` text NOT NULL REFERENCES `skills`(`id`),
  `description` text NOT NULL DEFAULT '',
  `input_vars` text NOT NULL DEFAULT '{}',
  `expected_output` text NOT NULL,
  `created_at` integer NOT NULL
);

-- skill_eval_runs
CREATE TABLE IF NOT EXISTS `skill_eval_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `skill_id` text NOT NULL REFERENCES `skills`(`id`),
  `test_case_id` text NOT NULL REFERENCES `skill_test_cases`(`id`),
  `skill_version` text NOT NULL,
  `rendered` text NOT NULL,
  `passed` integer NOT NULL,
  `score` real,
  `ran_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `eval_runs_skill_idx` ON `skill_eval_runs`(`skill_id`);
CREATE INDEX IF NOT EXISTS `test_cases_skill_idx` ON `skill_test_cases`(`skill_id`);
