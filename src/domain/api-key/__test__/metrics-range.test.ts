import { describe, expect, test } from "bun:test";
import {
  InvalidMetricsRangeError,
  MetricsRange,
} from "@/domain/api-key";

describe("MetricsRange", () => {
  test.each([
    ["7d", 7],
    ["30d", 30],
    ["90d", 90],
  ] as const)("parses %s → %d days", (input, days) => {
    const range = MetricsRange.parse(input);
    expect(range.value).toBe(input);
    expect(range.days).toBe(days);
  });

  test("rejects unknown values", () => {
    expect(() => MetricsRange.parse("1d")).toThrow(InvalidMetricsRangeError);
    expect(() => MetricsRange.parse("")).toThrow(InvalidMetricsRangeError);
    expect(() => MetricsRange.parse("30")).toThrow(InvalidMetricsRangeError);
  });
});
