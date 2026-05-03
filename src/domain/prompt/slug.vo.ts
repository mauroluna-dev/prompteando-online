import { CONSTANTS } from "./constants";
import { InvalidSlugError } from "./prompt.errors";

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export class Slug {
  private constructor(readonly value: string) {}

  static parse(input: string): Slug {
    if (!SLUG_REGEX.test(input)) throw new InvalidSlugError(input);
    return new Slug(input);
  }

  static generate(name: string): Slug {
    // Single-pass cleanup avoids regex backtracking on adversarial
    // input: lowercase a-z and 0-9 are kept verbatim; spaces /
    // underscores collapse to a single hyphen; everything else is
    // dropped. Result is trimmed of leading/trailing hyphens and
    // bounded to SLUG_MAX_LENGTH.
    const lower = name.toLowerCase();
    const out: string[] = [];
    let lastWasHyphen = true;
    for (const ch of lower) {
      if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
        out.push(ch);
        lastWasHyphen = false;
      } else if (ch === " " || ch === "\t" || ch === "_" || ch === "-") {
        if (!lastWasHyphen) {
          out.push("-");
          lastWasHyphen = true;
        }
      }
    }
    while (out.length > 0 && out.at(-1) === "-") out.pop();
    const cleaned = out.join("").slice(0, CONSTANTS.SLUG_MAX_LENGTH);
    const trimmed = cleaned.endsWith("-") ? cleaned.slice(0, -1) : cleaned;
    return Slug.parse(trimmed || "prompt");
  }

  equals(other: Slug): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
