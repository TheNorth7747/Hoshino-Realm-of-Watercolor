import { defineConfig } from "vitest/config";

/**
 * A0 单元测试基线（纯逻辑，不启动浏览器）。
 * 模块级测试由 A1～A4 放在各自目录或 `src/tests/`；A0 的最小 smoke 在 `tests/unit/`。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    reporters: "default",
    passWithNoTests: false,
  },
});
