# Conventions — prompteando

Single source of truth for architectural conventions. All phases (P0–P16)
must follow these. New phases are written natively to these conventions;
P0–P9 were retroactively aligned in Pα/Pβ (2026-05-03). §11 (design
tokens + typography roles) was added in Pγ (2026-05-04) and applies
retroactively to all frontend code.

When something here conflicts with `tech-stack.md` or `roadmap.md`, this
document wins.

---

## 1. Centralized environment (`env.ts`)

All env reads go through `src/infrastructure/config/env.ts`, which
parses `process.env` with a Zod schema and fails fast at import time
if anything is missing/invalid.

```ts
// src/infrastructure/config/env.ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  // Auth.js login OAuth App (callback: /auth/callback/github).
  GITHUB_AUTH_CLIENT_ID: z.string().min(1),
  GITHUB_AUTH_CLIENT_SECRET: z.string().min(1),
  // Settings → Connect GitHub OAuth App (callback:
  // /api/integrations/github/oauth-callback). Must be a separate
  // OAuth App in GitHub because OAuth Apps allow only ONE
  // Authorization callback URL each.
  GITHUB_INTEGRATIONS_CLIENT_ID: z.string().min(1),
  GITHUB_INTEGRATIONS_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(40),
  SENTRY_DSN: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"])
    .default("development"),
});

export const env = schema.parse(process.env);
```

**Rule**: Never read `process.env.X` outside `env.ts`. Always
`import { env } from "@/infrastructure/config/env"`.

---

## 2. Conventional Commits + commitlint

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/).

`commitlint.config.js`:
```js
export default { extends: ["@commitlint/config-conventional"] };
```

Husky `commit-msg` hook rejects non-conformant messages.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`, `revert`.

Scope convention: phase tag (e.g. `feat(p10): ...`) when within a
phase, otherwise feature area (`feat(prompts): ...`,
`fix(auth): ...`).

---

## 3. Husky `pre-push` quality gate

Every push runs:

```sh
bun run lint && bun run typecheck && bun run build && bun test
```

Defined in `.husky/pre-push`. If any step fails, push is blocked.
Use `--no-verify` only after explicit user authorization.

---

## 4. SonarQube enforcement via ESLint

Linter is **ESLint flat config** with **`eslint-plugin-sonarjs`**
(`recommended` ruleset) plus TypeScript strict rules. Same lint runs
locally (`bun run lint`) and in `pre-push`.

```js
// eslint.config.js
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".husky"] },
  ...tseslint.configs.strict,
  sonarjs.configs.recommended,
);
```

CLI: `bun run lint` (zero warnings tolerated; `--max-warnings=0`).

---

## 5. Per-feature `CONSTANTS` namespace

Each module owns its `constants.ts` exporting a single
`export const CONSTANTS = { ... } as const`. **No global shared
constants file** — the per-feature placement preserves hexagonal
isolation (a domain module can be moved/deleted without touching a
shared file).

```ts
// src/domain/api-key/constants.ts
export const CONSTANTS = {
  PREFIX: "po_live_",
  RANDOM_BYTES: 16,
  PLAINTEXT_LENGTH: 40,
  PREFIX_LENGTH: 16,
  QUOTA_PER_USER: 10,
} as const;
```

```ts
// usage
import { CONSTANTS } from "./constants";
const prefix = CONSTANTS.PREFIX;
```

**Rule**: Any literal that's reused, or any magic number/string with
domain meaning, must live in a `constants.ts` and be referenced as
`CONSTANTS.X`. One-shot literals inside a single function stay inline.

---

## 6. UseCase `execute()` signatures

Each command/query class has a single public `execute(...)`. Param
shape rules:

- **1–4 inputs** → positional args. Optional inputs at the end.
- **5+ inputs** → single object input.

```ts
// 1–4 inputs: positional
class CreatePromptCommand {
  async execute(
    userId: string,
    name: string,
    description?: string,
  ): Promise<Prompt> { ... }
}

