// Barrel of aggregate schemas. Sub-files added per phase:
//   P3  → auth.ts (users, accounts, sessions, verificationTokens)
//   P6  → prompts.ts
//   P7  → prompt-versions.ts
//   P8  → api-keys.ts
//   P10 → user-github-connection.ts
//
// db.ts importa este barrel completo para habilitar relaciones
// type-safe en drizzle({ schema }).
export * from "./auth";
export * from "./prompts";
export * from "./prompt-versions";
export * from "./prompt-labels";
export * from "./api-keys";
export * from "./api-key-metrics";
export * from "./user-github-connection";
export * from "./webhooks";
