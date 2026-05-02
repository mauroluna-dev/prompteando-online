export const API_KEY_PREFIX = "ps_live_";
export const API_KEY_RANDOM_BYTES = 16; // → 32 hex chars
export const API_KEY_PLAINTEXT_LENGTH =
  API_KEY_PREFIX.length + API_KEY_RANDOM_BYTES * 2; // 8 + 32 = 40
export const API_KEY_PREFIX_LENGTH = API_KEY_PREFIX.length + 8; // 16

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

export function generateApiKeyPlaintext(): string {
  const bytes = new Uint8Array(API_KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  return API_KEY_PREFIX + bytesToHex(bytes);
}

export function extractApiKeyPrefix(plaintext: string): string {
  return plaintext.slice(0, API_KEY_PREFIX_LENGTH);
}
