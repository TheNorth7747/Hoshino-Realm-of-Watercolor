import { expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * AC-10 真机性能复测（PRD 3.2 AC-10 / 11.2）。
 *
 * 硬性门禁：必须先确认 WebGL renderer 不是 SwiftShader / software rasterizer，
 * 否则测试直接失败——绝不允许用软件渲染的 ~20 FPS 冒充真机结论。
 * 采集并记录 PRD 要求的全部字段，采样时长由 A6_HW_SAMPLE_SEC 控制（默认 30s，验收时 60s）。
 */
const DURATION_SEC = Number(process.env["A6_HW_SAMPLE_SEC"] ?? "30");

function gitHash(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

test(`AC-10 真机性能复测（${DURATION_SEC}s，硬件加速 Chrome）`, async ({ page }, testInfo) => {
  test.setTimeout((DURATION_SEC + 180) * 1000);

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    // 浏览器自动请求 /favicon.ico 的 404 与游戏逻辑无关（index.html 未声明 favicon，
    // 且 index.html 属 A0 共享文件，RC 分支不改）。精确排除这一条，其余错误照样捕获。
    if (message.location()?.url?.endsWith("/favicon.ico")) return;
    errors.push(`console: ${message.text()}`);
  });

  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });

  // 读取真实渲染设备 / 浏览器 / DPR / 分辨率
  const device = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return { webgl2: false, renderer: "none", vendor: "none" };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      webgl2: true,
      renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "n/a",
      vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : "n/a",
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio,
      width: window.innerWidth,
      height: window.innerHeight,
    };
  });

  // 门禁 1：WebGL2 必须可用
  expect(device.webgl2).toBe(true);
  // 门禁 2：渲染设备必须是真 GPU，不得是 SwiftShader / 软件光栅化
  const renderer = String(device.renderer);
  expect(renderer.toLowerCase()).not.toMatch(/swiftshader|software|llvmpipe|softpipe/);

  const samples: Array<{
    fps: number;
    frameTimeMs: number;
    drawCalls: number;
    triangles: number;
  }> = [];
  const started = Date.now();
  await page.keyboard.down("KeyW");
  while (Date.now() - started < DURATION_SEC * 1000) {
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
    commitHash: gitHash(),
    device: {
      cpu: os.cpus()[0]?.model ?? "n/a",
      cpuCount: os.cpus().length,
      gpuRenderer: renderer,
      gpuVendor: String(device.vendor),
      memoryGiB: Number((os.totalmem() / 1073741824).toFixed(1)),
      browserUserAgent: String(device.userAgent),
      resolution: `${device.width}x${device.height}`,
      dpr: device.dpr,
      platform: `${os.platform()} ${os.release()}`,
      nodeVersion: process.version,
    },
    sampleDurationSec: DURATION_SEC,
    sampleCount: samples.length,
    metrics: {
      medianFps,
      lowFps,
      maxDrawCalls,
      maxTriangles,
    },
    ac10: {
      targetMedianFps: 55,
      targetLowFps: 30,
      budgetDrawCalls: 180,
      budgetTriangles: 350_000,
      medianPass: medianFps >= 55,
      lowPass: lowFps >= 30,
      verdict: medianFps >= 55 && lowFps >= 30 ? "PASS" : "FAIL",
    },
    samples,
    runtimeErrors: errors,
  };

  const outPath = path.join(process.cwd(), "test-results", "rc-ac10-hardware.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2), "utf8");
  await testInfo.attach("rc-ac10-hardware.json", {
    body: JSON.stringify(record, null, 2),
    contentType: "application/json",
  });

  // eslint-disable-next-line no-console
  console.log("AC10_HW " + JSON.stringify({
    commit: record.commitHash,
    gpu: renderer,
    resolution: record.device.resolution,
    dpr: device.dpr,
    durationSec: DURATION_SEC,
    medianFps,
    lowFps,
    maxDrawCalls,
    maxTriangles,
    verdict: record.ac10.verdict,
  }));

  // 预算断言（PRD 11.1）——这是硬阈值，不放宽
  expect(samples.length).toBeGreaterThan(0);
  expect(maxDrawCalls).toBeLessThanOrEqual(180);
  expect(maxTriangles).toBeLessThanOrEqual(350_000);
  expect(errors).toEqual([]);

  // AC-10 真机 FPS 门禁：不达标则本用例失败并保留性能证据（不软化、不跳过）
  expect(medianFps, `AC-10 中位 FPS 未达标：${medianFps} < 55`).toBeGreaterThanOrEqual(55);
  expect(lowFps, `AC-10 低帧 FPS 未达标：${lowFps} < 30`).toBeGreaterThanOrEqual(30);
});
