import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { ApiKeyHasher } from "@/application/ports/api-key-hasher";
import {
  ApiKeyQuotaExceededError,
  extractApiKeyPrefix,
  generateApiKeyPlaintext,
  parseApiKeyName,
  type ApiKey,
} from "@/domain/api-key";

export const API_KEY_QUOTA = 10;

export type CreateApiKeyInput = {
  userId: string;
  name: string;
};

export type CreateApiKeyResult = {
  apiKey: ApiKey;
  plaintext: string;
};

export class CreateApiKeyCommand {
  constructor(
    private readonly repo: ApiKeyRepository,
    private readonly hasher: ApiKeyHasher,
  ) {}

  async execute(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const name = parseApiKeyName(input.name);

    const activeCount = await this.repo.countActiveByUserId(input.userId);
    if (activeCount >= API_KEY_QUOTA) {
      throw new ApiKeyQuotaExceededError(API_KEY_QUOTA);
    }

    const plaintext = generateApiKeyPlaintext();
    const prefix = extractApiKeyPrefix(plaintext);
    const keyHash = await this.hasher.hash(plaintext);

    const apiKey: ApiKey = {
      id: crypto.randomUUID(),
      userId: input.userId,
      name,
      prefix,
      keyHash,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date(),
    };
    await this.repo.save(apiKey);
    return { apiKey, plaintext };
  }
}
