import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { DB } from "@/infrastructure/persistence/db";
import { apiKeys } from "@/infrastructure/persistence/schema";
import { parseApiKeyName, type ApiKey } from "@/domain/api-key";

type Row = typeof apiKeys.$inferSelect;

function mapRow(row: Row): ApiKey {
  return {
    id: row.id,
    userId: row.userId,
    name: parseApiKeyName(row.name),
    prefix: row.prefix,
    keyHash: row.keyHash,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
  };
}

export class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly db: DB) {}

  async save(apiKey: ApiKey): Promise<void> {
    await this.db.insert(apiKeys).values({
      id: apiKey.id,
      userId: apiKey.userId,
      name: apiKey.name,
      prefix: apiKey.prefix,
      keyHash: apiKey.keyHash,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    });
  }

  async findById(userId: string, id: string): Promise<ApiKey | null> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findAllByUserId(userId: string): Promise<ApiKey[]> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));
    return rows.map(mapRow);
  }

  async setRevokedAt(
    userId: string,
    id: string,
    when: Date,
  ): Promise<boolean> {
    const result = await this.db
      .update(apiKeys)
      .set({ revokedAt: when })
      .where(and(eq(apiKeys.userId, userId), eq(apiKeys.id, id)))
      .returning({ id: apiKeys.id });
    return result.length > 0;
  }

  async countActiveByUserId(userId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
    return rows[0]?.value ?? 0;
  }
}