// 5+ inputs: object
class SaveNewVersionCommand {
  async execute(input: {
    userId: string;
    slug: Slug;
    content: string;
    commitMessage?: string;
    parentVersionNumber?: VersionNumber;
    sourceIp?: string;
  }): Promise<PromptVersion> { ... }
}
```

**Rule**: Optional args go at the end. Booleans rarely belong in a
positional list (prefer named flags via object input).

---

## 7. Entities as rich classes

Domain entities are **classes** with invariants enforced in the
constructor. Two factories:

- `static create(input)` → for entities born inside the domain (new
  instance from user input). Throws on invalid invariants.
- `static fromRow(row)` → for reconstitution from a trusted DB row
  (skips `create`'s side effects like UUID generation).

Behavior methods (mutators that respect invariants) live on the
class.

```ts
export class Prompt {
  private constructor(
    readonly id: string,
    readonly userId: string,
    private _name: PromptName,
    readonly slug: Slug,
    private _description: string | null,
    private _currentVersionId: string | null,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(input: {
    id: string;
    userId: string;
    name: PromptName;
    slug: Slug;
    description: string | null;
    now: Date;
  }): Prompt {
    if (input.description && input.description.length > CONSTANTS.MAX_DESCRIPTION_LENGTH) {
      throw new PromptDescriptionTooLongError(CONSTANTS.MAX_DESCRIPTION_LENGTH);
    }
    return new Prompt(
      input.id, input.userId, input.name, input.slug,
      input.description, null, input.now, input.now,
    );
  }

  static fromRow(row: PromptRow): Prompt { ... }

  get name(): PromptName { return this._name; }
  get description(): string | null { return this._description; }
  get currentVersionId(): string | null { return this._currentVersionId; }
  get updatedAt(): Date { return this._updatedAt; }

  setCurrentVersion(versionId: string, now: Date): void {
    this._currentVersionId = versionId;
    this._updatedAt = now;
  }
}
```

**Rule**: No raw `const x: Entity = { ... }` object literals.
Entities only enter existence via `Entity.create(...)` or
`Entity.fromRow(...)`. Mutation only via instance methods.

**HTTP serialization gotcha**: Elysia's auto-serializer falls back
to `String()` for class instances, producing `"[object Object]"`.
HTTP handlers that return an entity must wrap it in
`Response.json(entity)` (which calls `JSON.stringify` → invokes
`entity.toJSON()`). Same for arrays of entities. Never
`return entity` directly from a route handler.

---

## 8. Unified `CryptoPort`

All non-deterministic primitives (UUIDs, random bytes, password
hashing) live behind a single `CryptoPort`. There is one adapter:
`BunCryptoAdapter` (uses `crypto.randomUUID`,
`crypto.getRandomValues`, `Bun.password.hash` with argon2id,
`Bun.password.verify`).

```ts
// src/application/ports/crypto.port.ts
export interface CryptoPort {
  randomUUID(): string;
  randomBytes(n: number): Uint8Array;
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
}
```

**Rule**: Application/domain code never imports `crypto`,
`node:crypto`, or `Bun.password` directly. Always inject `CryptoPort`.

---

## 9. File suffix conventions

Every file's role is encoded in its name suffix.

| Suffix | Layer / role | Example |
|---|---|---|
| `.command.ts` | application command | `create-prompt.command.ts` |
| `.query.ts` | application query | `get-prompt-by-slug.query.ts` |
| `.job.ts` | application background job | `commit-version-to-github.job.ts` |
| `.port.ts` | application port (interface) | `prompt-repository.port.ts` |
| `.entity.ts` | domain entity | `prompt.entity.ts` |
| `.vo.ts` | domain value object | `slug.vo.ts` |
| `.errors.ts` | domain error classes | `prompt.errors.ts` |
| `.repository.ts` | infrastructure repo impl | `postgres-prompt.repository.ts` |
| `.adapter.ts` | other infrastructure adapter | `bun-crypto.adapter.ts` |
| `.handler.ts` | HTTP handler | `auth.handler.ts` |
| `.middleware.ts` | HTTP middleware | `api-key.middleware.ts` |
| `.routes.ts` | HTTP route group | `prompts.routes.ts` (when used) |

Files without role-suffixes are reserved for technical glue
(`server.ts`, `db.ts`, `redis.ts`, `index.ts`, `constants.ts`,
`env.ts`).

### Jobs

A **Job** is an application-layer service invoked by composition
(not by a caller awaiting its result). It's a side-effect orchestrator:
chains several ports to do a unit of background work — typically
fire-and-forget from an HTTP handler after a Command completes.

- Naming: `<verb>-<noun>.job.ts`, class `<Verb><Noun>Job`.
- Single public method: `run(input)`. No return value of business
  significance (state mutation is the result).
- Errors are persisted as state, not thrown — the dispatcher
  doesn't await success.
- Lives under `src/application/jobs/`.

Jobs are distinct from Commands: a Command models a user intention
dispatched by a handler that awaits it; a Job models an internal
side-effect dispatched as fire-and-forget. Use a Job when no caller
needs the result and failure is recoverable via persisted state.

---

## 10. Value objects as classes with static factories

VOs (Slug, PromptName, ApiKeyName, VersionNumber, ApiKeyPlaintext)
are classes with `static parse()` for validation and
`static generate()` (when applicable). Replaces the prior
branded-string-type + free-helper pattern.

```ts
// src/domain/prompt/slug.vo.ts
import { CONSTANTS } from "./constants";
import { InvalidSlugError } from "./prompt.errors";

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export class Slug {
  private constructor(readonly value: string) {}

  static parse(input: string): Slug {
    if (!SLUG_REGEX.test(input)) throw new InvalidSlugError(input);
    return new Slug(input);
  }

  static generate(name: string): Slug {
    const cleaned = name
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, CONSTANTS.SLUG_MAX_LENGTH)
      .replace(/-+$/, "");
    return Slug.parse(cleaned || "prompt");
  }

