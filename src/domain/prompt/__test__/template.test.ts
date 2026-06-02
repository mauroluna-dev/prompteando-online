import { describe, expect, test } from "bun:test";
import { CONSTANTS } from "../constants";
import {
  InvalidTemplateVariableNameError,
  TooManyTemplateVariablesError,
} from "../prompt.errors";
import { extractTemplateVariables } from "../template-parser";
import { renderTemplate } from "../template-renderer";
import { TemplateVariableName } from "../template-variable-name.vo";

describe("extractTemplateVariables", () => {
  test("extracts vars, deduped, in order of appearance", () => {
    const content = "Hola {{nombre}}, sobre {{producto}}. Chau {{nombre}}.";
    expect(extractTemplateVariables(content)).toEqual(["nombre", "producto"]);
  });

  test("trims whitespace inside braces", () => {
    expect(extractTemplateVariables("a {{ x }} b")).toEqual(["x"]);
  });

  test("ignores names with spaces (not a valid var)", () => {
    expect(extractTemplateVariables("hi {{ nombre cliente }}")).toEqual([]);
  });

  test("returns empty for content without vars", () => {
    expect(extractTemplateVariables("nada que sustituir")).toEqual([]);
  });

  test("throws when exceeding MAX_TEMPLATE_VARS", () => {
    const tooMany = Array.from(
      { length: CONSTANTS.MAX_TEMPLATE_VARS + 1 },
      (_v, i) => `{{v${i}}}`,
    ).join(" ");
    expect(() => extractTemplateVariables(tooMany)).toThrow(
      TooManyTemplateVariablesError,
    );
  });
});

describe("renderTemplate", () => {
  test("substitutes every occurrence and reports varsUsed", () => {
    const r = renderTemplate("Hola {{n}}, {{n}}!", { n: "Ana" });
    expect(r.content).toBe("Hola Ana, Ana!");
    expect(r.varsUsed).toEqual(["n"]);
    expect(r.missingVars).toEqual([]);
  });

  test("leaves missing vars literal and reports them", () => {
    const r = renderTemplate("{{a}} y {{b}}", { a: "x" });
    expect(r.content).toBe("x y {{b}}");
    expect(r.varsUsed).toEqual(["a"]);
    expect(r.missingVars).toEqual(["b"]);
  });

  test("content without vars is returned unchanged", () => {
    const r = renderTemplate("sin vars", {});
    expect(r.content).toBe("sin vars");
    expect(r.varsUsed).toEqual([]);
    expect(r.missingVars).toEqual([]);
  });
});

describe("TemplateVariableName", () => {
  test("parses a valid name", () => {
    expect(TemplateVariableName.parse("user_name").value).toBe("user_name");
  });

  test("rejects empty, too long, or invalid charset", () => {
    expect(() => TemplateVariableName.parse("")).toThrow(
      InvalidTemplateVariableNameError,
    );
    expect(() => TemplateVariableName.parse("a b")).toThrow(
      InvalidTemplateVariableNameError,
    );
    expect(() =>
      TemplateVariableName.parse("x".repeat(CONSTANTS.MAX_VAR_NAME_LENGTH + 1)),
    ).toThrow(InvalidTemplateVariableNameError);
  });
});
