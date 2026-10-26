import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getFamilyMemberships, getFamilyHubState, isFamilyMember, joinFamilyGroup, createFamilyGroup, saveFamilyHubState, updateFamilyMemberName } from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const groupIdInput = z.object({ groupId: z.number().int().positive() });
const displayNameInput = z.string().trim().min(1, "表示名を入力してください").max(40, "表示名は40文字以内で入力してください");

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
        const protectedState = await protectDinnerStatuses(input.groupId, input.state, ctx.user.openId);
        const payload = JSON.stringify(protectedState);
        if (payload.length > 200_000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "共有データが大きすぎます" });
        }
        await saveFamilyHubState(input.groupId, payload);
        return { ok: true, savedAt: new Date().toISOString() };
      }),
  }),
});

export type AppRouter = typeof appRouter;
