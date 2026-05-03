import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      ".husky",
      "build.ts",
      "drizzle.config.ts",
      "scripts",
      "bun-env.d.ts",
      "src/frontend",
    ],
  },
  ...tseslint.configs.strict,
  sonarjs.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },
);
