import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const familyGroups = mysqlTable("family_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  inviteCode: varchar("inviteCode", { length: 12 }).notNull().unique(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const familyMemberships = mysqlTable("family_memberships", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  displayName: varchar("displayName", { length: 80 }).notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("member").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  groupUserUnique: uniqueIndex("family_memberships_group_user_unique").on(table.groupId, table.userOpenId),
}));

export const familyHubState = mysqlTable("family_hub_state", {
  // `id` is the selected family group id; legacy row 1 remains compatible.
  id: int("id").primaryKey().notNull(),
  payload: text("payload").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userOpenId: varchar("userOpenId", { length: 64 }).notNull(),
  endpoint: varchar("endpoint", { length: 512 }).notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
}));

export const pushKeys = mysqlTable("push_keys", {
  id: int("id").primaryKey().notNull(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type FamilyGroup = typeof familyGroups.$inferSelect;
export type FamilyMembership = typeof familyMemberships.$inferSelect;
export type FamilyHubState = typeof familyHubState.$inferSelect;
export type InsertFamilyHubState = typeof familyHubState.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;
export type PushKeys = typeof pushKeys.$inferSelect;
