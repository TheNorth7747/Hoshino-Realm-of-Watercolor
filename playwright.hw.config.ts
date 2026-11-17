import { defineConfig } from "@playwright/test";

/**
 * AC-10 真机性能复测配置（硬件加速，非 SwiftShader）。
 *
 * 与 playwright.config.ts 的区别：
 * - channel=chrome：使用系统安装的真实 Google Chrome，而非 Playwright 自带 chromium。
 * - 不传 --use-angle=swiftshader；让 ANGLE 走系统真 GPU（D3D11）。
 * - 1920×1080 视口，匹配 AC-10 的分辨率条件；DPR 由运行时 DPR_CAP=1.5 收敛。
 * 只用于性能采集；功能 smoke 仍用默认配置。
 */
const PORT = 5175;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/hardware",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    trace: "off",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
