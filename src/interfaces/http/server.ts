import { Elysia } from "elysia";
import { ZodError } from "zod";
import index from "../../frontend/index.html";
import { handleAuth } from "@/infrastructure/auth/handler";
import { authJsSessionResolver } from "@/infrastructure/auth/auth-js-session-resolver";
import { db } from "@/infrastructure/persistence/db";
import { PostgresPromptRepository } from "@/infrastructure/persistence/repositories/postgres-prompt-repository";
import { PostgresVersionRepository } from "@/infrastructure/persistence/repositories/postgres-version-repository";
import { PostgresApiKeyRepository } from "@/infrastructure/persistence/repositories/postgres-api-key-repository";
import { BunPasswordApiKeyHasher } from "@/infrastructure/auth/bun-password-api-key-hasher";
import { BunRedisCache } from "@/infrastructure/cache/bun-redis-cache";
import { BunRedisRateLimiter } from "@/infrastructure/cache/bun-redis-rate-limiter";
import { GetCurrentUserQuery } from "@/application/queries/get-current-user";
import { CreatePromptCommand } from "@/application/commands/create-prompt";
import { DeletePromptCommand } from "@/application/commands/delete-prompt";
import { GetPromptBySlugQuery } from "@/application/queries/get-prompt-by-slug";
import { ListPromptsForUserQuery } from "@/application/queries/list-prompts-for-user";
import { SaveNewVersionCommand } from "@/application/commands/save-new-version";
import { RestoreVersionCommand } from "@/application/commands/restore-version";
import { GetVersionQuery } from "@/application/queries/get-version";
import { ListVersionsQuery } from "@/application/queries/list-versions";
import { CreateApiKeyCommand } from "@/application/commands/create-api-key";
import { RevokeApiKeyCommand } from "@/application/commands/revoke-api-key";
import { ListApiKeysForUserQuery } from "@/application/queries/list-api-keys-for-user";
import { AuthenticateApiKeyQuery } from "@/application/queries/authenticate-api-key";
import { GetLatestPublishedVersionQuery } from "@/application/queries/get-latest-published-version";
import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
  ApiKeyQuotaExceededError,
  InvalidApiKeyNameError,
  toApiKeyView,
} from "@/domain/api-key";
import {
  InvalidPromptNameError,
  InvalidSlugError,
  PromptDescriptionTooLongError,
  PromptNotFoundError,
  parseSlug,
} from "@/domain/prompt";
import {
  InvalidVersionNumberError,
  VersionNotFoundError,
  parseVersionNumberFromString,
} from "@/domain/prompt-version";
import { createPromptSchema } from "./schemas/prompt";
import { saveVersionSchema } from "./schemas/prompt-version";
import { createApiKeySchema } from "./schemas/api-key";
import { requireUser } from "./lib/require-user";
import { requireApiKey } from "./lib/require-api-key";

