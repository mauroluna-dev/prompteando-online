import type { MetricsCounter } from "@/application/ports/metrics-counter.port";

type Clock = { now(): Date };

const defaultClock: Clock = { now: () => new Date() };

/**
 * P18 — Record one API key hit (request to /v1/prompts/:slug).
 *
 * Best-effort: any backend failure is logged and swallowed. The
 * public endpoint MUST NOT fail because metrics broke.
 *
 * Day key is computed from the clock as UTC ISO date so all rows
 * are comparable across regions.
 */
export class RecordApiKeyHitCommand {
  constructor(
    private readonly metrics: MetricsCounter,
    private readonly clock: Clock = defaultClock,
  ) {}

  async execute(
    apiKeyId: string,
    slug: string,
    statusCode: number,
    latencyMs: number,
  ): Promise<void> {
    const day = this.clock.now().toISOString().slice(0, 10);
    try {
      await this.metrics.recordHit({
        apiKeyId,
        slug,
        statusCode,
        latencyMs,
        day,
      });
    } catch (err) {
      console.error("[record-api-key-hit]", err);
    }
  }
}
