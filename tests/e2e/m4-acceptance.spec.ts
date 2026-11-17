import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * M4 放行验收（PRD 7.3 / 13，AC-09 / AC-10 / AC-11）：
 *   - 花树完成 → 花瓣爆发，数量受上限约束，生命周期结束后回收（AC-09 无泄漏）
 *   - color:bloom → 涟漪，reset 清空粒子
 *   - 连续游玩时渲染预算不越界，并留下可复现的性能记录（AC-10）
 *   - 调试面板能读到 vfx 统计（AC-11）
 */

interface VfxStatsLike {
  readonly petals: { readonly active: number; readonly capacity: number; readonly peak: number };
  readonly ripples: { readonly active: number; readonly capacity: number; readonly peak: number };
  readonly treeBursts: number;
  readonly resets: number;
}

type VfxLike = { stats: VfxStatsLike | null };

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-hud__shards")).toBeVisible();
  await page.waitForTimeout(400);
}

async function vfxStats(page: Page): Promise<VfxStatsLike | null> {
  return page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const vfx = bridge?.game.getSystem("effects-vfx") as unknown as VfxLike | undefined;
    return vfx?.stats ?? null;
  });
}

async function clickNode(page: Page, nodeId: string): Promise<void> {
  await page.locator(`.sw-debug__button[data-node="${nodeId}"]`).click();
  await page.waitForTimeout(350);
}

test("M4：花树完成触发花瓣，受上限约束并回收", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await boot(page);
  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  await page.waitForTimeout(1200);

  const burst = await vfxStats(page);
  expect(burst).not.toBeNull();
  expect(burst?.treeBursts).toBe(1);
  expect(burst?.petals.active ?? 0).toBeGreaterThan(0);
  expect(burst?.petals.peak ?? 0).toBeLessThanOrEqual(burst?.petals.capacity ?? 0);

  // 花瓣寿命默认 4s（±25%），等 7s 后必须全部回收
  await page.waitForTimeout(7000);
  const settled = await vfxStats(page);
  expect(settled?.petals.active).toBe(0);
  expect(settled?.petals.peak ?? 0).toBeLessThanOrEqual(settled?.petals.capacity ?? 0);

  expect(errors).toEqual([]);
});

test("M4：color:bloom 触发涟漪，reset 清空粒子", async ({ page }) => {
  await boot(page);
  await clickNode(page, "flower");
  await page.waitForTimeout(300);

  const withRipple = await vfxStats(page);
  expect(withRipple).not.toBeNull();
  expect(withRipple?.ripples.peak ?? 0).toBeGreaterThan(0);
  expect(withRipple?.ripples.peak ?? 0).toBeLessThanOrEqual(withRipple?.ripples.capacity ?? 0);

  await page.evaluate(() => window.__STARWATER__?.game.reset());
  await page.waitForTimeout(500);

  const afterReset = await vfxStats(page);
  expect(afterReset?.petals.active).toBe(0);
  expect(afterReset?.ripples.active).toBe(0);
  expect(afterReset?.resets ?? 0).toBeGreaterThanOrEqual(1);
});

test("M4：连续游玩 10 秒的性能记录与预算", async ({ page }, testInfo) => {
  await boot(page);

  const samples: Array<{ fps: number; drawCalls: number; triangles: number }> = [];
  await page.keyboard.down("KeyW");
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(1000);
    const snapshot = await page.evaluate(() => window.__STARWATER__?.game.getSnapshot() ?? null);
    if (snapshot) {
      samples.push({
        fps: snapshot.fps,
        drawCalls: snapshot.drawCalls,
        triangles: snapshot.triangles,
      });
    }
  }
  await page.keyboard.up("KeyW");

  expect(samples.length).toBe(10);
  const maxDrawCalls = Math.max(...samples.map((sample) => sample.drawCalls));
  const maxTriangles = Math.max(...samples.map((sample) => sample.triangles));
  const medianFps = [...samples.map((sample) => sample.fps)].sort((a, b) => a - b)[5] ?? 0;

  // PRD 11.1 预算
  expect(maxDrawCalls).toBeLessThanOrEqual(180);
  expect(maxTriangles).toBeLessThanOrEqual(350_000);

  await testInfo.attach("m4-perf-record.json", {
    body: JSON.stringify(
      {
        note:
          "headless Chromium + SwiftShader（软件光栅化），FPS 不代表真机；" +
          "AC-10 的 55FPS 目标必须在集成机真 GPU 上复测。",
        samples,
        maxDrawCalls,
        maxTriangles,
        medianFps,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("M4：调试面板可读到 vfx 统计（AC-11）", async ({ page }) => {
  await boot(page);
  await clickNode(page, "tree").catch(() => undefined);
  await page.waitForTimeout(600);

  const debugRoot = page.locator("#debug-root");
  await expect(debugRoot).toBeVisible();
  await expect(debugRoot).toContainText("vfx.petals");
  await expect(debugRoot).toContainText("vfx.treeBursts");
});
