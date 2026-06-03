import { z } from "zod";

/**
 * P26 — Body for connecting the GitHub integration via a fine-grained
 * PAT scoped to a single repo. `repoFullName` must be `owner/repo`.
 */
export const connectGithubTokenSchema = z.object({
  token: z.string().trim().min(1, "Pegá el token que generaste en GitHub."),
  repoFullName: z
    .string()
    .trim()
    .regex(
      /^[\w.-]+\/[\w.-]+$/,
      "Usá el formato owner/repo (por ejemplo tu-usuario/mis-prompts).",
    ),
});

export type ConnectGithubTokenBody = z.infer<typeof connectGithubTokenSchema>;
