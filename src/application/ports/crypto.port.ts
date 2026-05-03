export interface CryptoPort {
  randomUUID(): string;
  randomBytes(n: number): Uint8Array;
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
}
