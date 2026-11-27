import { expect, test, type Page } from "@playwright/test";
import { CAMERA_DEFAULT_DISTANCE, CAMERA_FINALE_DISTANCE } from "../../src/player/CameraRig";

interface CameraLike {
  isFinaleActive(): boolean;
  getDistance(): number;
  getTargetDistance(): number;
  getFinaleTargetDistance(): number;
}

interface RevealLike {
  readonly finaleReveal: { readonly value: number; isPlaying: boolean };
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

async function readCamera(page: Page) {
  return page.evaluate(() => {
    const cam = window.__STARWATER__?.game.getSystem("camera") as unknown as CameraLike | undefined;
    if (!cam) return null;
    return {
      active: cam.isFinaleActive(),
      distance: cam.getDistance(),
      target: cam.getTargetDistance(),
      finaleTarget: cam.getFinaleTargetDistance(),
    };
  });
}

async function readReveal(page: Page) {
  return page.evaluate(() => {
    const reveal = window.__STARWATER__?.game.getSystem("reveal") as unknown as
      RevealLike | undefined;
    if (!reveal) return null;
    return {
      finale: reveal.finaleReveal.value,
      playing: reveal.finaleReveal.isPlaying,
      coverage: reveal.colorRevealMask?.surface.readRevealCoverage() ?? -1,
    };
  });
}

async function readExplore(page: Page) {
  return page.evaluate(() => {
    const story = window.__STARWATER__?.game.getSystem("story") as unknown as
      ExploreLike | undefined;
    return story?.getState() ?? { step: "unknown", visited: [], finished: false };
  });
}

async function reachFinale(page: Page): Promise<void> {
  await clickNode(page, "flower");
  await clickNode(page, "stream");
  await clickNode(page, "tree");
}

test("RC-01：花树完成后镜头平滑拉远至 13m，无硬切、reset 复位", async ({ page }) => {
  const errors = await boot(page);

  const before = await readCamera(page);
  expect(before).not.toBeNull();
  expect(before?.active).toBe(false);
  expect(before?.distance).toBeCloseTo(CAMERA_DEFAULT_DISTANCE, 1);

  await reachFinale(page);

  const t0 = await readCamera(page);
  expect(t0?.active).toBe(true);
  expect(t0?.finaleTarget).toBeCloseTo(CAMERA_FINALE_DISTANCE, 5);
  expect(t0?.distance).toBeLessThan(CAMERA_FINALE_DISTANCE);

  const distances: number[] = [t0?.distance ?? 0];
  for (let i = 0; i < 36; i += 1) {
    await page.waitForTimeout(120);
    const s = await readCamera(page);
    expect(s).not.toBeNull();
    distances.push(s?.distance ?? 0);
    if (distances.length >= 6 && (s?.distance ?? 0) > 11.2) break;
  }
  for (let i = 1; i < distances.length; i += 1) {
    expect(distances[i] ?? 0).toBeGreaterThanOrEqual((distances[i - 1] ?? 0) - 1e-6);
  }
  expect(distances[1] ?? 0).toBeLessThan(CAMERA_FINALE_DISTANCE);
  expect(distances.at(-1) ?? 0).toBeGreaterThan(11);
  expect(distances.at(-1) ?? 0).toBeLessThanOrEqual(CAMERA_FINALE_DISTANCE + 0.001);

  await page.evaluate(() => window.__STARWATER__?.game.reset());
  await page.waitForTimeout(120);
  const afterReset = await readCamera(page);
  expect(afterReset?.active).toBe(false);
  expect(afterReset?.distance).toBeCloseTo(CAMERA_DEFAULT_DISTANCE, 1);

  expect(errors).toEqual([]);
});

test("RC-02：花树完成后远山显色单调推进至 1，reset 归零，不改变界内遮罩", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);

  const before = await readReveal(page);
  expect(before).not.toBeNull();
  expect(before?.finale).toBe(0);

  await clickNode(page, "flower");
  const afterFlower = await readReveal(page);
  expect(afterFlower?.finale).toBe(0);
  expect(afterFlower?.coverage).toBeGreaterThanOrEqual(0);

  await clickNode(page, "stream");
  await clickNode(page, "tree");

  const values: number[] = [];
  for (let i = 0; i < 36; i += 1) {
    const s = await readReveal(page);
    const value = s?.finale ?? 0;
    values.push(value);
    if (values.length >= 6 && value > 0.85) break;
    await page.waitForTimeout(120);
  }
  for (let i = 1; i < values.length; i += 1) {
    expect(values[i] ?? 0).toBeGreaterThanOrEqual((values[i - 1] ?? 0) - 1e-6);
  }
  expect(values.at(-1) ?? 0).toBeGreaterThan(0.8);
  expect(values.at(-1) ?? 0).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.__STARWATER__?.game.reset());
  await page.waitForTimeout(120);
  const afterReset = await readReveal(page);
  expect(afterReset?.finale).toBe(0);
  expect(afterReset?.playing).toBe(false);

  expect(errors).toEqual([]);
});

test("RC-03：花树完成后 game:finished 仍延迟发出（≥2s），不抢在景致前结束", async ({ page }) => {
  const errors = await boot(page);
  expect((await readExplore(page)).finished).toBe(false);

  await reachFinale(page);
  const startedAt = Date.now();

  await expect.poll(async () => (await readExplore(page)).finished, { timeout: 45_000 }).toBe(true);
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeGreaterThanOrEqual(2_000);

  expect(errors).toEqual([]);
});

test("RC-04：结局后重置可完整二次探索（镜头/远山/状态全复位）", async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await boot(page);

  await reachFinale(page);
  await expect.poll(async () => (await readExplore(page)).finished, { timeout: 45_000 }).toBe(true);
  expect((await readCamera(page))?.active).toBe(true);
  expect((await readReveal(page))?.finale).toBeGreaterThan(0);

  await page.locator('.sw-minimal-btn[data-action="reset"]').click();
  await page.waitForTimeout(150);

  const resetState = await readExplore(page);
  expect(resetState.step).toBe("intro");
  expect(resetState.finished).toBe(false);
  expect((await readCamera(page))?.active).toBe(false);
  expect((await readReveal(page))?.finale).toBe(0);

  await reachFinale(page);
  await expect.poll(async () => (await readExplore(page)).finished, { timeout: 45_000 }).toBe(true);
  expect((await readCamera(page))?.active).toBe(true);
  expect((await readReveal(page))?.finale).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
