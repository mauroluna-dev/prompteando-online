import { describe, expect, test } from "bun:test";
import { mapCommitError } from "../map-commit-error";

function err(status: number, message = "github says no"): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

describe("mapCommitError", () => {
  test("401 → token_invalid", () => {
    expect(mapCommitError(err(401)).code).toBe("token_invalid");
  });

  test("403 with secondary rate limit message → rate_limited", () => {
    expect(
      mapCommitError(err(403, "You have triggered an abuse detection mechanism — secondary rate limit")).code,
    ).toBe("rate_limited");
  });

  test("403 with generic rate limit phrasing → rate_limited", () => {
    expect(mapCommitError(err(403, "API rate limit exceeded")).code).toBe(
      "rate_limited",
    );
  });

  test("403 with scope-related message → insufficient_scope", () => {
    expect(
      mapCommitError(err(403, "Resource not accessible by integration")).code,
    ).toBe("insufficient_scope");
  });

  test("404 → repo_missing", () => {
    expect(mapCommitError(err(404)).code).toBe("repo_missing");
  });

  test("409 → transient", () => {
    expect(mapCommitError(err(409, "is at...")).code).toBe("transient");
  });

  test("422 → transient", () => {
    expect(mapCommitError(err(422, "Validation Failed")).code).toBe("transient");
  });

  test("500 → transient", () => {
    expect(mapCommitError(err(500)).code).toBe("transient");
  });

  test("502 → transient", () => {
    expect(mapCommitError(err(502)).code).toBe("transient");
  });

  test("400 → unknown", () => {
    expect(mapCommitError(err(400, "Bad Request")).code).toBe("unknown");
  });

  test("non-Error input → unknown", () => {
    expect(mapCommitError("nope").code).toBe("unknown");
    expect(mapCommitError(null).code).toBe("unknown");
  });

  test("includes the original message", () => {
    const m = mapCommitError(err(500, "boom"));
    expect(m.message).toBe("boom");
  });
});
