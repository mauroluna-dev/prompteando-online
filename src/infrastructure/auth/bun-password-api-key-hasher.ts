import type { ApiKeyHasher } from "@/application/ports/api-key-hasher";

export class BunPasswordApiKeyHasher implements ApiKeyHasher {
  async hash(plaintext: string): Promise<string> {
    return Bun.password.hash(plaintext, { algorithm: "argon2id" });
  }

  async verify(plaintext: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plaintext, hash);
  }
}
