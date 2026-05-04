import { InvalidMetricsRangeError } from "./api-key.errors";

export type MetricsRangeValue = "7d" | "30d" | "90d";

const VALUES: Record<MetricsRangeValue, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * P18 — Range filter for the metrics dashboard. Capped at 90d to
 * match the Postgres retention (METRICS_DAILY_RETENTION_DAYS).
 */
export class MetricsRange {
  private constructor(
    readonly value: MetricsRangeValue,
    readonly days: number,
  ) {}

  static parse(input: string): MetricsRange {
    if (input in VALUES) {
      const value = input as MetricsRangeValue;
      return new MetricsRange(value, VALUES[value]);
    }
    throw new InvalidMetricsRangeError(input);
  }
}
