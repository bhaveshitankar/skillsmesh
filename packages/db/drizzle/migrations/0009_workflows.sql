CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`author_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'orchestrator' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` text DEFAULT '1.0.0' NOT NULL,
	`definition` text DEFAULT '{"nodes":[],"edges":[]}' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`published_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflows_org_idx` ON `workflows` (`org_id`);
--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`version` text NOT NULL,
	`definition` text NOT NULL,
	`changelog` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`org_id` text NOT NULL,
	`triggered_by` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`input_vars` text DEFAULT '{}' NOT NULL,
	`output` text,
	`steps` text DEFAULT '[]' NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `orgs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `workflow_runs_workflow_idx` ON `workflow_runs` (`workflow_id`);
--> statement-breakpoint
CREATE INDEX `workflow_runs_org_idx` ON `workflow_runs` (`org_id`);
--> statement-breakpoint
ALTER TABLE `skills` ADD `mcp_tools` text DEFAULT '[]' NOT NULL;
