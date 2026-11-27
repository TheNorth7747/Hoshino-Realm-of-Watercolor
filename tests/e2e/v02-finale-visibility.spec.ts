import { expect, test, type Page } from "@playwright/test";
import { CAMERA_FINALE_DISTANCE } from "../../src/player/CameraRig";

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

interface ExploreLike {
  getState(): { step: string; visited: string[]; finished: boolean };
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("ERR_NETWORK_CHANGED")) {
      errors.push(`console: ${message.text()}`);
    }
  });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-controls-hint")).toBeVisible();
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
    const story = game?.getSystem("story") as unknown as ExploreLike | undefined;
    return {
      vfx: vfx?.stats ?? null,
      cameraFinale: cam?.isFinaleActive() ?? false,
      cameraDistance: cam?.getDistance() ?? 0,
      finaleReveal: reveal?.finaleReveal.value ?? 0,
      coverage: reveal?.colorRevealMask?.surface.readRevealCoverage() ?? -1,
      finished: story?.getState().finished ?? false,
    };
  });
}

test("V0.2/V0.3：花树绽放窗口内世界/花树/镜头/分层花瓣立即可见", async ({ page }) => {
  const errors = await boot(page);

  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  const startedAt = Date.now();

  const immediately = await readState(page);
  expect(immediately.vfx).not.toBeNull();
  expect(immediately.vfx?.treeBursts).toBe(1);
  expect(immediately.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(immediately.cameraFinale).toBe(true);
  expect(immediately.finished).toBe(false);

  const layers = immediately.vfx?.petalLayerCounts;
  expect(layers?.near ?? 0).toBeGreaterThan(0);
  expect(layers?.mid ?? 0).toBeGreaterThan(0);
  expect(layers?.far ?? 0).toBeGreaterThan(0);
  expect(immediately.vfx?.petals.active ?? 0).toBeLessThanOrEqual(
    immediately.vfx?.petals.capacity ?? 0,
  );
  expect(immediately.vfx?.overlayAreaRatio ?? 1).toBeLessThanOrEqual(1);

  await page.waitForTimeout(1600);
  const midWindow = await readState(page);
  expect(midWindow.finaleReveal).toBeGreaterThan(0);
  expect(midWindow.cameraDistance).toBeGreaterThan(CAMERA_FINALE_DISTANCE * 0.8);
  expect(midWindow.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(midWindow.coverage).toBeGreaterThan(0);

  await expect.poll(async () => (await readState(page)).finished, { timeout: 45_000 }).toBe(true);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2_000);

  expect(errors).toEqual([]);
});

test("V0.2/V0.3：结局后重置，分层花瓣与运镜状态全部复位且可二次触发", async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await boot(page);
  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");

  const atFinaleStart = await readState(page);
  expect(atFinaleStart.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(atFinaleStart.vfx?.petalLayerCounts.far ?? 0).toBeGreaterThan(0);
  expect(atFinaleStart.finished).toBe(false);

  await expect.poll(async () => (await readState(page)).finished, { timeout: 45_000 }).toBe(true);
  const before = await readState(page);
  expect(before.cameraFinale).toBe(true);
  expect(before.finaleReveal).toBeGreaterThan(0);
  expect(before.vfx?.treeBursts ?? 0).toBe(1);

  await page.locator('.sw-minimal-btn[data-action="reset"]').click();
  await page.waitForTimeout(200);

  const after = await readState(page);
  expect(after.vfx?.petals.active ?? 0).toBe(0);
  expect(after.cameraFinale).toBe(false);
  expect(after.finaleReveal).toBe(0);
  expect(after.finished).toBe(false);

  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");
  const second = await readState(page);
  expect(second.vfx?.petals.active ?? 0).toBeGreaterThan(0);
  expect(second.vfx?.petalLayerCounts.near ?? 0).toBeGreaterThan(0);
  expect(second.vfx?.petalLayerCounts.far ?? 0).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
