import "dotenv/config";
import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import { createApp as createApiApp } from "./app";

export async function createApp(options: { includeStatic?: boolean } = {}) {
  const app = createApiApp();
  const includeStatic = options.includeStatic ?? process.env.VERCEL !== "1";

  if (process.env.NODE_ENV === "development" && includeStatic) {
    const server = createServer(app);
    await setupVite(app, server);
  } else if (includeStatic) {
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
