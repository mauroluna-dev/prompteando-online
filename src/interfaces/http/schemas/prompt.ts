import { z } from "zod";
import { CONSTANTS } from "@/domain/prompt";

export const createPromptSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
});

export type CreatePromptBody = z.infer<typeof createPromptSchema>;

// P19 — body for PATCH /api/prompts/:slug/template. Both fields
// optional; missing meta sub-fields default to null.
export const templateSettingsSchema = z.object({
  isTemplate: z.boolean().optional(),
  varMeta: z
    .record(
      z.string(),
      z.object({
        description: z.string().max(500).nullable().default(null),
        default: z
          .string()
          .max(CONSTANTS.MAX_VAR_VALUE_LENGTH)
          .nullable()
          .default(null),
      }),
    )
    .optional(),
});

export type TemplateSettingsBody = z.infer<typeof templateSettingsSchema>;
