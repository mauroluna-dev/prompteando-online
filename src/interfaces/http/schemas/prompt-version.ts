import { z } from "zod";
import { CONSTANTS } from "@/domain/prompt";

export const saveVersionSchema = z.object({
  content: z.string().max(100_000),
  type: z.enum(["text", "chat"]).default("text"),
  commitMessage: z.string().trim().max(200).optional(),
});

export type SaveVersionBody = z.infer<typeof saveVersionSchema>;

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.string().optional(),
  name: z.string().optional(),
});

// P19 — body for POST /v1/prompts/:slug/render and the session
// render-preview. `vars` values are capped (anti-abuse).
export const renderPromptSchema = z.object({
  vars: z
    .record(z.string(), z.string().max(CONSTANTS.MAX_VAR_VALUE_LENGTH))
    .default({}),
  version: z.number().int().positive().optional(),
  label: z.string().max(CONSTANTS.MAX_LABEL_LENGTH).optional(),
  placeholders: z.record(z.string(), z.array(chatMessageSchema)).optional(),
});

export const assignLabelSchema = z.object({
  versionNumber: z.number().int().positive(),
});

export type RenderPromptBody = z.infer<typeof renderPromptSchema>;
