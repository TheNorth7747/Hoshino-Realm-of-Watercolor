import { expect, test, type Page } from "@playwright/test";
import type { VfxHarness } from "../harness/vfx-main";

declare global {
  interface Window {
    __VFX_HARNESS__?: VfxHarness;
  }
}

const HARNESS_URL = "/tests/harness/vfx.html";

/** 收集页面级未处理异常与 console.error，供每个 smoke 复用。 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openHarness(page: Page): Promise<string[]> {
  const errors = watchErrors(page);
  await page.goto(HARNESS_URL);
  await page.waitForFunction(() => window.__VFX_HARNESS__?.stats().running === true, undefined, {
    timeout: 20_000,
  });
  return errors;
}

test("加载：harness 启动、canvas 非零、无异常、VFX 系统已挂载", async ({ page }) => {
  const errors = await openHarness(page);

  const box = await page.locator("#game-canvas").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  const stats = await page.evaluate(() => window.__VFX_HARNESS__?.stats() ?? null);
  expect(stats).not.toBeNull();
  expect(stats?.running).toBe(true);
  expect(stats?.errorCount).toBe(0);
  await expect(page.locator("#fatal-error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("节点触发：story:completed(tree) 生成花瓣且不超上限", async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const h = window.__VFX_HARNESS__;
    if (!h) return null;
    for (let i = 0; i < 20; i += 1) h.emitStoryCompleted("tree");
    return h.stats();
  });

  expect(result).not.toBeNull();
  expect(result?.treeBursts).toBe(20);
  expect(result?.petals.active).toBeGreaterThan(0);
  expect(result?.petals.active).toBeLessThanOrEqual(result?.petals.capacity ?? 0);
  expect(errors).toEqual([]);
});

test("移动染色反馈：连续 color:bloom 生成涟漪并保持数量上限", async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const h = window.__VFX_HARNESS__;
    if (!h) return null;
    // 模拟玩家沿主路线移动：每一步产生一次世界坐标染色反馈。
    for (let i = 0; i < 80; i += 1) {
      h.emitBloom(-8 + i * 0.1, 0, 20 - i * 0.5, 4, 2);
    }
    return h.stats();
  });

  expect(result).not.toBeNull();
  expect(result?.ripples.active).toBeGreaterThan(0);
  expect(result?.ripples.active).toBeLessThanOrEqual(result?.ripples.capacity ?? 0);
  expect(result?.ripples.peak).toBeLessThanOrEqual(result?.ripples.capacity ?? 0);
  expect(errors).toEqual([]);
});

test("结局：game:finished 不阻塞 VFX、不产生异常", async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const h = window.__VFX_HARNESS__;
    if (!h) return null;
    h.emitStoryCompleted("tree");
    h.emitGameFinished(320);
    return h.stats();
  });

  expect(result).not.toBeNull();
  expect(result?.treeBursts).toBe(1);
  expect(result?.petals.active).toBeGreaterThan(0);
  expect(result?.errorCount).toBe(0);
  expect(errors).toEqual([]);
});

test("重置：game:reset 清空粒子并保留统计", async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const h = window.__VFX_HARNESS__;
    if (!h) return null;
    h.emitStoryCompleted("tree");
    h.emitBloom(0, 0, -22, 12, 2);
    const before = h.stats();
    h.reset();
    return { before, after: h.stats() };
  });

  expect(result).not.toBeNull();
  expect(result?.before.petals.active).toBeGreaterThan(0);
  expect(result?.before.ripples.active).toBeGreaterThan(0);
  expect(result?.after.petals.active).toBe(0);
  expect(result?.after.ripples.active).toBe(0);
  expect(result?.after.resets).toBe(1);
  expect(result?.after.errorCount).toBe(0);
  expect(errors).toEqual([]);
});

test("生命周期：step 推进后粒子回收，不无限增长", async ({ page }) => {
  const errors = await openHarness(page);
  const result = await page.evaluate(() => {
    const h = window.__VFX_HARNESS__;
    if (!h) return null;
    h.emitBloom(0, 0, 8, 4, 0.5);
    const before = h.stats();
    h.step(1.0);
    return { before, after: h.stats() };
  });

  expect(result).not.toBeNull();
  expect(result?.before.ripples.active).toBe(1);
  expect(result?.after.ripples.active).toBe(0);
  expect(errors).toEqual([]);
});

test("主应用：真实 index 页面加载无未处理异常", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  const stats = await page.evaluate(() => {
    const bridge = (
      window as unknown as { __STARWATER__?: { game: { getSnapshot(): { errorCount: number } } } }
    ).__STARWATER__;
    return bridge?.game.getSnapshot() ?? null;
  });
  expect(stats?.errorCount).toBe(0);
  await expect(page.locator("#fatal-error")).toBeHidden();
  expect(errors).toEqual([]);
});
