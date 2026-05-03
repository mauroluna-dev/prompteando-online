import type { ApiKeyRepository } from "@/application/ports/api-key-repository.port";
import type { CryptoPort } from "@/application/ports/crypto.port";
import {
  ApiKeyPlaintext,
  InvalidApiKeyError,
  MissingAuthorizationHeaderError,
  type ApiKey,
} from "@/domain/api-key";

const BEARER_PREFIX = "Bearer ";

export class AuthenticateApiKeyQuery {
  constructor(
    private readonly repo: ApiKeyRepository,
    private readonly crypto: CryptoPort,
  ) {}

  async execute(authorizationHeader: string | null): Promise<ApiKey> {
    if (!authorizationHeader || !authorizationHeader.startsWith(BEARER_PREFIX)) {
      throw new MissingAuthorizationHeaderError();
    }
    const raw = authorizationHeader.slice(BEARER_PREFIX.length).trim();
    const plaintext = ApiKeyPlaintext.parse(raw);

    const candidate = await this.repo.findByPrefix(plaintext.extractPrefix());
    if (!candidate || candidate.isRevoked) {
      throw new InvalidApiKeyError("not found or revoked");
    }

    const ok = await this.crypto.verifyPassword(
      plaintext.value,
      candidate.keyHash,
    );
    if (!ok) throw new InvalidApiKeyError("hash mismatch");

    return candidate;
  }
}
