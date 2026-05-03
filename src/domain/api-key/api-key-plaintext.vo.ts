import { CONSTANTS } from "./constants";
import { InvalidApiKeyError } from "./api-key.errors";

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export class ApiKeyPlaintext {
  private constructor(readonly value: string) {}

  static fromRandomBytes(bytes: Uint8Array): ApiKeyPlaintext {
    if (bytes.length !== CONSTANTS.RANDOM_BYTES) {
      throw new InvalidApiKeyError(
        `random bytes must be ${CONSTANTS.RANDOM_BYTES} long`,
      );
    }
    return new ApiKeyPlaintext(CONSTANTS.PREFIX + bytesToHex(bytes));
  }

  static parse(input: string): ApiKeyPlaintext {
    if (
      input.length !== CONSTANTS.PLAINTEXT_LENGTH ||
      !input.startsWith(CONSTANTS.PREFIX)
    ) {
      throw new InvalidApiKeyError("malformed");
    }
    return new ApiKeyPlaintext(input);
  }

  extractPrefix(): string {
    return this.value.slice(0, CONSTANTS.PREFIX_LENGTH);
  }

  toString(): string {
    return this.value;
  }
}
