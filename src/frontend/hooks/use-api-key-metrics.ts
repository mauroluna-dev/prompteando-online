import useSWR from "swr";
import type { MetricsRangeValue, MetricsSummary } from "@/domain/api-key";
import { getApiKeyMetrics } from "@/frontend/lib/api/api-key-metrics";

/**
 * P18 — Fetch the metrics summary for one API key over a range.
 * Pass `keyId === null` to skip the fetch (e.g. when the row is
 * collapsed and we don't want to load metrics yet).
 */
export function useApiKeyMetrics(
  keyId: string | null,
  range: MetricsRangeValue,
  options: { includeStatusBreakdown?: boolean } = {},
) {
  const includeFlag = options.includeStatusBreakdown ? "1" : "0";
  return useSWR<MetricsSummary>(
    keyId ? `/api/keys/${keyId}/metrics?range=${range}&inc=${includeFlag}` : null,
    () =>
      keyId
        ? getApiKeyMetrics(keyId, range, options)
        : Promise.reject(new Error("no key")),
  );
}
