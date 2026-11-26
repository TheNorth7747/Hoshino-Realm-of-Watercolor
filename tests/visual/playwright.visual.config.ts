import { defineConfig } from "@playwright/test";

/**
 * V0.2 视觉截图专用配置（Agent 4）。
 *
 * - 真实硬件加速 Google Chrome（channel=chrome，不注入 --use-angle=swiftshader），
 *   让五组对照截图反映真 GPU 下玩家实际看到的画面。
 * - 1280×720，符合 V02_VISUAL_WORKFLOW 4.4 的截图规格。
 * - 独立 testDir，不会被 `npm run test:e2e`（testDir=tests/e2e）收集，
 *   因此既有 32 个 AC 用例数量不变。
 * - 截图产物写入 test-results/visual-v02/（.gitignore 已忽略整个 test-results/），
 *   参考视频与抽帧一律不提交 Git。
 */
const PORT = 5176;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "../../test-results/visual-v02/artifacts",
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: "off",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    cwd: process.cwd(),
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
