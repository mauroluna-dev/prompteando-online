import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
} from "@/domain/api-key";

export type RevokeApiKeyInput = {
  userId: string;
  id: string;
};

export class RevokeApiKeyCommand {
  constructor(private readonly repo: ApiKeyRepository) {}

  async execute(input: RevokeApiKeyInput): Promise<void> {
    const apiKey = await this.repo.findById(input.userId, input.id);
    if (!apiKey) throw new ApiKeyNotFoundError(input.id);
    if (apiKey.revokedAt !== null) {
      throw new ApiKeyAlreadyRevokedError(input.id);
    }

    const updated = await this.repo.setRevokedAt(
      input.userId,
      input.id,
      new Date(),
    );
    if (!updated) throw new ApiKeyNotFoundError(input.id);
  }
}
