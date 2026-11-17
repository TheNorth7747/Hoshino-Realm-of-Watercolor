import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * A6 性能与稳定性采集（PRD AC-09 / AC-10 / 11.1 / 11.2）。
 *
 * 设计：
 * - 通过环境变量 A6_SAMPLE_SEC 控制采样时长，默认 30s；A6 验收令其 = 600 做真实 10 分钟稳定性。
 * - 只从共享调试桥 `window.__STARWATER__.game.getSnapshot()` 读取真实数值，不改业务代码。
 * - 记录采集设备信息、FPS 分布、drawCalls / triangles 峰值、运行时长与错误数。
 * - 断言 PRD 11.1 预算（drawCalls ≤ 180、triangles ≤ 350k）且无未处理异常。
 * - 结果写入 test-results/a6-perf-record.json，供 A6 汇总为性能记录。
 */
interface Sample {
  readonly t: number;
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly elapsedSeconds: number;
  readonly errorCount: number;
}

const DURATION_SEC = Number(process.env["A6_SAMPLE_SEC"] ?? "30");
const TAG = process.env["A6_SAMPLE_TAG"] ?? "short";

test(`A6 性能与稳定性采集（${DURATION_SEC}s / ${TAG}）`, async ({ page }, testInfo) => {
  test.setTimeout((DURATION_SEC + 120) * 1000);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-hud__shards")).toBeVisible();

  const device = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    webgl: (() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const debug = gl?.getExtension("WEBGL_debug_renderer_info");
      return debug ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : "n/a";
    })(),
  }));

  const samples: Sample[] = [];
  const started = Date.now();
  await page.keyboard.down("KeyW");
  while (Date.now() - started < DURATION_SEC * 1000) {
    await page.waitForTimeout(1000);
    const snap = await page.evaluate(
      () => window.__STARWATER__?.game.getSnapshot() ?? (null as never),
    );
    if (snap) {
      samples.push({
        t: Number(((Date.now() - started) / 1000).toFixed(2)),
        fps: snap.fps,
        frameTimeMs: snap.frameTimeMs,
        drawCalls: snap.drawCalls,
        triangles: snap.triangles,
        elapsedSeconds: snap.elapsedSeconds,
        errorCount: snap.errorCount,
      });
    }
  }
  await page.keyboard.up("KeyW");

  const fpsSorted = samples.map((s) => s.fps).sort((a, b) => a - b);
  const medianFps = fpsSorted[Math.floor(fpsSorted.length / 2)] ?? 0;
  const lowFps = fpsSorted[0] ?? 0;
  const maxDrawCalls = Math.max(0, ...samples.map((s) => s.drawCalls));
  const maxTriangles = Math.max(0, ...samples.map((s) => s.triangles));
  const maxErrorCount = Math.max(0, ...samples.map((s) => s.errorCount));

  const node = await import("node:os");
  const record = {
    tag: TAG,
    durationSec: DURATION_SEC,
    sampleCount: samples.length,
    host: {
      platform: node.platform(),
      release: node.release(),
      cpuModel: node.cpus()[0]?.model ?? "n/a",
      cpuCount: node.cpus().length,
      totalMemoryGiB: Number((node.totalmem() / 1073741824).toFixed(1)),
      nodeVersion: process.version,
    },
    browser: device,
    metrics: {
      medianFps,
      lowFps,
      maxDrawCalls,
      maxTriangles,
      maxErrorCount,
      budgetDrawCalls: 180,
      budgetTriangles: 350_000,
    },
    samples,
    errors,
  };

  const outPath = path.join(process.cwd(), "test-results", `a6-perf-${TAG}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2), "utf8");
  await testInfo.attach(`a6-perf-${TAG}.json`, {
    body: JSON.stringify(record, null, 2),
    contentType: "application/json",
  });

  console.log(
    `A6_PERF_SUMMARY(${TAG}) ` +
      JSON.stringify({
        sampleCount: samples.length,
        medianFps,
        lowFps,
        maxDrawCalls,
        maxTriangles,
        maxErrorCount,
        errors: errors.length,
      }),
  );

  expect(samples.length).toBeGreaterThan(0);
  expect(maxDrawCalls).toBeLessThanOrEqual(180);
  expect(maxTriangles).toBeLessThanOrEqual(350_000);
  expect(maxErrorCount).toBe(0);
  expect(errors).toEqual([]);
});
