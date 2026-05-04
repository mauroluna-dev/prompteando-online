import { describe, expect, mock, test } from "bun:test";
import { RecordApiKeyHitCommand } from "@/application/commands/record-api-key-hit.command";
import type { MetricsCounter } from "@/application/ports/metrics-counter.port";

function makeMetrics(): MetricsCounter & {
  recordHit: ReturnType<typeof mock>;
} {
  return {
    recordHit: mock(async () => {}),
    readDay: mock(async () => null),
    clearDay: mock(async () => {}),
  } as unknown as MetricsCounter & { recordHit: ReturnType<typeof mock> };
}

describe("RecordApiKeyHitCommand", () => {
  test("computes day from clock as UTC ISO date", async () => {
    const metrics = makeMetrics();
    const cmd = new RecordApiKeyHitCommand(metrics, {
      now: () => new Date("2026-05-04T03:14:15Z"),
    });

    await cmd.execute("k1", "my-prompt", 200, 87);

    expect(metrics.recordHit).toHaveBeenCalledTimes(1);
    expect(metrics.recordHit.mock.calls[0]?.[0]).toEqual({
      apiKeyId: "k1",
      slug: "my-prompt",
      statusCode: 200,
      latencyMs: 87,
      day: "2026-05-04",
    });
  });

  test("swallows backend errors (best-effort)", async () => {
    const metrics: MetricsCounter = {
      recordHit: mock(async () => {
        throw new Error("redis down");
      }),
      readDay: mock(async () => null),
      clearDay: mock(async () => {}),
    };
    const cmd = new RecordApiKeyHitCommand(metrics);

    // Must not throw — the public endpoint cannot fail because
    // metrics broke.
    await expect(cmd.execute("k1", "p", 200, 1)).resolves.toBeUndefined();
  });
});