  equals(other: Slug): boolean { return this.value === other.value; }
  toString(): string { return this.value; }
}
```

**Rule**: No `unique symbol` brands. No free `parseFoo` /
`generateFoo` functions in `domain/`. Always
`Foo.parse(input)` / `Foo.generate(input)`.

---

## 11. Design tokens + typography roles (frontend)

**Added in Pγ (2026-05-04).** Applies to all React components in
`src/frontend/`.

### 11.1 Design tokens (no hardcoded colors)

All colors in components must come from Tailwind utility classes
that map to CSS custom properties defined in `styles/globals.css`.
**No hex, no `rgb()`, no `oklch()` literals inline in JSX or
component CSS.**

The token layer has two tiers:

- **Shadcn semantic tokens** (existing): `bg-background`,
  `text-foreground`, `bg-card`, `border-border`,
  `bg-primary`/`text-primary-foreground`, `bg-destructive`,
  `text-muted-foreground`, etc.
- **prompteando semantic tokens** (Pγ): `bg-success-bg`,
  `text-success-fg`, `bg-warning-bg`/`text-warning-fg`,
  `bg-info-bg`/`text-info-fg`, `bg-diff-add-bg`/`text-diff-add-fg`,
  `bg-diff-del-bg`/`text-diff-del-fg`. Defined in
  `globals.css` `@theme` block.

```tsx
// ❌ Wrong — hardcoded color
<span className="bg-green-100 text-green-800">synced</span>

