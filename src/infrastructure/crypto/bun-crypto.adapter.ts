import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { CryptoPort } from "@/application/ports/crypto.port";
import { env } from "@/infrastructure/config/env";

const AES_KEY_BYTES = 32;
const AES_IV_BYTES = 12;

export class BunCryptoAdapter implements CryptoPort {
  private readonly encryptionKey: Buffer;

  constructor() {
    const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
    if (key.length !== AES_KEY_BYTES) {
      throw new Error(
        `ENCRYPTION_KEY must decode to ${AES_KEY_BYTES} bytes (got ${key.length})`,
      );
    }
    this.encryptionKey = key;
  }

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

  encrypt(plain: string): string {
    const iv = randomBytes(AES_IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const ct = Buffer.concat([
      cipher.update(plain, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) {
      throw new Error("Malformed ciphertext: expected <iv>:<ct>:<tag>");
    }
    const [ivB64, ctB64, tagB64] = parts as [string, string, string];
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]);
    return pt.toString("utf8");
  }
}
