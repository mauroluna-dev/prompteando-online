import { z } from "zod";

export const saveVersionSchema = z.object({
  content: z.string().max(100_000),
  commitMessage: z.string().trim().max(200).optional(),
});

export type SaveVersionBody = z.infer<typeof saveVersionSchema>;
