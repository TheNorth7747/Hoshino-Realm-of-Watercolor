import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * A0 浏览器 smoke 基线。A6 在此基础上补 AC-01～12 的验收用例。
 * WebGL 在无头环境下走 SwiftShader，保证 CI/本机都能跑通渲染 smoke。
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
