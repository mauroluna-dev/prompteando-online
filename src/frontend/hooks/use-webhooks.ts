import useSWR from "swr";
import { listWebhooks, type WebhookView } from "@/frontend/lib/api/webhooks";

export function useWebhooks() {
  return useSWR<WebhookView[]>("/api/webhooks", listWebhooks);
}