// ✅ Right — semantic token
<span className="bg-success-bg text-success-fg">synced</span>
```

**Exceptions**:
- Marketing-only inline color (e.g. brand logo SVG fill).
- Tailwind base palette names (`bg-blue-100`, `text-red-700`)
  ARE allowed for one-off decorative accents that don't have a
  semantic meaning (e.g. the hashed-color icon tile in
  `<PromptsListPage>`). When in doubt, define a token.

**Rule**: Any color that conveys state (success/warning/error/
info) or product semantics (diff/sync/template) must use a
`-fg`/`-bg` token. New tokens get added to `globals.css` first,
THEN used in components.

### 11.2 Typography roles

Three font families, each with a single canonical use:

| Token | Family | Use |
|---|---|---|
| `font-display` | Cal Sans | H1–H4, card titles (`<CardTitle>`), hero text, page titles. Line-height 1.1. |
| `font-sans` (default) | Numans | Body paragraphs, labels, button text, descriptions. Line-height 1.5 (browser default OK). |
| `font-mono` | Geist Mono | Code blocks, slugs, API keys, version SHAs, JSON, file paths, monospaced data tables. |

```tsx
// ✅ Right
<h1 className="font-display text-3xl font-semibold tracking-tight">
  Your Prompts
</h1>
<p className="text-muted-foreground text-sm">4 prompts · synced</p>
<code className="font-mono text-xs">my-prompt</code>

// ❌ Wrong — bold body text where a heading is meant
<p className="text-3xl font-bold">Your Prompts</p>

// ❌ Wrong — display font on body text
<p className="font-display text-sm">My description</p>
```

**Why fixed roles**: Cal Sans is a tight display face; using it
on body text reduces legibility. Numans is neutral and high-x-
height; using it on H1 looks weak. Geist Mono signals "this is
data, not prose."

**Rule**: H1–H4 always `font-display` (the global rule in
`index.css` already enforces this for actual `<h*>` tags; for
non-heading components rendering visually as a heading — like
`<CardTitle>` which is a `<div>` — apply `font-display`
explicitly).

### 11.3 Spacing scale

Use the Tailwind default scale (`gap-2`, `gap-3`, `gap-4`,
`gap-6`, `gap-8` and corresponding `p-*`). Per Pγ design brief
the canonical values for each context:

| Context | Class |
|---|---|
| Form fields stacked | `gap-4` (16px) |
| Page sections vertical | `gap-6` (24px) or `gap-8` (32px) |
| Card grid horizontal | `gap-3` or `gap-4` |
| Inside cards | `p-6` |
| Inside buttons (sm) | `px-3` |
| Inside buttons (default/xl) | `px-4` / `px-5` |
| Sidebar items | `px-3 py-2` |
| Page content padding | `px-6 py-8` |

**Rule**: No arbitrary spacing values like `gap-[18px]` or
`p-[27px]`. If the scale doesn't fit, propose a token addition
in PR review rather than escape-hatching.

---

## Validation

The retroactive enforcement of these conventions can be sanity-checked
with:

```sh
# (1) every use case is a class with execute()
grep -lE "^export class [A-Z][A-Za-z]+(Command|Query)" \
  src/application/{commands,queries}/*.command.ts \
  src/application/{commands,queries}/*.query.ts

# (2) no process.env outside env.ts
grep -rn "process.env" src/ | grep -v "infrastructure/config/env.ts"
# expect: empty

# (3) no inline crypto outside the adapter
grep -rn "crypto\.\(randomUUID\|getRandomValues\)" src/ \
  | grep -v "infrastructure/crypto/bun-crypto.adapter.ts"
# expect: empty

# (4) no branded-type unique symbol in domain
grep -rn "unique symbol" src/domain/
# expect: empty

# (5) no hardcoded hex/rgb/oklch colors in frontend components
# (Tailwind palette names like text-blue-700 are allowed; raw color
# literals in className/style attrs are not.)
grep -rnE 'className=.*"#[0-9a-fA-F]{3,8}"|style=\{\{.*(rgb|oklch|#[0-9a-fA-F])' src/frontend/
# expect: empty (or only marketing/brand SVGs)

# (6) Cal Sans + Numans + Geist Mono are loaded via @fontsource
grep -E '@fontsource/(cal-sans|numans|geist-mono)' styles/globals.css
# expect: 3 import lines
```
