import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { ApiKey } from "@/domain/api-key";

export class ListApiKeysForUserQuery {
  constructor(private readonly repo: ApiKeyRepository) {}

  async execute(userId: string): Promise<ApiKey[]> {
    return this.repo.findAllByUserId(userId);
  }
}
