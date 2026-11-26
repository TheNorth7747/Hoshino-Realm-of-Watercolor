import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * M3 放行验收（V0.3 极简无对话自由探索）：
 *   - 三个地标按 flower → stream → tree 可触发，无弹窗对话遮挡
 *   - 花树完成后进入 finished 状态（2.5s 后触发结局）
 *   - 重置按钮与 R 键可完整复位探索进度与染色遮罩，支持二次通关
 */

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-controls-hint")).toBeVisible();
  await page.waitForTimeout(400);
}

async function clickNode(page: Page, nodeId: string): Promise<void> {
  await page.locator(`.sw-debug__button[data-node="${nodeId}"]`).click();
  await page.waitForTimeout(400);
}

async function readExploreState(page: Page) {
  return page.evaluate(() => {
    const story = window.__STARWATER__?.game.getSystem("story") as unknown as
      { getState(): { step: string; visited: string[]; finished: boolean } } | undefined;
    return story?.getState() ?? { step: "unknown", visited: [], finished: false };
  });
}

async function maskCoverage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const reveal = bridge?.game.getSystem("reveal") as unknown as
      { colorRevealMask: { surface: { readRevealCoverage(): number } } | null } | undefined;
    return reveal?.colorRevealMask?.surface.readRevealCoverage() ?? -1;
  });
}

test("M3：三节点自由探索闭环、无弹窗遮挡与重置", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_NETWORK_CHANGED")) {
      errors.push(`console: ${message.text()}`);
    }
  });

  await boot(page);

  // 1) 初始状态：无弹窗、无遮罩
  const initialState = await readExploreState(page);
  expect(initialState.step).toBe("intro");
  expect(initialState.visited).toEqual([]);
  await expect(page.locator(".sw-dialogue")).toHaveCount(0);
  const initialCoverage = await maskCoverage(page);
  expect(initialCoverage).toBeGreaterThanOrEqual(0);

  // 2) 节点一：蓝花坡
  await clickNode(page, "flower");
  expect((await readExploreState(page)).visited).toContain("flower");

  // 3) 节点二：溪流
  await clickNode(page, "stream");
  expect((await readExploreState(page)).visited).toContain("stream");

  // 4) 节点三：花树 → 2.5s 后 finished
  await clickNode(page, "tree");
  expect((await readExploreState(page)).step).toBe("finished");
  await expect
    .poll(async () => (await readExploreState(page)).finished, { timeout: 45_000 })
    .toBe(true);

  // 5) 点击极简 HUD 重置按钮：探索进度清零、染色回到开场基线
  const coverageBeforeReset = await maskCoverage(page);
  await page.locator('.sw-minimal-btn[data-action="reset"]').click();
  await page.waitForTimeout(600);
  const resetState = await readExploreState(page);
  expect(resetState.step).toBe("intro");
  expect(resetState.visited).toEqual([]);
  expect(resetState.finished).toBe(false);

  const coverageAfterReset = await maskCoverage(page);
  expect(Math.abs(coverageAfterReset - initialCoverage)).toBeLessThan(0.006);
  expect(coverageAfterReset).toBeLessThan(coverageBeforeReset);

  // 6) 重置后可再次探索
  await clickNode(page, "flower");
  expect((await readExploreState(page)).visited).toEqual(["flower"]);

  expect(errors).toEqual([]);
});

test("M3：极简自由探索调试面板按钮取自共享配置（AC-12）", async ({ page }) => {
  await boot(page);
  const buttonLabels = await page.locator(".sw-debug__button[data-node]").allTextContents();
  expect(buttonLabels.length).toBeGreaterThanOrEqual(3);
  expect(buttonLabels.join("")).not.toContain("undefined");
});
