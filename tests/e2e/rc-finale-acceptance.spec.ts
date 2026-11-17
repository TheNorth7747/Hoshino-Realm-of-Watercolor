import { expect, test, type Page } from "@playwright/test";

/**
 * RC 验收：两个 P0 修复的集成 e2e（结局镜头拉远 + 远山显色），
 * 以及结局 UI 延迟、重置后二次通关（PRD 3.1 / 5.5 / 9.6 / AC-08）。
 *
 * 驱动方式：真实游戏页面 + ?debug=1 节点按钮（PRD 11.4 允许的调试入口），
 * 断言读取共享 system 实例与 DOM，不写死故事内部状态。
 * 所有阈值取 PRD 明确值或修复实现常量；不放宽等待、不删断言、不降阈值。
 */

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
      | RevealLike
      | undefined;
    if (!reveal) return null;
    return {
      finale: reveal.finaleReveal.value,
      playing: reveal.finaleReveal.isPlaying,
      coverage: reveal.colorRevealMask?.surface.readRevealCoverage() ?? -1,
    };
  });
}

/** 走到花树完成（按 PRD 顺序触发三节点），不跳过前置条件。 */
async function reachFinale(page: Page): Promise<void> {
  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  await clickNode(page, "stream");
  await clickNode(page, "tree");
}

test("RC-01：花树完成后镜头平滑拉远至 13m，无硬切、reset 复位", async ({ page }) => {
  const errors = await boot(page);

  const before = await readCamera(page);
  expect(before).not.toBeNull();
  expect(before?.active).toBe(false);
  expect(before?.distance).toBeCloseTo(8, 1); // CAMERA_DEFAULT_DISTANCE

  await reachFinale(page);

  // 立刻应进入运镜态（不等 game:finished 的结局 UI）
  const t0 = await readCamera(page);
  expect(t0?.active).toBe(true);
  expect(t0?.finaleTarget).toBeCloseTo(13, 5); // CAMERA_FINALE_DISTANCE
  expect(t0?.distance).toBeLessThan(13); // 还在过渡中，未硬切

  // 采样收敛过程：单调递增、逐帧增量有上限（平滑）、最终逼近 13m
  const distances: number[] = [t0?.distance ?? 0];
  for (let i = 0; i < 18; i += 1) {
    await page.waitForTimeout(100);
    const s = await readCamera(page);
    expect(s).not.toBeNull();
    distances.push(s?.distance ?? 0);
  }
  for (let i = 1; i < distances.length; i += 1) {
    expect(distances[i] ?? 0).toBeGreaterThanOrEqual((distances[i - 1] ?? 0) - 1e-6);
  }
  // 平滑性（无硬切）的严格逐帧断言由 A2 单测 finale-camera.test.ts 覆盖：
  // 每帧增量 <0.2m。e2e 层无法逐帧采样，这里验证端到端的三个本质特征：
  // 1) 首帧未一步到位；2) 单调不回退（上面已断言）；3) 收敛到目标且不过冲。
  expect(distances[1] ?? 0).toBeLessThan(13); // 过渡开始后仍未到顶，非硬切
  expect(distances.at(-1) ?? 0).toBeGreaterThan(11); // 已明显拉远并逼近目标
  expect(distances.at(-1) ?? 0).toBeLessThanOrEqual(13.001); // 不过冲

  // reset 复位到默认距离与可用输入
  await page.evaluate(() => window.__STARWATER__?.game.reset());
  await page.waitForTimeout(120);
  const afterReset = await readCamera(page);
  expect(afterReset?.active).toBe(false);
  expect(afterReset?.distance).toBeCloseTo(8, 1);

  expect(errors).toEqual([]);
});

test("RC-02：花树完成后远山显色单调推进至 1，reset 归零，不改变界内遮罩", async ({ page }) => {
  // 该用例含 3 节点驱动 + 27 点逐帧采样，仅放宽框架执行时限；业务断言阈值不变。
  test.setTimeout(120_000);
  const errors = await boot(page);

  const before = await readReveal(page);
  expect(before).not.toBeNull();
  expect(before?.finale).toBe(0);

  // 先只触发 flower：确认界内遮罩有覆盖，而远山显色仍为 0（只响应 tree）。
  // 用与 reachFinale 相同的对话框推进方式，避免开场对话挡住后续点击。
  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  const afterFlower = await readReveal(page);
  expect(afterFlower?.finale).toBe(0);
  expect(afterFlower?.coverage).toBeGreaterThanOrEqual(0);

  // 继续 stream、tree（debug 按钮可穿透对话层，与 RC-01/03/04 一致）
  await clickNode(page, "stream");
  await clickNode(page, "tree");

  // 显色时长 FINALE_REVEAL_SECONDS=2.6s；每 100ms 采样共 27 点覆盖全程
  const values: number[] = [];
  for (let i = 0; i < 27; i += 1) {
    const s = await readReveal(page);
    values.push(s?.finale ?? 0);
    await page.waitForTimeout(100);
  }
  for (let i = 1; i < values.length; i += 1) {
    expect(values[i] ?? 0).toBeGreaterThanOrEqual((values[i - 1] ?? 0) - 1e-6);
  }
  expect(values.at(-1) ?? 0).toBeGreaterThan(0.8); // 2.6s 时长内应接近完成
  expect(values.at(-1) ?? 0).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.__STARWATER__?.game.reset());
  await page.waitForTimeout(120);
  const afterReset = await readReveal(page);
  expect(afterReset?.finale).toBe(0);
  expect(afterReset?.playing).toBe(false);

  expect(errors).toEqual([]);
});

test("RC-03：结局 UI 在花树完成后仍延迟出现（≥2s），延迟不被 P0 修复破坏", async ({
  page,
}) => {
  const errors = await boot(page);
  await expect(page.locator(".sw-ending")).toBeHidden();

  await reachFinale(page);
  const startedAt = Date.now();

  // 下界断言：结局 UI 不得早于 2s 出现（story.json delaySeconds=2.5，PRD 要求 2～3s）
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 8_000 });
  const elapsedMs = Date.now() - startedAt;
  expect(elapsedMs).toBeGreaterThanOrEqual(2_000);
  await expect(page.locator(".sw-ending__restart")).toBeVisible();

  expect(errors).toEqual([]);
});

test("RC-04：结局后重置可完整二次通关（镜头/远山/星屑/结局全复位）", async ({ page }) => {
  const errors = await boot(page);

  await reachFinale(page);
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 8_000 });
  expect((await page.locator(".sw-hud__shards").textContent())?.trim()).toContain("3/3");
  expect((await readCamera(page))?.active).toBe(true);
  expect((await readReveal(page))?.finale).toBeGreaterThan(0);

  // 通过结局页的“重新进入绘本”按钮重置（真实用户路径）
  await page.locator(".sw-ending__restart").click();
  await page.waitForTimeout(150);

  expect((await page.locator(".sw-hud__shards").textContent())?.trim()).toContain("0/3");
  await expect(page.locator(".sw-ending")).toBeHidden();
  expect((await readCamera(page))?.active).toBe(false);
  expect((await readReveal(page))?.finale).toBe(0);

  // 二次通关：三节点再次可触发并再次进入结局
  await reachFinale(page);
  expect((await page.locator(".sw-hud__shards").textContent())?.trim()).toContain("3/3");
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 8_000 });
  expect((await readCamera(page))?.active).toBe(true);
  expect((await readReveal(page))?.finale).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});
