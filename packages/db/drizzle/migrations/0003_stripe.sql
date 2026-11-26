ALTER TABLE `orgs` ADD COLUMN `stripe_customer_id` text;
ALTER TABLE `orgs` ADD COLUMN `stripe_subscription_id` text;
CREATE INDEX `orgs_stripe_customer_id_idx` ON `orgs` (`stripe_customer_id`);
