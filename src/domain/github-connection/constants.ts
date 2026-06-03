export const CONSTANTS = {
  REQUIRED_SCOPES: ["repo"],
  CONNECTION_METHODS: ["oauth", "pat"] as const,
  OAUTH_STATE_TTL_SECONDS: 600,
  REPO_DESCRIPTION: "Prompts versionados con prompteando",
  DEFAULT_BRANCH: "main",
  REPO_NAME_PREFIX: "prompteando-",
  BACKFILL_PROGRESS_POLL_MS: 2_000,
  BACKFILL_AUTHOR_EMAIL_DOMAIN: "users.noreply.github.com",
  BACKFILL_FATAL_ERRORS: [
    "token_invalid",
    "insufficient_scope",
    "repo_missing",
  ] as const,
  README_TEMPLATE: `# prompteando

Prompts versionados con [prompteando.online](https://prompteando.online).

Este repo es un espejo de los prompts que creás en tu dashboard de
prompteando. Cada vez que guardás, se commitea una nueva versión del
prompt afectado en \`prompts/<slug>.md\`.

Podés desconectarlo cuando quieras desde la configuración de
prompteando — tus datos se quedan acá igual.
`,
} as const;

/** How the user authorized the GitHub integration. */
export type GitHubConnectionMethod =
  (typeof CONSTANTS.CONNECTION_METHODS)[number];
