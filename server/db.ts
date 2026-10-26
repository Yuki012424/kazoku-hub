import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { familyGroups, familyHubState, familyMemberships, InsertFamilyHubState, InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { randomBytes } from "node:crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];
  const assignNullable = (field: TextField) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  };
  textFields.forEach(assignNullable);
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = 'admin';
    updateSet.role = 'admin';
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

function makeInviteCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

async function getMembersForGroup(groupId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    openId: familyMemberships.userOpenId,
    displayName: familyMemberships.displayName,
    role: familyMemberships.role,
  }).from(familyMemberships).where(eq(familyMemberships.groupId, groupId));
}

export async function getFamilyMemberships(openId: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    groupId: familyGroups.id,
    groupName: familyGroups.name,
    inviteCode: familyGroups.inviteCode,
    role: familyMemberships.role,
  }).from(familyMemberships)
    .innerJoin(familyGroups, eq(familyMemberships.groupId, familyGroups.id))
    .where(eq(familyMemberships.userOpenId, openId));

  return Promise.all(rows.map(async row => ({
    ...row,
    members: await getMembersForGroup(row.groupId),
  })));
}

export async function isFamilyMember(groupId: number, openId: string) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: familyMemberships.id })
    .from(familyMemberships)
    .where(and(eq(familyMemberships.groupId, groupId), eq(familyMemberships.userOpenId, openId)))
    .limit(1);
  return result.length > 0;
}

export async function createFamilyGroup(name: string, ownerOpenId: string, displayName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const inviteCode = makeInviteCode();
  const inserted = await db.insert(familyGroups).values({
    name,
    inviteCode,
    ownerOpenId,
  }).$returningId();
  const groupId = inserted[0]?.id;
  if (!groupId) throw new Error("Failed to create family group");
  await db.insert(familyMemberships).values({
    groupId,
    userOpenId: ownerOpenId,
    displayName,
    role: "owner",
  });
  return { groupId, groupName: name, inviteCode };
}

export async function joinFamilyGroup(inviteCode: string, userOpenId: string, displayName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const groups = await db.select().from(familyGroups).where(eq(familyGroups.inviteCode, inviteCode)).limit(1);
  const group = groups[0];
  if (!group) throw new Error("招待コードが見つかりません");
  const existing = await db.select({ id: familyMemberships.id })
    .from(familyMemberships)
    .where(and(eq(familyMemberships.groupId, group.id), eq(familyMemberships.userOpenId, userOpenId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(familyMemberships).values({
      groupId: group.id,
      userOpenId,
      displayName,
      role: "member",
    });
  }
  return { groupId: group.id, groupName: group.name, inviteCode: group.inviteCode };
}

export async function updateFamilyMemberName(groupId: number, openId: string, displayName: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(familyMemberships)
    .set({ displayName })
    .where(and(eq(familyMemberships.groupId, groupId), eq(familyMemberships.userOpenId, openId)));
}

export async function getFamilyHubState(groupId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(familyHubState).where(eq(familyHubState.id, groupId)).limit(1);
  return result[0]?.payload ?? null;
}

export async function saveFamilyHubState(groupId: number, payload: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertFamilyHubState = { id: groupId, payload, updatedAt: new Date() };
  await db.insert(familyHubState).values(values).onDuplicateKeyUpdate({
    set: { payload, updatedAt: new Date() },
  });
}
