-- Premium: file/image/script assets attached to a skill
CREATE TABLE `skill_assets` (
  `id` text PRIMARY KEY NOT NULL,
  `skill_id` text NOT NULL REFERENCES `skills`(`id`),
  `org_id` text NOT NULL REFERENCES `orgs`(`id`),
  `file_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `r2_key` text NOT NULL,
  `asset_type` text NOT NULL,
  `chunk_count` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL
);

CREATE INDEX `skill_assets_skill_id_idx` ON `skill_assets` (`skill_id`);
CREATE INDEX `skill_assets_org_id_idx` ON `skill_assets` (`org_id`);

-- RAG chunks extracted from assets for vector search
CREATE TABLE `skill_chunks` (
  `id` text PRIMARY KEY NOT NULL,
  `skill_id` text NOT NULL REFERENCES `skills`(`id`),
  `asset_id` text NOT NULL REFERENCES `skill_assets`(`id`),
  `org_id` text NOT NULL REFERENCES `orgs`(`id`),
  `content` text NOT NULL,
  `chunk_index` integer NOT NULL,
  `vector_id` text,
  `created_at` integer NOT NULL
);

CREATE INDEX `skill_chunks_skill_id_idx` ON `skill_chunks` (`skill_id`);
CREATE INDEX `skill_chunks_asset_id_idx` ON `skill_chunks` (`asset_id`);
