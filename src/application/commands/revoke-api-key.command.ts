import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import {
  ApiKeyAlreadyRevokedError,
  ApiKeyNotFoundError,
} from "@/domain/api-key";

export class RevokeApiKeyCommand {
  constructor(private readonly repo: ApiKeyRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    const apiKey = await this.repo.findById(userId, id);
    if (!apiKey) throw new ApiKeyNotFoundError(id);
    if (apiKey.isRevoked) throw new ApiKeyAlreadyRevokedError(id);

    const updated = await this.repo.setRevokedAt(userId, id, new Date());
    if (!updated) throw new ApiKeyNotFoundError(id);
  }
}
