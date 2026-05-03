import { describe, test, expect } from "bun:test";
import { VersionNumber } from "@/domain/prompt-version/version-number.vo";
import { InvalidVersionNumberError } from "@/domain/prompt-version/prompt-version.errors";

describe("VersionNumber.parse", () => {
  test("accepts positive integers", () => {
    expect(VersionNumber.parse(1).value).toBe(1);
    expect(VersionNumber.parse(42).value).toBe(42);
  });

  test("rejects zero", () => {
    expect(() => VersionNumber.parse(0)).toThrow(InvalidVersionNumberError);
  });

  test("rejects negatives", () => {
    expect(() => VersionNumber.parse(-1)).toThrow(InvalidVersionNumberError);
  });

  test("rejects floats", () => {
    expect(() => VersionNumber.parse(1.5)).toThrow(InvalidVersionNumberError);
  });

  test("rejects NaN", () => {
    expect(() => VersionNumber.parse(NaN)).toThrow(InvalidVersionNumberError);
  });
});

describe("VersionNumber.parseFromString", () => {
  test("parses '1'", () => {
    expect(VersionNumber.parseFromString("1").value).toBe(1);
  });

  test("rejects 'abc'", () => {
    expect(() => VersionNumber.parseFromString("abc")).toThrow(InvalidVersionNumberError);
  });

  test("rejects '0'", () => {
    expect(() => VersionNumber.parseFromString("0")).toThrow(InvalidVersionNumberError);
  });
});
