// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  { files: ["**/*.mjs"], languageOptions: { globals: { process: "readonly", window: "readonly", navigator: "readonly", HTMLCanvasElement: "readonly", document: "readonly", innerWidth: "readonly", Path2D: "readonly" } } },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
