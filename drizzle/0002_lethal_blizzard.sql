CREATE TABLE `family_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`inviteCode` varchar(12) NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_groups_inviteCode_unique` UNIQUE(`inviteCode`)
);
--> statement-breakpoint
CREATE TABLE `family_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`displayName` varchar(80) NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `family_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `family_memberships_group_user_unique` UNIQUE(`groupId`,`userOpenId`)
);
