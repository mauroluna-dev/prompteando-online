import { describe, test, expect } from "bun:test";
import {
  parseVersionNumber,
  parseVersionNumberFromString,
} from "@/domain/prompt-version/version-number";
import { InvalidVersionNumberError } from "@/domain/prompt-version/errors";

describe("parseVersionNumber", () => {
  test("accepts positive integers", () => {
    expect<number>(parseVersionNumber(1)).toBe(1);
    expect<number>(parseVersionNumber(42)).toBe(42);
  });

  test("rejects zero", () => {
    expect(() => parseVersionNumber(0)).toThrow(InvalidVersionNumberError);
  });

  test("rejects negatives", () => {
    expect(() => parseVersionNumber(-1)).toThrow(InvalidVersionNumberError);
  });

  test("rejects floats", () => {
    expect(() => parseVersionNumber(1.5)).toThrow(InvalidVersionNumberError);
  });

  test("rejects NaN", () => {
    expect(() => parseVersionNumber(NaN)).toThrow(InvalidVersionNumberError);
  });
});

describe("parseVersionNumberFromString", () => {
  test("parses '1'", () => {
    expect<number>(parseVersionNumberFromString("1")).toBe(1);
  });

  test("rejects 'abc'", () => {
    expect(() => parseVersionNumberFromString("abc")).toThrow(InvalidVersionNumberError);
  });

  test("rejects '0'", () => {
    expect(() => parseVersionNumberFromString("0")).toThrow(InvalidVersionNumberError);
  });
});
