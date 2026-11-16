import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * A0 质量基线。
 * `no-explicit-any` 设为 error：共享契约不允许用 any 逃逸类型检查。
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "no-console": ["warn", { allow: ["info", "warn", "error", "debug"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  prettier,
);
