import { describe, expect, test } from "bun:test";
import { applyIncludes, extractIncludes } from "../composition";

describe("composition", () => {
  test("extractIncludes finds {{>slug}} refs, deduped", () => {
    expect(
      extractIncludes("a {{>header}} b {{> footer }} c {{>header}}"),
    ).toEqual(["header", "footer"]);
  });

  test("ignores plain {{vars}}", () => {
    expect(extractIncludes("hola {{nombre}}")).toEqual([]);
  });

  test("applyIncludes substitutes resolved bodies and leaves unknowns", () => {
    const out = applyIncludes("{{>header}}\n{{>missing}}", {
      header: "HOLA",
    });
    expect(out).toBe("HOLA\n{{>missing}}");
  });
});
