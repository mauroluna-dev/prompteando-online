import type { ApiKey } from "@/domain/api-key";

export interface ApiKeyRepository {
  save(apiKey: ApiKey): Promise<void>;
  findById(userId: string, id: string): Promise<ApiKey | null>;
  /**
   * Public API authentication path: lookup by the indexed prefix.
   * Hash verification happens in the application layer.
   */
  findByPrefix(prefix: string): Promise<ApiKey | null>;
  findAllByUserId(userId: string): Promise<ApiKey[]>;
  /**
   * Marks the key as revoked. Returns true if a row was updated,
   * false if no matching key existed for the user.
   */
  setRevokedAt(userId: string, id: string, when: Date): Promise<boolean>;
  countActiveByUserId(userId: string): Promise<number>;
  /**
   * P18 — All active key IDs across all users. Used by the
   * metrics consolidate cron to iterate keys that may have hits
   * to consolidate. Returns just IDs (no full entity) to keep the
   * scan cheap on large key tables.
   */
  findAllActiveIds(): Promise<string[]>;
}
