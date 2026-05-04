export const CONSTANTS = {
  REQUIRED_SCOPES: ["repo"],
  OAUTH_STATE_TTL_SECONDS: 600,
  REPO_DESCRIPTION: "Versioned prompts managed by promptstash",
  DEFAULT_BRANCH: "main",
  README_TEMPLATE: `# promptstash

Versioned prompts managed by [promptstash](https://promptstash.app).

This repo mirrors the prompts you create in your promptstash dashboard.
Each save commits a new version of the affected prompt under
\`prompts/<slug>.md\`.

Disconnect at any time from your promptstash settings — your data lives
here either way.
`,
} as const;
