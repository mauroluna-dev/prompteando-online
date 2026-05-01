import { Elysia } from "elysia";
import index from "../../frontend/index.html";

const app = new Elysia().get("/health", () => ({ ok: true }));

const server = Bun.serve({
  port: 3010,
  routes: {
    "/": index,
  },
  fetch: app.fetch,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 promptstash listening on ${server.url}`);
