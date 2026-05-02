import { z } from "zod";

export const createPromptSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional(),
});

export type CreatePromptBody = z.infer<typeof createPromptSchema>;
