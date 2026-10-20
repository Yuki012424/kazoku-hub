import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getFamilyHubState, saveFamilyHubState } from "./db";
import { z } from "zod";

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
  hub: router({
    getState: publicProcedure.query(async () => {
      const payload = await getFamilyHubState();
      if (!payload) return null;
      try {
        return JSON.parse(payload) as Record<string, unknown>;
      } catch {
        return null;
      }
    }),
    saveState: publicProcedure
      .input(z.object({ state: z.record(z.string(), z.unknown()) }))
      .mutation(async ({ input }) => {
        await saveFamilyHubState(JSON.stringify(input.state));
        return { ok: true, savedAt: new Date().toISOString() };
      }),
  }),
});

export type AppRouter = typeof appRouter;
