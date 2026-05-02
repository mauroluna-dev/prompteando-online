import type { ApiKeyHasher } from "@/application/ports/api-key-hasher";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import {
  API_KEY_PLAINTEXT_LENGTH,
  API_KEY_PREFIX,
  InvalidApiKeyError,
  MissingAuthorizationHeaderError,
  extractApiKeyPrefix,
  type ApiKey,
} from "@/domain/api-key";

const BEARER_PREFIX = "Bearer ";
// "ps_live_" + 32 lowercase hex chars
const PLAINTEXT_PATTERN = /^ps_live_[a-f0-9]{32}$/;

export class AuthenticateApiKeyQuery {
  constructor(
    private readonly repo: ApiKeyRepository,
    private readonly hasher: ApiKeyHasher,
  ) {}

  async execute(authorizationHeader: string | null): Promise<ApiKey> {
    if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
      throw new MissingAuthorizationHeaderError();
    }
    const plaintext = authorizationHeader.slice(BEARER_PREFIX.length).trim();

    if (
      plaintext.length !== API_KEY_PLAINTEXT_LENGTH ||
      !plaintext.startsWith(API_KEY_PREFIX) ||
      !PLAINTEXT_PATTERN.test(plaintext)
    ) {
      throw new InvalidApiKeyError("malformed");
    }

    const prefix = extractApiKeyPrefix(plaintext);
    const candidate = await this.repo.findByPrefix(prefix);
    if (!candidate || candidate.revokedAt !== null) {
      throw new InvalidApiKeyError("not found or revoked");
    }

    const ok = await this.hasher.verify(plaintext, candidate.keyHash);
    if (!ok) throw new InvalidApiKeyError("hash mismatch");

    return candidate;
  }
}
