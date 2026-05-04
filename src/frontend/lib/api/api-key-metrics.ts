import type { MetricsRangeValue, MetricsSummary } from "@/domain/api-key";

const credentials: RequestCredentials = "same-origin";

export async function getApiKeyMetrics(
  keyId: string,
  range: MetricsRangeValue,
  options: { includeStatusBreakdown?: boolean } = {},
): Promise<MetricsSummary> {
  const params = new URLSearchParams({ range });
  if (options.includeStatusBreakdown) params.set("include", "status-breakdown");
  const res = await fetch(
    `/api/keys/${encodeURIComponent(keyId)}/metrics?${params.toString()}`,
    { credentials },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? `Failed to load metrics (${res.status})`);
  }
  return res.json();
}
