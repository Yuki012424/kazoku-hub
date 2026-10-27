import type { VercelRequest, VercelResponse } from "@vercel/node";
import { publicPlatformScript } from "../server/_core/publicConfig";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = req.url?.split("?")[0] ?? "";
  if (path === "/api/health") return res.status(200).json({ status: "ok" });
  if (path === "/api/platform/config.js") {
    return res.status(200).setHeader("Cache-Control", "no-store").setHeader("Content-Type", "application/javascript; charset=utf-8").send(publicPlatformScript());
  }
  const { createApp } = await import("../server/_core/index");
  const app = await createApp({ includeStatic: false });
  return app(req, res);
}
