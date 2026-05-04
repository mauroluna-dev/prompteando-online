import { and, asc, between, eq, lt, sql } from "drizzle-orm";
import type { ApiKeyMetricsRepository } from "@/application/ports/api-key-metrics-repository.port";
import { ApiKeyMetricsDaily } from "@/domain/api-key";
import type { DB } from "@/infrastructure/persistence/db";
import { apiKeyMetricsDaily } from "@/infrastructure/persistence/schema";

export class PostgresApiKeyMetricsRepository
  implements ApiKeyMetricsRepository
{
  constructor(private readonly db: DB) {}

  async upsert(daily: ApiKeyMetricsDaily): Promise<void> {
    const values = {
      apiKeyId: daily.apiKeyId,
      day: daily.day,
      totalRequests: daily.totalRequests,
      totalErrors: daily.totalErrors,
      p50Ms: daily.p50Ms,
      p95Ms: daily.p95Ms,
      topPrompts: [...daily.topPrompts],
      consolidatedAt: daily.consolidatedAt,
    };
    await this.db
      .insert(apiKeyMetricsDaily)
      .values(values)
      .onConflictDoUpdate({
        target: [apiKeyMetricsDaily.apiKeyId, apiKeyMetricsDaily.day],
        set: {
          totalRequests: values.totalRequests,
          totalErrors: values.totalErrors,
          p50Ms: values.p50Ms,
          p95Ms: values.p95Ms,
          topPrompts: values.topPrompts,
          consolidatedAt: values.consolidatedAt,
        },
      });
  }

  async findRange(
    apiKeyId: string,
    fromDay: string,
    toDay: string,
  ): Promise<ApiKeyMetricsDaily[]> {
    const rows = await this.db
      .select()
      .from(apiKeyMetricsDaily)
      .where(
        and(
          eq(apiKeyMetricsDaily.apiKeyId, apiKeyId),
          between(apiKeyMetricsDaily.day, fromDay, toDay),
        ),
      )
      .orderBy(asc(apiKeyMetricsDaily.day));
    return rows.map((r) =>
      ApiKeyMetricsDaily.fromRow({
        apiKeyId: r.apiKeyId,
        day: r.day,
        totalRequests: r.totalRequests,
        totalErrors: r.totalErrors,
        p50Ms: r.p50Ms,
        p95Ms: r.p95Ms,
        topPrompts: r.topPrompts,
        consolidatedAt: r.consolidatedAt,
      }),
    );
  }

  async deleteOlderThan(retentionDays: number): Promise<number> {
    // CURRENT_DATE - INTERVAL '<n> days' computed in SQL so we
    // don't have to roundtrip the cutoff from JS (and so retention
    // is consistent with whatever the DB clock says).
    const cutoff = sql<string>`CURRENT_DATE - (${retentionDays}::int * INTERVAL '1 day')`;
    const result = await this.db
      .delete(apiKeyMetricsDaily)
      .where(lt(apiKeyMetricsDaily.day, cutoff))
      .returning({ apiKeyId: apiKeyMetricsDaily.apiKeyId });
    return result.length;
  }
}
