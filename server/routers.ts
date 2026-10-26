import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getFamilyMemberships, getFamilyHubState, getGroupPushSubscriptions, getOrCreatePushKeys, isFamilyMember, joinFamilyGroup, createFamilyGroup, removePushSubscription, saveFamilyHubState, savePushSubscription, updateFamilyMemberName } from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import webpush from "web-push";

const groupIdInput = z.object({ groupId: z.number().int().positive() });
const displayNameInput = z.string().trim().min(1, "表示名を入力してください").max(40, "表示名は40文字以内で入力してください");
const pushSubscriptionInput = z.object({ groupId: z.number().int().positive(), endpoint: z.string().url().max(2048), p256dh: z.string().min(10).max(512), auth: z.string().min(5).max(512) });

async function requireMembership(groupId: number, openId: string) {
  if (!(await isFamilyMember(groupId, openId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "この家族グループのメンバーではありません" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function protectDinnerStatuses(groupId: number, nextState: Record<string, unknown>, openId: string) {
  const previousPayload = await getFamilyHubState(groupId);
  let previousState: unknown = null;
  try {
    previousState = previousPayload ? JSON.parse(previousPayload) as unknown : null;
  } catch {
    previousState = null;
  }
  const previousDinner = isRecord(previousState) && isRecord(previousState.dinner) ? previousState.dinner : null;
  const previousStatuses = previousDinner && isRecord(previousDinner.statuses) ? previousDinner.statuses : {};
  const nextDinner = isRecord(nextState.dinner) ? nextState.dinner : {};
  const nextStatuses = isRecord(nextDinner.statuses) ? { ...nextDinner.statuses } : {};

  for (const [memberKey, nextStatus] of Object.entries(nextStatuses)) {
    if (memberKey === openId) continue;
    const previousStatus = previousStatuses[memberKey];
    if (previousStatus === undefined && nextStatus !== "未回答") {
      throw new TRPCError({ code: "FORBIDDEN", message: "自分以外の家族の夕飯回答は変更できません" });
    }
    if (previousStatus !== undefined && nextStatus !== previousStatus) {
      throw new TRPCError({ code: "FORBIDDEN", message: "自分以外の家族の夕飯回答は変更できません" });
    }
  }
  for (const [memberKey, previousStatus] of Object.entries(previousStatuses)) {
    if (memberKey !== openId && nextStatuses[memberKey] === undefined) nextStatuses[memberKey] = previousStatus;
  }
  return { ...nextState, dinner: { ...nextDinner, statuses: nextStatuses } };
}

function parseState(payload: string | null) {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getUpdateNotice(previousPayload: string | null, nextState: Record<string, unknown>) {
  const previous = parseState(previousPayload);
  if (!previous) return null;
  const previousShopping = Array.isArray(previous.shopping) ? previous.shopping : [];
  const nextShopping = Array.isArray(nextState.shopping) ? nextState.shopping : [];
  const previousIds = new Set(previousShopping.map(item => isRecord(item) ? item.id : null));
  if (nextShopping.some(item => isRecord(item) && !previousIds.has(item.id))) {
    return { title: "買い物リストが更新されました", body: "家族が新しい項目を追加しました。" };
  }
  const previousMessage = typeof previous.message === "string" ? previous.message : "";
  const nextMessage = typeof nextState.message === "string" ? nextState.message : "";
  if (previousMessage !== nextMessage) return { title: "家族から伝言が届きました", body: nextMessage || "共有メッセージが更新されました。" };
  return { title: "家族ボードが更新されました", body: "共有スペースに新しい変更があります。" };
}

async function notifyFamily(groupId: number, excludeOpenId: string, notice: { title: string; body: string } | null) {
  if (!notice) return;
  const subscriptions = await getGroupPushSubscriptions(groupId, excludeOpenId);
  if (subscriptions.length === 0) return;
  const keys = await getOrCreatePushKeys();
  webpush.setVapidDetails("mailto:notifications@kazoku-hub.app", keys.publicKey, keys.privateKey);
  await Promise.allSettled(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ ...notice, url: "/" }));
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) await removePushSubscription(subscription.endpoint);
    }
  }));
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  family: router({
    list: protectedProcedure.query(({ ctx }) => getFamilyMemberships(ctx.user.openId)),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1, "家族名を入力してください").max(80), displayName: displayNameInput }))
      .mutation(({ ctx, input }) => createFamilyGroup(input.name, ctx.user.openId, input.displayName)),
    join: protectedProcedure
      .input(z.object({ inviteCode: z.string().trim().toUpperCase().min(4).max(12), displayName: displayNameInput }))
      .mutation(({ ctx, input }) => joinFamilyGroup(input.inviteCode, ctx.user.openId, input.displayName)),
    updateProfile: protectedProcedure
      .input(groupIdInput.extend({ displayName: displayNameInput }))
      .mutation(async ({ ctx, input }) => {
        await requireMembership(input.groupId, ctx.user.openId);
        await updateFamilyMemberName(input.groupId, ctx.user.openId, input.displayName);
        return { ok: true } as const;
      }),
  }),
  push: router({
    publicKey: protectedProcedure.query(async () => {
      const keys = await getOrCreatePushKeys();
      return keys.publicKey;
    }),
    subscribe: protectedProcedure
      .input(pushSubscriptionInput)
      .mutation(async ({ ctx, input }) => {
        await requireMembership(input.groupId, ctx.user.openId);
        await savePushSubscription(input.groupId, ctx.user.openId, { endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth });
        return { ok: true } as const;
      }),
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string().url().max(2048) }))
      .mutation(async ({ input }) => {
        await removePushSubscription(input.endpoint);
        return { ok: true } as const;
      }),
  }),
  hub: router({
    getState: protectedProcedure
      .input(groupIdInput)
      .query(async ({ ctx, input }) => {
        await requireMembership(input.groupId, ctx.user.openId);
        const payload = await getFamilyHubState(input.groupId);
        if (!payload) return null;
        try {
          return JSON.parse(payload) as Record<string, unknown>;
        } catch {
          return null;
        }
      }),
    saveState: protectedProcedure
      .input(groupIdInput.extend({ state: z.record(z.string(), z.unknown()) }))
      .mutation(async ({ ctx, input }) => {
        await requireMembership(input.groupId, ctx.user.openId);
        const previousPayload = await getFamilyHubState(input.groupId);
        const protectedState = await protectDinnerStatuses(input.groupId, input.state, ctx.user.openId);
        const payload = JSON.stringify(protectedState);
        if (payload.length > 200_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "共有データが大きすぎます" });
        }
        await saveFamilyHubState(input.groupId, payload);
        await notifyFamily(input.groupId, ctx.user.openId, getUpdateNotice(previousPayload, protectedState));
        return { ok: true, savedAt: new Date().toISOString() };
      }),
  }),
});

export type AppRouter = typeof appRouter;
