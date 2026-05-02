import { InvalidVersionNumberError } from "./errors";

declare const __brand: unique symbol;
export type VersionNumber = number & { readonly [__brand]: "VersionNumber" };

export function parseVersionNumber(input: number): VersionNumber {
  if (!Number.isInteger(input) || input < 1) {
    throw new InvalidVersionNumberError(input);
  }
  return input as VersionNumber;
}

export function parseVersionNumberFromString(input: string): VersionNumber {
  const n = Number(input);
  if (Number.isNaN(n)) throw new InvalidVersionNumberError(input);
  return parseVersionNumber(n);
}
