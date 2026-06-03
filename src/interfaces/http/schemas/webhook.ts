import { z } from "zod";

export const createWebhookSchema = z.object({
  url: z.url().max(2000),
  events: z.array(z.enum(["version.created", "label.assigned"])).min(1),
});

export type CreateWebhookBody = z.infer<typeof createWebhookSchema>;
