import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * M2 放行验收（PRD 7.3 / 13）：
 *   - 主路线从出生点走到花树根下，全程不卡住（无软锁）
 *   - 地形是真实起伏（玩家 Y 跟随采样器变化），不是 A0 的平坦占位
 *   - 溪流可直接蹚过或踩踏石通过，不会卡在水里
 *   - 渲染预算仍在 PRD 11.1 的范围内（Draw Calls ≤ 180，三角面 ≤ 350k）
 *
 * 跑的是集成后的真实 app（player + reveal + world + camera）。
 */

type PlayerLike = {
  getPlayerSnapshot(): {
    position: { x: number; y: number; z: number };
    grounded: boolean;
    speed: number;
  };
};

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
}

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await page.waitForTimeout(500);
}

async function readPlayer(page: Page): Promise<Sample | null> {
  return page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const player = bridge?.game.getSystem("player") as unknown as PlayerLike | undefined;
    const snapshot = player?.getPlayerSnapshot();
    if (!snapshot) return null;
    return {
      x: snapshot.position.x,
      y: snapshot.position.y,
      z: snapshot.position.z,
      grounded: snapshot.grounded,
    };
  });
}

test("M2：主路线走通，不卡在溪流，无软锁", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await boot(page);
  const start = await readPlayer(page);
  expect(start).not.toBeNull();
  expect(start?.z).toBeCloseTo(32, 0);

  const samples: Sample[] = [start as Sample];
  const ys = new Set<number>();

  // 沿主路线（-Z）冲刺；每 700ms 采样一次，最多 24s
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  let reachedTree = false;
  for (let i = 0; i < 34; i += 1) {
    await page.waitForTimeout(700);
    const sample = await readPlayer(page);
    if (!sample) break;
    samples.push(sample);
    ys.add(Number(sample.y.toFixed(3)));
    if (sample.z < -18) {
      reachedTree = true;
      break;
    }
  }
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");

  const end = samples[samples.length - 1];
  const crossedStream = samples.some((sample) => sample.z < 8);

  // 1) 走到花树根下（z ≈ -22 的触发圈内），说明溪流没有挡住主路线
  expect(reachedTree).toBe(true);
  expect(end?.z ?? 0).toBeLessThan(-18);
  // 2) 途中确实穿过了 z=8 的溪流断面
  expect(crossedStream).toBe(true);
  // 3) 地形是起伏的：Y 采样出现多个不同高度
  expect(ys.size).toBeGreaterThan(2);
  // 4) 全程贴地（没有掉出地形或悬空）
  expect(samples.every((sample) => sample.grounded)).toBe(true);

  // 5) 渲染预算（PRD 11.1）
  const snapshot = await page.evaluate(() => window.__STARWATER__?.game.getSnapshot() ?? null);
  expect(snapshot?.drawCalls ?? 0).toBeGreaterThan(0);
  expect(snapshot?.drawCalls ?? 0).toBeLessThanOrEqual(180);
  expect(snapshot?.triangles ?? 0).toBeLessThanOrEqual(350_000);
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

  await testInfo.attach("m2-route-end", {
    body: await page.screenshot({ path: testInfo.outputPath("m2-route-end.png") }),
    contentType: "image/png",
  });

  expect(errors).toEqual([]);
});

test("M2：溪流断面可通行，玩家不会卡在水里", async ({ page }) => {
  await boot(page);
  const start = await readPlayer(page);
  expect(start).not.toBeNull();

  // 轮询而不是固定时长：SwiftShader 下帧率低，delta 截断到 0.05s 会让有效速度
  // 掉到约 2.3 m/s（真机 60fps 才是 4.2 m/s），固定时长断言会误报。
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");

  const samples: Sample[] = [];
  let crossed = false;
  for (let i = 0; i < 60; i += 1) {
    await page.waitForTimeout(500);
    const sample = await readPlayer(page);
    if (!sample) break;
    samples.push(sample);
    if (sample.z < 6) {
      crossed = true;
      break;
    }
  }
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");

  expect(crossed).toBe(true);
  // 经过溪流断面（z ≈ 8）时地形下切：Y 必须低于出生点，说明走进了河槽而不是悬空
  const nearStream = samples.filter((sample) => sample.z > 6.5 && sample.z < 9.5);
  expect(nearStream.length).toBeGreaterThan(0);
  const lowest = Math.min(...nearStream.map((sample) => sample.y));
  expect(lowest).toBeLessThan((start?.y ?? 0) - 0.1);
  // 全程贴地，没有被水卡住
  expect(samples.every((sample) => sample.grounded)).toBe(true);
});
