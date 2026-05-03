import { InvalidVersionNumberError } from "./prompt-version.errors";

export class VersionNumber {
  private constructor(readonly value: number) {}

  static parse(input: number): VersionNumber {
    if (!Number.isInteger(input) || input < 1) {
      throw new InvalidVersionNumberError(input);
    }
    return new VersionNumber(input);
  }

  static parseFromString(input: string): VersionNumber {
    const n = Number(input);
    if (Number.isNaN(n)) throw new InvalidVersionNumberError(input);
    return VersionNumber.parse(n);
  }

  next(): VersionNumber {
    return new VersionNumber(this.value + 1);
  }

  equals(other: VersionNumber): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return String(this.value);
  }
}
