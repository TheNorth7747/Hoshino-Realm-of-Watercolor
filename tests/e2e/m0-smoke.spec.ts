import { expect, test } from "@playwright/test";
import type { StarwaterBridge } from "../../src/core/contracts";

declare global {
  interface Window {
    __STARWATER__?: StarwaterBridge;
  }
}

test("M0 smoke：空场景加载、渲染、无未处理异常", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });

  const canvas = page.locator("#game-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  const snapshot = await page.evaluate(() => window.__STARWATER__?.game.getSnapshot() ?? null);
  expect(snapshot).not.toBeNull();
  expect(snapshot?.running).toBe(true);
  // V0.3 极简探索挂载表
  expect(snapshot?.systems).toEqual([
    "player",
    "story",
    "ui-hud",
    "ui-debug",
    "reveal",
    "world",
    "effects-vfx",
    "audio",
    "camera",
  ]);
  expect(snapshot?.errorCount).toBe(0);

  await expect(page.locator("#fatal-error")).toBeHidden();
  await expect(page.locator("#boot-status")).toBeHidden();

  // 渲染循环在推进：等一会儿 elapsedSeconds 与 Draw Calls 必须有真实数值。
  await page.waitForTimeout(600);
  const later = await page.evaluate(() => window.__STARWATER__?.game.getSnapshot() ?? null);
  expect(later?.elapsedSeconds ?? 0).toBeGreaterThan(0);
  expect(later?.drawCalls ?? 0).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test("M0 smoke：?debug=1 显示调试面板，默认不显示", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator("#debug-root")).toBeHidden();

  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });

  const debugRoot = page.locator("#debug-root");
  await expect(debugRoot).toBeVisible();
  await expect(debugRoot).toContainText("FPS");
  await expect(debugRoot).toContainText("Draw Calls");
  await expect(debugRoot).toContainText("已挂载系统");
});

test("M0 smoke：game:reset 事件可达，重置后运行时长归零", async ({ page }) => {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });

  const result = await page.evaluate(() => {
    const bridge = window.__STARWATER__;
    if (!bridge) return { fired: -1, elapsed: -1 };

    let fired = 0;
    const unsubscribe = bridge.game.events.on("game:reset", () => {
      fired += 1;
    });
    bridge.game.reset();
    unsubscribe();

    return { fired, elapsed: bridge.game.getSnapshot().elapsedSeconds };
  });

  expect(result.fired).toBe(1);
  expect(result.elapsed).toBe(0);
});
