import { CONSTANTS } from "./constants";
import { InvalidLabelError } from "./prompt.errors";

/**
 * A deploy label / alias for a prompt version (e.g. `production`,
 * `staging`, or custom). `latest` is reserved as a virtual label that
 * always resolves to the current version — it is never stored.
 */
export class Label {
  private constructor(readonly value: string) {}

  static parse(input: string): Label {
    const v = input.trim().toLowerCase();
    if (v.length > CONSTANTS.MAX_LABEL_LENGTH || !CONSTANTS.LABEL_PATTERN.test(v)) {
      throw new InvalidLabelError(input);
    }
    return new Label(v);
  }

  get isVirtualLatest(): boolean {
    return this.value === CONSTANTS.VIRTUAL_LATEST_LABEL;
  }

  equals(other: Label): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
