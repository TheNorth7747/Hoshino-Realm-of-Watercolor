import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { DebugSnapshot } from "../../src/core/contracts";

// `window.__STARWATER__` / `__STARWATER_REVEAL__` / `__STARWATER_REVEAL_STATE__`
// 的全局类型由 src/main.ts 与 src/rendering/devHarness.ts 声明，这里不再重复声明。

async function bootHarness(page: Page): Promise<void> {
  let lastError: unknown = null;
  // Vite 首次发现新依赖（three/examples/jsm/postprocessing/*）会整页 reload，
  // 销毁执行上下文并让 addScriptTag 抛错；重试即可（第二次依赖已预构建）。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto("/?debug=1");
      await page.addScriptTag({ type: "module", url: "/src/rendering/devHarness.ts" });
      await page.waitForFunction(
        () => typeof window.__STARWATER_REVEAL__ === "function",
        undefined,
        {
          timeout: 20_000,
        },
      );
      await page.evaluate(() => {
        window.__STARWATER_REVEAL__?.({ enableBench: true, enablePaperPass: true });
      });
      await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
        timeout: 20_000,
      });
      return;
    } catch (error) {
      lastError = error;
      await page.waitForTimeout(500);
    }
  }
  throw lastError;
}

test("A1：染色落在世界坐标里，L 形路径不被镜像（不是屏幕滤镜）", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await bootHarness(page);

  // 行走器跑完整条 L（20m / 5m·s⁻¹ = 4s），多给 2s 余量
  await page.waitForTimeout(6_000);

  const reveal = await page.evaluate(() => {
    const state = window.__STARWATER_REVEAL_STATE__;
    const snapshot: DebugSnapshot | null = window.__STARWATER__?.game.getSnapshot() ?? null;
    if (!state)
      return { snapshot, firstLeg: -1, secondLeg: -1, corner: -1, mirror: -1, unvisited: -1 };
    return {
      snapshot,
      firstLeg: state.revealAtWorld(-4, 32),
      secondLeg: state.revealAtWorld(-8, 26),
      corner: state.revealAtWorld(-8, 32),
      mirror: state.revealAtWorld(8, 26),
      unvisited: state.revealAtWorld(20, -20),
    };
  });

  expect(reveal.snapshot).not.toBeNull();
  expect(reveal.snapshot?.systems).toContain("reveal");
  expect(reveal.snapshot?.drawCalls ?? 0).toBeGreaterThan(0);

  // 走过的两段与转角都被染色
  expect(reveal.firstLeg).toBeGreaterThan(0.5);
  expect(reveal.secondLeg).toBeGreaterThan(0.5);
  expect(reveal.corner).toBeGreaterThan(0.5);
  // 镜像点与从未走过的点必须干净：若是屏幕空间滤镜，这两处也会被染上
  expect(reveal.mirror).toBeLessThan(0.05);
  expect(reveal.unvisited).toBeLessThan(0.05);

  await testInfo.attach("a1-reveal-scene", {
    body: await page.screenshot({ path: testInfo.outputPath("a1-reveal-scene.png") }),
    contentType: "image/png",
  });

  expect(errors).toEqual([]);
});

test("A1：调试视图显示遮罩缩略图与笔刷信息", async ({ page }) => {
  await bootHarness(page);
  await page.waitForTimeout(1_500);

  const debugRoot = page.locator("#debug-root");
  await expect(debugRoot).toBeVisible();
  await expect(debugRoot).toContainText("染色遮罩（世界坐标）");
  await expect(debugRoot).toContainText("笔刷 1.60m");

  const hasCanvas = await page.evaluate(() => {
    const canvas = document.querySelector("#debug-root canvas");
    if (!(canvas instanceof HTMLCanvasElement)) return false;
    return canvas.width > 0 && canvas.height > 0;
  });
  expect(hasCanvas).toBe(true);
});

test("A1：reset 清空遮罩并保留渲染循环", async ({ page }) => {
  await bootHarness(page);
  await page.waitForTimeout(2_500);

  const before = await page.evaluate(
    () => window.__STARWATER_REVEAL_STATE__?.revealAtWorld(-4, 32) ?? 0,
  );
  expect(before).toBeGreaterThan(0.5);

  const after = await page.evaluate(() => {
    window.__STARWATER__?.game.reset();
    const state = window.__STARWATER_REVEAL_STATE__;
    return {
      value: state?.revealAtWorld(-4, 32) ?? -1,
      running: window.__STARWATER__?.game.isRunning ?? false,
      elapsed: window.__STARWATER__?.game.getSnapshot().elapsedSeconds ?? -1,
    };
  });

  expect(after.value).toBe(0);
  expect(after.running).toBe(true);
  expect(after.elapsed).toBe(0);
});
