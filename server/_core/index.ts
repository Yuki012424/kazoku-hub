import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";

export async function createApp(options: { includeStatic?: boolean } = {}) {
  if (process.env.VERCEL !== "1") {
    const dotenvModule = "dotenv/config";
    await import(dotenvModule);
  }
  const app = express();
  const includeStatic = options.includeStatic ?? process.env.VERCEL !== "1";
  const viteRuntimeModule = "./vite";
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development" && includeStatic) {
    const { setupVite } = await import(viteRuntimeModule);
    const server = createServer(app);
    await setupVite(app, server);
  } else if (includeStatic) {
    const { serveStatic } = await import(viteRuntimeModule);
    serveStatic(app);
  }

  return app;
}

async function startServer() {
  const app = await createApp();
  const server = createServer(app);

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

if (process.env.VERCEL !== "1") {
  startServer().catch(error => { console.error(error); process.exit(1); });
}
