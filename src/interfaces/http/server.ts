import { Elysia } from "elysia";
import index from "../../frontend/index.html";
import { handleAuth } from "@/infrastructure/auth/handler";
import { authJsSessionResolver } from "@/infrastructure/auth/auth-js-session-resolver";
import { GetCurrentUserQuery } from "@/application/queries/get-current-user";

const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);

const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .all("/auth/*", ({ request }) => handleAuth(request))
  .get("/api/me", async ({ request }) => {
    const user = await getCurrentUser.execute(request);
    if (!user) return new Response(null, { status: 401 });
    return user;
  });

const server = Bun.serve({
  port: 3010,
  routes: {
    "/health": (req) => app.handle(req),
    "/auth/*": (req) => app.handle(req),
    "/api/me": (req) => app.handle(req),
    "/*": index,
  },
  fetch: app.fetch,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 promptstash listening on ${server.url}`);
