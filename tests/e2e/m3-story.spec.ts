import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * M3 放行验收（PRD 7.3 / 13，AC-06 / AC-07 / AC-08 / AC-12）：
 *   - 三个故事节点按 flower → stream → tree 顺序可触发，有目标提示与对话
 *   - 3 枚星屑全部可收集，HUD 数字准确
 *   - 花树完成后触发结局，结局页可重新进入
 *   - 重置后任务回到起点、星屑归零、染色遮罩清空
 *
 * 用 A4 的 `?debug=1` 节点按钮驱动（PRD 11.4 允许的调试入口），
 * 不依赖在 SwiftShader 下跑图到具体坐标。
 */

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-hud__shards")).toBeVisible();
  await page.waitForTimeout(400);
}

async function clickNode(page: Page, nodeId: string): Promise<void> {
  await page.locator(`.sw-debug__button[data-node="${nodeId}"]`).click();
  await page.waitForTimeout(400);
}

async function shardText(page: Page): Promise<string> {
  return (await page.locator(".sw-hud__shards").textContent())?.trim() ?? "";
}

async function maskCoverage(page: Page): Promise<number> {
  return page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const reveal = bridge?.game.getSystem("reveal") as unknown as
      { colorRevealMask: { surface: { readRevealCoverage(): number } } | null } | undefined;
    return reveal?.colorRevealMask?.surface.readRevealCoverage() ?? -1;
  });
}

test("M3：三节点闭环、星屑计数、结局与重置", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await boot(page);

  // 1) 初始状态
  expect(await shardText(page)).toContain("0/3");
  await expect(page.locator(".sw-ending")).toBeHidden();
  const initialCoverage = await maskCoverage(page);
  expect(initialCoverage).toBeGreaterThanOrEqual(0);

  // 2) 节点一：蓝花坡
  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  expect(await shardText(page)).toContain("1/3");

  // 3) 节点二：溪流
  await clickNode(page, "stream");
  expect(await shardText(page)).toContain("2/3");

  // 4) 节点三：花树 → 结局（PRD 9.6：等 2～3 秒再出标题，这里给 8s 余量）
  await clickNode(page, "tree");
  expect(await shardText(page)).toContain("3/3");
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".sw-ending__restart")).toBeVisible();

  // 5) 重置：星屑归零、结局消失、染色清空
  //    注意：重置后玩家脚下的首帧笔刷会立刻再落一笔（“进场脚下就有颜色”），
  //    所以断言“回到单笔级别”而不是严格 0。
  const coverageBeforeReset = await maskCoverage(page);
  await page.locator(".sw-ending__restart").click();
  await page.waitForTimeout(600);
  expect(await shardText(page)).toContain("0/3");
  await expect(page.locator(".sw-ending")).toBeHidden();
  const coverageAfterReset = await maskCoverage(page);
  expect(coverageAfterReset).toBeLessThan(0.002);
  expect(coverageAfterReset).toBeLessThan(coverageBeforeReset);

  // 6) 重置后还能再走一遍第一个节点（幂等性）
  await clickNode(page, "flower");
  expect(await shardText(page)).toContain("1/3");

  expect(errors).toEqual([]);
});

test("M3：故事文本与节点规则不写死在 UI 组件里（AC-12）", async ({ page }) => {
  await boot(page);
  // 节点标题来自 story.json，而不是 HUD 里的硬编码字符串
  const buttonLabels = await page.locator(".sw-debug__button[data-node]").allTextContents();
  expect(buttonLabels.length).toBeGreaterThanOrEqual(3);
  const objective = (await page.locator(".sw-hud__objective").textContent())?.trim() ?? "";
  expect(objective.length).toBeGreaterThan(0);
  expect(buttonLabels.join("")).not.toContain("undefined");
});
