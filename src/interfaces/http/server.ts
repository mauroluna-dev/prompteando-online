import { Elysia } from "elysia";
import { ZodError } from "zod";
import index from "../../frontend/index.html";
import { env } from "@/infrastructure/config/env";
import { handleAuth } from "@/infrastructure/auth/auth.handler";
import { authJsSessionResolver } from "@/infrastructure/auth/auth-js-session-resolver.adapter";
import { db } from "@/infrastructure/persistence/db";
import { PostgresPromptRepository } from "@/infrastructure/persistence/repositories/postgres-prompt.repository";
import { PostgresVersionRepository } from "@/infrastructure/persistence/repositories/postgres-version.repository";
import { PostgresApiKeyRepository } from "@/infrastructure/persistence/repositories/postgres-api-key.repository";
import { BunCryptoAdapter } from "@/infrastructure/crypto/bun-crypto.adapter";
import { BunRedisCache } from "@/infrastructure/cache/bun-redis-cache.adapter";
import { BunRedisRateLimiter } from "@/infrastructure/cache/bun-redis-rate-limiter.adapter";
import { GetCurrentUserQuery } from "@/application/queries/get-current-user.query";
import { CreatePromptCommand } from "@/application/commands/create-prompt.command";
import { DeletePromptCommand } from "@/application/commands/delete-prompt.command";
import { GetPromptBySlugQuery } from "@/application/queries/get-prompt-by-slug.query";
import { ListPromptsForUserQuery } from "@/application/queries/list-prompts-for-user.query";
import { SaveNewVersionCommand } from "@/application/commands/save-new-version.command";
import { RestoreVersionCommand } from "@/application/commands/restore-version.command";
import { GetVersionQuery } from "@/application/queries/get-version.query";
import { ListVersionsQuery } from "@/application/queries/list-versions.query";
import { CreateApiKeyCommand } from "@/application/commands/create-api-key.command";
import { RevokeApiKeyCommand } from "@/application/commands/revoke-api-key.command";
import { ListApiKeysForUserQuery } from "@/application/queries/list-api-keys-for-user.query";
import { AuthenticateApiKeyQuery } from "@/application/queries/authenticate-api-key.query";
import { GetLatestPublishedVersionQuery } from "@/application/queries/get-latest-published-version.query";
import { ConnectGitHubCommand } from "@/application/commands/connect-github.command";
import { DisconnectGitHubCommand } from "@/application/commands/disconnect-github.command";
import { GetGitHubConnectionQuery } from "@/application/queries/get-github-connection.query";
import { OctokitGitHubAdapter } from "@/infrastructure/github/octokit-github.adapter";
import { PostgresGitHubConnectionRepository } from "@/infrastructure/persistence/repositories/postgres-github-connection.repository";
import {
  signOAuthState,
  verifyOAuthState,
} from "@/infrastructure/auth/oauth-state";
import {
  GitHubInsufficientScopeError,
  GitHubOAuthFailedError,
  GitHubRepoCreationFailedError,
  InvalidOAuthStateError,
} from "@/domain/github-connection";
import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
  ApiKeyQuotaExceededError,
  InvalidApiKeyNameError,
} from "@/domain/api-key";
import {
  InvalidPromptNameError,
  InvalidSlugError,
  PromptDescriptionTooLongError,
  PromptNotFoundError,
  Slug,
} from "@/domain/prompt";
import {
  InvalidVersionNumberError,
  VersionNotFoundError,
  VersionNumber,
} from "@/domain/prompt-version";
import { createPromptSchema } from "./schemas/prompt";
import { saveVersionSchema } from "./schemas/prompt-version";
import { createApiKeySchema } from "./schemas/api-key";
import { requireUser } from "./lib/require-user";
import { requireApiKey } from "./lib/require-api-key";

// ───────────────── Composition root ─────────────────
const cryptoAdapter = new BunCryptoAdapter();
const promptRepo = new PostgresPromptRepository(db);
const versionRepo = new PostgresVersionRepository(db);
const apiKeyRepo = new PostgresApiKeyRepository(db);
const cache = new BunRedisCache();
const rateLimiter = new BunRedisRateLimiter();
const getCurrentUser = new GetCurrentUserQuery(authJsSessionResolver);
const createPrompt = new CreatePromptCommand(promptRepo, cryptoAdapter);
const deletePrompt = new DeletePromptCommand(promptRepo, cache);
const getPromptBySlug = new GetPromptBySlugQuery(promptRepo);
const listPromptsForUser = new ListPromptsForUserQuery(promptRepo);
const saveNewVersion = new SaveNewVersionCommand(promptRepo, versionRepo, cache, cryptoAdapter);
const restoreVersion = new RestoreVersionCommand(promptRepo, versionRepo, cache, cryptoAdapter);
const getVersion = new GetVersionQuery(promptRepo, versionRepo);
const listVersions = new ListVersionsQuery(promptRepo, versionRepo);
const createApiKey = new CreateApiKeyCommand(apiKeyRepo, cryptoAdapter);
const revokeApiKey = new RevokeApiKeyCommand(apiKeyRepo);
const listApiKeys = new ListApiKeysForUserQuery(apiKeyRepo);
const authenticateApiKey = new AuthenticateApiKeyQuery(apiKeyRepo, cryptoAdapter);
const getLatestPublishedVersion = new GetLatestPublishedVersionQuery(
  promptRepo,
  versionRepo,
  cache,
);
const githubConnectionRepo = new PostgresGitHubConnectionRepository(db);
const githubGateway = new OctokitGitHubAdapter({
  clientId: env.GITHUB_CLIENT_ID,
  clientSecret: env.GITHUB_CLIENT_SECRET,
});
const connectGithub = new ConnectGitHubCommand(
  githubConnectionRepo,
  githubGateway,
  cryptoAdapter,
);
const disconnectGithub = new DisconnectGitHubCommand(githubConnectionRepo);
const getGithubConnection = new GetGitHubConnectionQuery(githubConnectionRepo);

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

