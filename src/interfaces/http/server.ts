import { Elysia } from "elysia";
import { ZodError } from "zod";
import index from "../../frontend/index.html";
import { handleAuth } from "@/infrastructure/auth/handler";
import { authJsSessionResolver } from "@/infrastructure/auth/auth-js-session-resolver";
import { db } from "@/infrastructure/persistence/db";
import { PostgresPromptRepository } from "@/infrastructure/persistence/repositories/postgres-prompt-repository";
import { GetCurrentUserQuery } from "@/application/queries/get-current-user";
import { CreatePromptCommand } from "@/application/commands/create-prompt";
import { DeletePromptCommand } from "@/application/commands/delete-prompt";
import { GetPromptBySlugQuery } from "@/application/queries/get-prompt-by-slug";
import { ListPromptsForUserQuery } from "@/application/queries/list-prompts-for-user";
import {
  InvalidPromptNameError,
  InvalidSlugError,
  PromptDescriptionTooLongError,
  PromptNotFoundError,
  parseSlug,
} from "@/domain/prompt";
import { createPromptSchema } from "./schemas/prompt";
import { requireUser } from "./lib/require-user";

// ───────────────── Composition root ─────────────────
const promptRepo = new PostgresPromptRepository(db);
const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);
const createPrompt = new CreatePromptCommand(promptRepo);
const deletePrompt = new DeletePromptCommand(promptRepo);
const getPromptBySlug = new GetPromptBySlugQuery(promptRepo);
const listPromptsForUser = new ListPromptsForUserQuery(promptRepo);

// ───────────────── Helpers ─────────────────
function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parsePromptSlugParam(value: string) {
  try {
    return parseSlug(value);
  } catch {
    return null;
  }
}

// ───────────────── Routes ─────────────────
const app = new Elysia()
  .get("/health", () => ({ ok: true }))
  .all("/auth/*", ({ request }) => handleAuth(request))
  .get("/api/me", async ({ request }) => {
    const user = await getCurrentUser.execute(request);
    if (!user) return new Response(null, { status: 401 });
    return user;
  })
  .post("/api/prompts", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    try {
      const parsed = createPromptSchema.parse(body);
      const prompt = await createPrompt.execute({
        userId: userOr401.id,
        name: parsed.name,
        description: parsed.description,
      });
      return new Response(JSON.stringify(prompt), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      if (err instanceof ZodError) return jsonError(400, err.issues[0]?.message ?? "Invalid input");
      if (err instanceof InvalidPromptNameError) return jsonError(400, err.message);
      if (err instanceof InvalidSlugError) return jsonError(400, err.message);
      if (err instanceof PromptDescriptionTooLongError) return jsonError(400, err.message);
      throw err;
    }
  })
  .get("/api/prompts", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;
    return listPromptsForUser.execute(userOr401.id);
  })
  .get("/api/prompts/:slug", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const slug = parsePromptSlugParam(params.slug);
    if (!slug) return jsonError(404, "Prompt not found");

    try {
      return await getPromptBySlug.execute(userOr401.id, slug);
    } catch (err) {
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      throw err;
    }
  })
  .delete("/api/prompts/:slug", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const slug = parsePromptSlugParam(params.slug);
    if (!slug) return jsonError(404, "Prompt not found");

    try {
      await deletePrompt.execute({ userId: userOr401.id, slug });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      throw err;
    }
  });

const server = Bun.serve({
  port: 3010,
  routes: {
    "/health": (req) => app.handle(req),
    "/auth/*": (req) => app.handle(req),
    "/api/me": (req) => app.handle(req),
    "/api/prompts": (req) => app.handle(req),
    "/api/prompts/*": (req) => app.handle(req),
    "/*": index,
  },
  fetch: app.fetch,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 promptstash listening on ${server.url}`);
