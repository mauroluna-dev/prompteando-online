import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { CryptoPort } from "@/application/ports/crypto.port";
import {
  ApiKey,
  ApiKeyName,
  ApiKeyPlaintext,
  ApiKeyQuotaExceededError,
  CONSTANTS,
} from "@/domain/api-key";

export type CreateApiKeyResult = {
  apiKey: ApiKey;
  plaintext: string;
};

export class CreateApiKeyCommand {
  constructor(
    private readonly repo: ApiKeyRepository,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(userId: string, name: string): Promise<CreateApiKeyResult> {
    const apiKeyName = ApiKeyName.parse(name);

    const activeCount = await this.repo.countActiveByUserId(userId);
    if (activeCount >= CONSTANTS.QUOTA_PER_USER) {
      throw new ApiKeyQuotaExceededError(CONSTANTS.QUOTA_PER_USER);
    }

    const plaintext = ApiKeyPlaintext.fromRandomBytes(
      this.crypto.randomBytes(CONSTANTS.RANDOM_BYTES),
    );
    const keyHash = await this.crypto.hashPassword(plaintext.value);

    const apiKey = ApiKey.create(
      this.crypto.randomUUID(),
      userId,
      apiKeyName,
      plaintext.extractPrefix(),
      keyHash,
      new Date(),
    );
    await this.repo.save(apiKey);
    return { apiKey, plaintext: plaintext.value };
  }
}
