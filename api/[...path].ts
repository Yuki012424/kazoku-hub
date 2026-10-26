import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../server/_core/index";

const appPromise = createApp({ includeStatic: false });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await appPromise;
  return app(req, res);
}
