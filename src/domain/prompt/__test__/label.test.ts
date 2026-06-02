import { describe, expect, test } from "bun:test";
import { InvalidLabelError } from "../prompt.errors";
import { Label } from "../label.vo";

describe("Label", () => {
  test("parses valid labels and lowercases", () => {
    expect(Label.parse("production").value).toBe("production");
    expect(Label.parse("Staging").value).toBe("staging");
    expect(Label.parse("v2-beta").value).toBe("v2-beta");
  });

  test("flags the virtual latest label", () => {
    expect(Label.parse("latest").isVirtualLatest).toBe(true);
    expect(Label.parse("production").isVirtualLatest).toBe(false);
  });

  test("rejects invalid labels", () => {
    expect(() => Label.parse("")).toThrow(InvalidLabelError);
    expect(() => Label.parse("-bad")).toThrow(InvalidLabelError);
    expect(() => Label.parse("has space")).toThrow(InvalidLabelError);
    expect(() => Label.parse("UPPER_score")).toThrow(InvalidLabelError);
  });
});
