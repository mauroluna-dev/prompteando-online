import type { CryptoPort } from "@/application/ports/crypto.port";

export class BunCryptoAdapter implements CryptoPort {
  randomUUID(): string {
    return crypto.randomUUID();
  }

  randomBytes(n: number): Uint8Array {
    const bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  async hashPassword(plain: string): Promise<string> {
    return Bun.password.hash(plain, { algorithm: "argon2id" });
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plain, hash);
  }
}
