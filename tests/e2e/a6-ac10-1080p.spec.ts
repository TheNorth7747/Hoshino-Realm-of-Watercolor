import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * A6 / AC-10 分辨率达标采集（PRD 3.2 AC-10 / 11.2）。
 *
 * 用 1920×1080 视口 + DPR 上限由运行时配置（DPR_CAP=1.5）收敛，贴近 AC-10 的分辨率条件；
 * 但渲染后端仍是 headless Chromium + SwiftShader 软件光栅化，无法代表集成机真 GPU，
 * 因此本用例只记录真实数值与预算断言，不宣称 AC-10 的 55/30 FPS 目标已达成。
 */
test("A6 / AC-10：1920×1080 性能采样与预算断言", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });

  const device = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      devicePixelRatio: window.devicePixelRatio,
      webglRenderer: debug ? String(gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "n/a",
    };
  });
  expect(device.viewport.width).toBe(1920);
  expect(device.viewport.height).toBe(1080);

  const samples: Array<{
    fps: number;
    frameTimeMs: number;
    drawCalls: number;
    triangles: number;
  }> = [];
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(1000);
    const snap = await page.evaluate(
      () => window.__STARWATER__?.game.getSnapshot() ?? (null as never),
    );
    if (snap) {
      samples.push({
        fps: snap.fps,
        frameTimeMs: snap.frameTimeMs,
        drawCalls: snap.drawCalls,
        triangles: snap.triangles,
      });
    }
  }
  await page.keyboard.up("KeyW");

  const fpsSorted = samples.map((s) => s.fps).sort((a, b) => a - b);
  const medianFps = fpsSorted[Math.floor(fpsSorted.length / 2)] ?? 0;
  const lowFps = fpsSorted[0] ?? 0;
  const maxDrawCalls = Math.max(0, ...samples.map((s) => s.drawCalls));
  const maxTriangles = Math.max(0, ...samples.map((s) => s.triangles));

  const record = {
    note:
      "headless Chromium + SwiftShader 软件光栅化；分辨率达标但后端非真 GPU，" +
      "AC-10 的 55/30 FPS 目标必须在集成机真 GPU 上复测后方可判定。",
    device,
    samples,
    medianFps,
    lowFps,
    maxDrawCalls,
    maxTriangles,
    ac10: {
      resolution: "1920x1080",
      dprCap: 1.5,
      targetMedianFps: 55,
      targetLowFps: 30,
      medianPassOnThisBackend: medianFps >= 55,
      lowPassOnThisBackend: lowFps >= 30,
      verdict: "需在集成机真 GPU 复测；本软件渲染结果不作通过依据",
    },
    errors,
  };

  const outPath = path.join(process.cwd(), "test-results", "a6-ac10-1080p.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2), "utf8");
  await testInfo.attach("a6-ac10-1080p.json", {
    body: JSON.stringify(record, null, 2),
    contentType: "application/json",
  });

  console.log(
    `A6_AC10_1080P ` +
      JSON.stringify({
        viewport: device.viewport,
        webglRenderer: device.webglRenderer,
        medianFps,
        lowFps,
        maxDrawCalls,
        maxTriangles,
        errors: errors.length,
      }),
  );

  expect(samples.length).toBe(12);
  expect(maxDrawCalls).toBeLessThanOrEqual(180);
  expect(maxTriangles).toBeLessThanOrEqual(350_000);
  expect(errors).toEqual([]);
});
