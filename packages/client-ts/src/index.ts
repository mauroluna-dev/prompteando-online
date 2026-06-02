// @prompteando/client — official TypeScript/JavaScript SDK.
// Zero dependencies; uses the global `fetch`.

export type PromptType = "text" | "chat";

export type ChatMessage = {
  role: string;
  content?: string;
  name?: string;
};

export type GetPromptResult = {
  content: string;
  version: number;
  updatedAt: string;
  commitMessage: string | null;
  isTemplate: boolean;
  templateVars: string[];
  type: PromptType;
  config: Record<string, unknown>;
};

export type RenderResult = {
  type: PromptType;
  content: string | null;
  messages: ChatMessage[] | null;
  config: Record<string, unknown>;
  version: number;
  vars_used: string[];
  missing_vars: string[];
};

export type ClientOptions = {
  apiKey: string;
  /** Base URL of your Prompteando instance. */
  baseUrl?: string;
  /** getPrompt cache TTL in ms (default 60s). Set 0 to disable. */
  cacheTtlMs?: number;
  /** Injectable fetch (tests / custom agents). */
  fetch?: typeof fetch;
};

export class PrompteandoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PrompteandoError";
  }
}

export type FetchSelector = { label?: string; version?: number };

export type RenderInput = {
  vars?: Record<string, string>;
  label?: string;
  version?: number;
  placeholders?: Record<string, ChatMessage[]>;
};

type CacheEntry = { value: GetPromptResult; expiresAt: number };

const DEFAULT_BASE_URL = "https://prompteando.online";
const DEFAULT_TTL_MS = 60_000;

export class PrompteandoClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly ttlMs: number;
  private readonly doFetch: typeof fetch;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly lastGood = new Map<string, GetPromptResult>();

  constructor(opts: ClientOptions) {
    if (!opts.apiKey) throw new Error("apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.ttlMs = opts.cacheTtlMs ?? DEFAULT_TTL_MS;
    this.doFetch = opts.fetch ?? fetch;
  }

  /**
   * Fetches a prompt by slug, optionally pinned by label or version.
   * Cached for `cacheTtlMs`; on a network/5xx error a stale cached
   * value is returned as a fallback when available.
   */
  async getPrompt(
    slug: string,
    selector: FetchSelector = {},
  ): Promise<GetPromptResult> {
    const key = `${slug}|${selector.label ?? ""}|${selector.version ?? ""}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) return cached.value;

    const query = new URLSearchParams();
    if (selector.label) query.set("label", selector.label);
    const qs = query.toString();
    const url = `${this.baseUrl}/v1/prompts/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`;

    try {
      const value = await this.request<GetPromptResult>("GET", url);
      this.cache.set(key, { value, expiresAt: now + this.ttlMs });
      this.lastGood.set(key, value);
      return value;
    } catch (err) {
      const fallback = this.lastGood.get(key);
      if (fallback && err instanceof PrompteandoError && err.status >= 500) {
        return fallback;
      }
      if (fallback && !(err instanceof PrompteandoError)) return fallback;
      throw err;
    }
  }

  /** Renders a template/chat prompt with the given variables. */
  async render(slug: string, input: RenderInput = {}): Promise<RenderResult> {
    const url = `${this.baseUrl}/v1/prompts/${encodeURIComponent(slug)}/render`;
    return this.request<RenderResult>("POST", url, {
      vars: input.vars ?? {},
      ...(input.version !== undefined ? { version: input.version } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.placeholders !== undefined
        ? { placeholders: input.placeholders }
        : {}),
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    url: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const parsed: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message =
        (parsed as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
      throw new PrompteandoError(message, res.status, parsed);
    }
    return parsed as T;
  }
}
