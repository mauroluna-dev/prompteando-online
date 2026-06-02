import { z } from "zod";
import { CONSTANTS } from "@/domain/prompt";

export const saveVersionSchema = z.object({
  content: z.string().max(100_000),
  commitMessage: z.string().trim().max(200).optional(),
});

export type SaveVersionBody = z.infer<typeof saveVersionSchema>;

// P19 — body for POST /v1/prompts/:slug/render and the session
// render-preview. `vars` values are capped (anti-abuse).
export const renderPromptSchema = z.object({
  vars: z
    .record(z.string(), z.string().max(CONSTANTS.MAX_VAR_VALUE_LENGTH))
    .default({}),
  version: z.number().int().positive().optional(),
  label: z.string().max(CONSTANTS.MAX_LABEL_LENGTH).optional(),
});

export const assignLabelSchema = z.object({
  versionNumber: z.number().int().positive(),
});

export type RenderPromptBody = z.infer<typeof renderPromptSchema>;
