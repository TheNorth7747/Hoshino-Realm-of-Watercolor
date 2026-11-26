import { expect, test, type Page } from "@playwright/test";
import { CAMERA_FINALE_DISTANCE } from "../../src/player/CameraRig";

/**
 * V0.2 结局时序与 VFX 层次（PRD 3.1 / 5.5 / 9.6 / V02_VISUAL_WORKFLOW 4.4）：
 * - 不改变既有故事时序：结局 UI 仍由 StorySystem 延迟 2.5s 后发出 game:finished 驱动。
 * - 花树完成后、UI 出现前：世界染色 / 远山显色 / 镜头拉远 / 分层花瓣均已可见。
 * - 只做结构/状态自动断言，不做逐像素断言（跨 GPU 不稳）。
 */

interface VfxLike {
  readonly stats: {
    readonly petals: { readonly active: number; readonly capacity: number };
    readonly petalLayerCounts: {
      readonly near: number;
      readonly mid: number;
      readonly far: number;
    };
    readonly overlayAreaRatio: number;
    readonly treeBursts: number;
    readonly resets: number;
  } | null;
}

interface CameraLike {
  isFinaleActive(): boolean;
  getDistance(): number;
}

interface RevealLike {
  readonly finaleReveal: { readonly value: number };
  readonly colorRevealMask: { surface: { readRevealCoverage(): number } } | null;
}

async function boot(page: Page): Promise<string[]> {
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
  return errors;
}

async function clickNode(page: Page, nodeId: string): Promise<void> {
  await page.locator(`.sw-debug__button[data-node="${nodeId}"]`).click();
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const game = window.__STARWATER__?.game;
    const vfx = game?.getSystem("effects-vfx") as unknown as VfxLike | undefined;
    const cam = game?.getSystem("camera") as unknown as CameraLike | undefined;
    const reveal = game?.getSystem("reveal") as unknown as RevealLike | undefined;
    return {
      vfx: vfx?.stats ?? null,
      cameraFinale: cam?.isFinaleActive() ?? false,
      cameraDistance: cam?.getDistance() ?? 0,
      finaleReveal: reveal?.finaleReveal.value ?? 0,
      coverage: reveal?.colorRevealMask?.surface.readRevealCoverage() ?? -1,
      endingHidden: (document.querySelector(".sw-ending") as HTMLElement | null)?.hidden ?? true,
    };
  });
}

test("V0.2：结局 UI 出现前，世界/花树/镜头/分层花瓣已可见，故事时序不变", async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator(".sw-ending")).toBeHidden();

  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  const startedAt = Date.now();

  // 1) 花树完成瞬间：VFX 立即爆发、镜头进入运镜、远山显色开始、结局 UI 仍隐藏。
  const immediately = await readState(page);
  expect(immediately.vfx).not.toBeNull();
  expect(immediately.vfx?.treeBursts).toBe(1);
  expect(immediately.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(immediately.cameraFinale).toBe(true);
  expect(immediately.endingHidden).toBe(true);
  await expect(page.locator(".sw-ending")).toBeHidden();

  // 2) 分层花瓣三层齐备、透明叠加面积受控、总量不超上限。
  const layers = immediately.vfx?.petalLayerCounts;
  expect(layers?.near ?? 0).toBeGreaterThan(0);
  expect(layers?.mid ?? 0).toBeGreaterThan(0);
  expect(layers?.far ?? 0).toBeGreaterThan(0);
  expect(immediately.vfx?.petals.active ?? 0).toBeLessThanOrEqual(
    immediately.vfx?.petals.capacity ?? 0,
  );
  expect(immediately.vfx?.overlayAreaRatio ?? 1).toBeLessThanOrEqual(1);

  // 3) 等待 1.6s（仍在 2.5s UI 延迟窗口内）：远山显色推进、镜头拉远、花瓣仍在。
  await page.waitForTimeout(1600);
  const midWindow = await readState(page);
  expect(midWindow.finaleReveal).toBeGreaterThan(0);
  // 镜头已明显拉远：至少达到结局目标距离的 80%（13m × 0.8 = 10.4m），
  // 与默认距离具体数值解耦，避免 Agent 2 调整默认构图后误报。
  expect(midWindow.cameraDistance).toBeGreaterThan(CAMERA_FINALE_DISTANCE * 0.8);
  expect(midWindow.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(midWindow.coverage).toBeGreaterThan(0);
  expect(midWindow.endingHidden).toBe(true);
  await expect(page.locator(".sw-ending")).toBeHidden();

  // 4) UI 仍按既有故事时序延迟出现（≥2s），不被 VFX 改动破坏。
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 15_000 });
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeGreaterThanOrEqual(2_000);
  await expect(page.locator(".sw-ending__restart")).toBeVisible();

  expect(errors).toEqual([]);
});

test("V0.2：结局后重置，分层花瓣与运镜状态全部复位且可二次通关", async ({ page }) => {
  const errors = await boot(page);
  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  // 花瓣在结局 UI 之前爆发并渐次铺开（生命周期 ≤2.4s 游戏时间，UI 延迟 2.5s）；
  // 因此在 UI 出现前观测分层花瓣，而不是等 UI 出现后（那时已按契约回收）。
  const atFinaleStart = await readState(page);
  expect(atFinaleStart.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(atFinaleStart.vfx?.petalLayerCounts.far ?? 0).toBeGreaterThan(0);
  expect(atFinaleStart.endingHidden).toBe(true);

  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 15_000 });
  const before = await readState(page);
  // 结局 UI 出现时世界状态仍成立（运镜/远山/星屑），花瓣已按生命周期回收属正常。
  expect(before.cameraFinale).toBe(true);
  expect(before.finaleReveal).toBeGreaterThan(0);
  expect(before.vfx?.treeBursts ?? 0).toBe(1);

  await page.locator(".sw-ending__restart").click();
  await page.waitForTimeout(200);

  const after = await readState(page);
  expect(after.vfx?.petals.active ?? 0).toBe(0);
  expect(after.cameraFinale).toBe(false);
  expect(after.finaleReveal).toBe(0);
  expect((await page.locator(".sw-hud__shards").textContent())?.trim()).toContain("0/3");
  await expect(page.locator(".sw-ending")).toBeHidden();

  // 二次通关：分层花瓣再次生成。
  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  const second = await readState(page);
  expect(second.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(second.vfx?.petalLayerCounts.near ?? 0).toBeGreaterThan(0);
  expect(second.vfx?.petalLayerCounts.far ?? 0).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
