CREATE TABLE `family_hub_state` (
	`id` int NOT NULL,
	`payload` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `family_hub_state_id` PRIMARY KEY(`id`)
);