function parsePromptSlugParam(value: string): Slug | null {
  try {
    return Slug.parse(value);
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
    return Response.json(user);
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
      const prompt = await createPrompt.execute(
        userOr401.id,
        parsed.name,
        parsed.description,
      );
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
    const prompts = await listPromptsForUser.execute(userOr401.id);
    return Response.json(prompts);
  })
  .get("/api/prompts/:slug", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const slug = parsePromptSlugParam(params.slug);
    if (!slug) return jsonError(404, "Prompt not found");

    try {
      const prompt = await getPromptBySlug.execute(userOr401.id, slug);
      return Response.json(prompt);
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
      await deletePrompt.execute(userOr401.id, slug);
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
      const result = await saveNewVersion.execute(
        userOr401.id,
        params.slug,
        parsed.content,
        parsed.commitMessage,
      );
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
      const versions = await listVersions.execute(userOr401.id, params.slug);
      return Response.json(versions);
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
      const versionNumber = VersionNumber.parseFromString(params.n);
      const version = await getVersion.execute(
        userOr401.id,
        params.slug,
        versionNumber,
      );
      return Response.json(version);
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
      const versionNumber = VersionNumber.parseFromString(params.n);
      const result = await restoreVersion.execute(
        userOr401.id,
        params.slug,
        versionNumber,
      );
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
      const result = await createApiKey.execute(userOr401.id, parsed.name);
      return new Response(
        JSON.stringify({
          apiKey: result.apiKey.toView(),
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
    return Response.json(keys.map((k) => k.toView()));
  })
  .delete("/api/keys/:id", async ({ request, params }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    try {
      await revokeApiKey.execute(userOr401.id, params.id);
      return new Response(null, { status: 204 });
    } catch (err) {
      if (err instanceof ApiKeyNotFoundError) return jsonError(404, err.message);
      if (err instanceof ApiKeyAlreadyRevokedError) return jsonError(410, err.message);
      throw err;
    }
  })
  // ───────────────── GitHub integration (P10) ─────────────────
  .get("/api/integrations/github/oauth-start", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: `${env.AUTH_URL}/api/integrations/github/oauth-callback`,
      scope: "repo",
      state: signOAuthState(userOr401.id),
      allow_signup: "false",
    });
    return Response.json({
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  })
  .get("/api/integrations/github/oauth-callback", async ({ query }) => {
    const back = (msg: string) =>
      Response.redirect(
        `${env.AUTH_URL}/settings/integrations?${msg}`,
        302,
      );

    if (typeof query.error === "string") {
      return back(`error=${encodeURIComponent(query.error)}`);
    }
    if (typeof query.code !== "string" || typeof query.state !== "string") {
      return back("error=invalid-callback");
    }

    let userId: string;
    try {
      userId = verifyOAuthState(query.state);
    } catch (err) {
      if (err instanceof InvalidOAuthStateError) {
        return back("error=invalid-state");
      }
      throw err;
    }

    try {
      await connectGithub.execute(userId, query.code);
      return back("connected=1");
    } catch (err) {
      if (err instanceof GitHubInsufficientScopeError) {
        return back("error=insufficient-scope");
      }
      if (err instanceof GitHubOAuthFailedError) {
        return back("error=oauth-failed");
      }
      if (err instanceof GitHubRepoCreationFailedError) {
        return back("error=repo-failed");
      }
      throw err;
    }
  })
  .get("/api/integrations/github", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    const connection = await getGithubConnection.execute(userOr401.id);
    if (!connection) return new Response(null, { status: 404 });
    return Response.json(connection.toView());
  })
  .delete("/api/integrations/github", async ({ request }) => {
    const userOr401 = await requireUser(request, getCurrentUser);
    if (userOr401 instanceof Response) return userOr401;

    await disconnectGithub.execute(userOr401.id);
    return new Response(null, { status: 204 });
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

    const dto = await getLatestPublishedVersion.execute(
      keyOr401.userId,
      params.slug,
    );
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
    "/api/integrations/*": (req) => app.handle(req),
    "/v1/prompts/*": (req) => app.handle(req),
    "/*": index,
  },
  fetch: app.fetch,
  development: env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 promptstash listening on ${server.url}`);