// ───────────────── Composition root ─────────────────
const promptRepo = new PostgresPromptRepository(db);
const versionRepo = new PostgresVersionRepository(db);
const apiKeyRepo = new PostgresApiKeyRepository(db);
const apiKeyHasher = new BunPasswordApiKeyHasher();
const cache = new BunRedisCache();
const rateLimiter = new BunRedisRateLimiter();
const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);
const createPrompt = new CreatePromptCommand(promptRepo);
const deletePrompt = new DeletePromptCommand(promptRepo, cache);
const getPromptBySlug = new GetPromptBySlugQuery(promptRepo);
const listPromptsForUser = new ListPromptsForUserQuery(promptRepo);
const saveNewVersion = new SaveNewVersionCommand(promptRepo, versionRepo, cache);
const restoreVersion = new RestoreVersionCommand(promptRepo, versionRepo, cache);
const getVersion = new GetVersionQuery(promptRepo, versionRepo);
const listVersions = new ListVersionsQuery(promptRepo, versionRepo);
const createApiKey = new CreateApiKeyCommand(apiKeyRepo, apiKeyHasher);
const revokeApiKey = new RevokeApiKeyCommand(apiKeyRepo);
const listApiKeys = new ListApiKeysForUserQuery(apiKeyRepo);
const authenticateApiKey = new AuthenticateApiKeyQuery(apiKeyRepo, apiKeyHasher);
const getLatestPublishedVersion = new GetLatestPublishedVersionQuery(
  promptRepo,
  versionRepo,
  cache,
);

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-max-age": "86400",
};

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
  })
  .post("/api/prompts/:slug/versions", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    try {
      const parsed = saveVersionSchema.parse(body);
      const result = await saveNewVersion.execute({
        userId: userOr401.id,
        slug: params.slug,
        content: parsed.content,
        commitMessage: parsed.commitMessage,
      });
      return new Response(JSON.stringify(result.version), {
        status: result.isNoOp ? 200 : 201,
        headers: {
          "content-type": "application/json",
          ...(result.isNoOp ? { "x-version-noop": "true" } : {}),
        },
      });
    } catch (err) {
      if (err instanceof ZodError) return jsonError(400, err.issues[0]?.message ?? "Invalid input");
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      if (err instanceof InvalidSlugError) return jsonError(404, "Prompt not found");
      throw err;
    }
  })
  .get("/api/prompts/:slug/versions", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    try {
      return await listVersions.execute({
        userId: userOr401.id,
        slug: params.slug,
      });
    } catch (err) {
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      if (err instanceof InvalidSlugError) return jsonError(404, "Prompt not found");
      throw err;
    }
  })
  .get("/api/prompts/:slug/versions/:n", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    try {
      const versionNumber = parseVersionNumberFromString(params.n);
      return await getVersion.execute({
        userId: userOr401.id,
        slug: params.slug,
        versionNumber,
      });
    } catch (err) {
      if (err instanceof InvalidVersionNumberError) return jsonError(404, "Version not found");
      if (err instanceof VersionNotFoundError) return jsonError(404, err.message);
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      if (err instanceof InvalidSlugError) return jsonError(404, "Prompt not found");
      throw err;
    }
  })
  .post("/api/prompts/:slug/versions/:n/restore", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    try {
      const versionNumber = parseVersionNumberFromString(params.n);
      const result = await restoreVersion.execute({
        userId: userOr401.id,
        slug: params.slug,
        versionNumber,
      });
      return new Response(JSON.stringify(result.version), {
        status: result.isNoOp ? 200 : 201,
        headers: {
          "content-type": "application/json",
          ...(result.isNoOp ? { "x-version-noop": "true" } : {}),
        },
      });
    } catch (err) {
      if (err instanceof InvalidVersionNumberError) return jsonError(404, "Version not found");
      if (err instanceof VersionNotFoundError) return jsonError(404, err.message);
      if (err instanceof PromptNotFoundError) return jsonError(404, err.message);
      if (err instanceof InvalidSlugError) return jsonError(404, "Prompt not found");
      throw err;
    }
  })
  .post("/api/keys", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "Invalid JSON body");
    }

    try {
      const parsed = createApiKeySchema.parse(body);
      const result = await createApiKey.execute({
        userId: userOr401.id,
        name: parsed.name,
      });
      return new Response(
        JSON.stringify({
          apiKey: toApiKeyView(result.apiKey),
          plaintext: result.plaintext,
        }),
        {
          status: 201,
          headers: { "content-type": "application/json" },
        },
      );
    } catch (err) {
      if (err instanceof ZodError) return jsonError(400, err.issues[0]?.message ?? "Invalid input");
      if (err instanceof InvalidApiKeyNameError) return jsonError(400, err.message);
      if (err instanceof ApiKeyQuotaExceededError) return jsonError(429, err.message);
      throw err;
    }
  })
  .get("/api/keys", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;
    const keys = await listApiKeys.execute(userOr401.id);
    return keys.map(toApiKeyView);
  })
  .delete("/api/keys/:id", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    try {
      await revokeApiKey.execute({ userId: userOr401.id, id: params.id });
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof ApiKeyNotFoundError) return jsonError(404, err.message);
      if (err instanceof ApiKeyAlreadyRevokedError) return jsonError(410, err.message);
      throw err;
    }
  })
  // ───────────────── Public consumption API ─────────────────
  .options("/v1/prompts/:slug", () => new Response(null, { status: 204, headers: corsHeaders }))
  .get("/v1/prompts/:slug", async ({ request, params }) => {
    const keyOr401 = await requireApiKey(request, authenticateApiKey, corsHeaders);
    if (keyOr401 instanceof Response) return keyOr401;

    const rl = await rateLimiter.consume(`apikey:${keyOr401.id}`, 100, 60);
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "content-type": "application/json",
          "retry-after": String(rl.retryAfter),
        },
      });
    }

    const dto = await getLatestPublishedVersion.execute({
      userId: keyOr401.userId,
      slug: params.slug,
    });
    if (!dto) {
      return new Response(JSON.stringify({ error: "Prompt not found" }), {
        status: 404,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify(dto), {
      status: 200,
      headers: {
        ...corsHeaders,
        "content-type": "application/json",
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": String(rl.remaining),
        "x-ratelimit-reset": String(rl.resetAt),
      },
    });
  });

const server = Bun.serve({
  port: 3010,
  routes: {
    "/health": (req) => app.handle(req),
    "/auth/*": (req) => app.handle(req),
    "/api/me": (req) => app.handle(req),
    "/api/prompts": (req) => app.handle(req),
    "/api/prompts/*": (req) => app.handle(req),
    "/api/keys": (req) => app.handle(req),
    "/api/keys/*": (req) => app.handle(req),
    "/v1/prompts/*": (req) => app.handle(req),
    "/*": index,
  },
  fetch: app.fetch,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 promptstash listening on ${server.url}`);
