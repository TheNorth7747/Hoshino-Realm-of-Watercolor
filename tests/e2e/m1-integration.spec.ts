import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * M1 放行验收（PRD 7.2 / 13）：
 *   1. 角色可以移动和转向
 *   2. 彩色路径留在世界坐标中，不随镜头漂移
 *   3. 离开后返回，颜色仍存在
 *   4. 至少两种物体与地面使用同一遮罩
 *
 * 跑的是真实 app（main.ts 已接线 player + reveal + camera），不是模块自测。
 * A6 可以在此基础上扩展，但不得降低这里的断言。
 */

type PlayerLike = {
  getPlayerSnapshot(): {
    position: { x: number; y: number; z: number };
    headingRadians: number;
    speed: number;
  };
};

type RevealLike = {
  colorRevealMask: {
    texture: { uuid: string };
    surface: { readRevealAt(u: number, v: number): number };
  } | null;
  revealUniforms: { uRevealMask: { value: { uuid: string } } } | null;
};

/** 世界 XZ → 遮罩 UV（与 src/rendering/maskMapping.ts 同一规则：u 沿 +X，v 沿 +Z） */
const toUv = (x: number, z: number): { u: number; v: number } => ({
  u: (x + 48) / 96,
  v: (z + 48) / 96,
});

async function boot(page: Page): Promise<void> {
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await page.waitForTimeout(500); // 等首帧落笔 + 一次遮罩上传
}

async function readState(page: Page) {
  return page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const player = bridge?.game.getSystem("player") as unknown as PlayerLike | undefined;
    const reveal = bridge?.game.getSystem("reveal") as unknown as RevealLike | undefined;
    const snapshot = player?.getPlayerSnapshot();
    const mask = reveal?.colorRevealMask;

    const at = (x: number, z: number): number => {
      if (!mask) return -1;
      return mask.surface.readRevealAt((x + 48) / 96, (z + 48) / 96);
    };

    return {
      position: snapshot ? { x: snapshot.position.x, z: snapshot.position.z } : null,
      heading: snapshot?.headingRadians ?? null,
      speed: snapshot?.speed ?? null,
      systems: bridge?.game.getSnapshot().systems ?? [],
      maskUuid: mask?.texture.uuid ?? null,
      uniformMaskUuid: reveal?.revealUniforms?.uRevealMask.value.uuid ?? null,
      atPlayer: snapshot ? at(snapshot.position.x, snapshot.position.z) : -1,
      // V0.2 笔刷加宽至 2.8m 且开场有 8m 预染色，镜像探针沿 X 轴对称外移 10m 避开开场色域与走廊，
      // 保持「世界左侧未走过区域保持干净（非屏幕空间滤镜）」的严格语义。
      atMirror: snapshot ? at(-snapshot.position.x - 10, snapshot.position.z) : -1,
    };
  });
}

async function revealAt(page: Page, x: number, z: number): Promise<number> {
  return page.evaluate(
    ({ u, v }: { u: number; v: number }) => {
      const bridge = window.__STARWATER__;
      const reveal = bridge?.game.getSystem("reveal") as unknown as RevealLike | undefined;
      if (!reveal?.colorRevealMask) return -1;
      return reveal.colorRevealMask.surface.readRevealAt(u, v);
    },
    toUv(x, z),
  );
}

async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

test("M1-1：角色可以移动和转向", async ({ page }) => {
  await boot(page);
  const before = await readState(page);
  expect(before.position).not.toBeNull();
  expect(before.systems).toEqual([
    "player",
    "story",
    "ui-hud",
    "ui-debug",
    "reveal",
    "world",
    "effects-vfx",
    "camera",
  ]);

  await holdKey(page, "KeyW", 900);
  const afterW = await readState(page);
  const moved = Math.hypot(
    (afterW.position?.x ?? 0) - (before.position?.x ?? 0),
    (afterW.position?.z ?? 0) - (before.position?.z ?? 0),
  );
  expect(moved).toBeGreaterThan(0.5);

  const headingBefore = afterW.heading ?? 0;
  await holdKey(page, "KeyD", 700);
  const afterD = await readState(page);
  expect(Math.abs((afterD.heading ?? 0) - headingBefore)).toBeGreaterThan(0.15);
});

test("M1-2：彩色路径留在世界坐标中，不随镜头漂移", async ({ page }) => {
  await boot(page);
  // 先向前再向右：得到一个 x≠0 的落笔点，镜像点才有意义
  await holdKey(page, "KeyW", 700);
  await holdKey(page, "KeyD", 900);

  const painted = await readState(page);
  expect(painted.position).not.toBeNull();
  expect(painted.atPlayer).toBeGreaterThan(0.5);
  // 镜像点没走过必须干净；屏幕空间滤镜会把它一起染上
  expect(painted.atMirror).toBeLessThan(0.05);

  const anchor = painted.position;
  const beforeDrag = await revealAt(page, anchor?.x ?? 0, anchor?.z ?? 0);

  const box = await page.locator("#game-canvas").boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 800) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 600) / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 260, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  const afterDrag = await revealAt(page, anchor?.x ?? 0, anchor?.z ?? 0);
  expect(beforeDrag).toBeGreaterThan(0.5);
  // 同一世界点的显色值不因镜头旋转而改变
  expect(Math.abs(afterDrag - beforeDrag)).toBeLessThan(0.02);
});

test("M1-3：离开后返回，颜色仍存在", async ({ page }) => {
  await boot(page);
  await holdKey(page, "KeyW", 900);
  const painted = await readState(page);
  const anchor = painted.position;
  expect(anchor).not.toBeNull();
  expect(painted.atPlayer).toBeGreaterThan(0.5);

  // 走远
  await holdKey(page, "KeyS", 1500);
  await holdKey(page, "KeyA", 900);

  // 锚点颜色必须还在（离开不衰减）
  expect(await revealAt(page, anchor?.x ?? 0, anchor?.z ?? 0)).toBeGreaterThan(0.5);
  // 从没走过的位置必须干净
  expect(await revealAt(page, 20, 40)).toBeLessThan(0.05);
});

test("M1-4：至少两种物体与地面使用同一遮罩", async ({ page }) => {
  await boot(page);

  const identity = await page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const reveal = bridge?.game.getSystem("reveal") as unknown as RevealLike | undefined;
    return {
      mask: reveal?.colorRevealMask?.texture.uuid ?? null,
      uniform: reveal?.revealUniforms?.uRevealMask.value.uuid ?? null,
    };
  });
  // 材质工厂的 uniforms 指向的就是这张遮罩
  expect(identity.mask).not.toBeNull();
  expect(identity.uniform).toBe(identity.mask);

  // 遍历世界根节点：地面 + 至少两个物体必须引用同一个 uniforms 对象
  const shared = await page.evaluate(() => {
    const bridge = window.__STARWATER__;
    const reveal = bridge?.game.getSystem("reveal") as unknown as RevealLike | undefined;
    const uniforms = reveal?.revealUniforms ?? null;
    const game = bridge?.game as unknown as
      | {
          context: {
            worldRoot: {
              traverse(
                callback: (object: {
                  name?: string;
                  material?: { userData?: { watercolor?: { uniforms?: unknown } } };
                }) => void,
              ): void;
            };
          };
        }
      | undefined;

    const found: Array<{ name: string; shares: boolean }> = [];
    game?.context.worldRoot.traverse((object) => {
      const materialUniforms = object.material?.userData?.watercolor?.uniforms;
      if (materialUniforms !== undefined && object.name) {
        found.push({ name: object.name, shares: materialUniforms === uniforms });
      }
    });
    return { found, hasUniforms: uniforms !== null };
  });

  expect(shared.hasUniforms).toBe(true);
  expect(shared.found.length).toBeGreaterThanOrEqual(3); // 地面 + 水 + 树 + 草 + 花 + 山
  expect(shared.found.every((entry) => entry.shares)).toBe(true);
  // M2 起场景来自 A3：地形、溪水、花树必须共用同一份 uniforms（AC-05）
  expect(shared.found.map((entry) => entry.name)).toEqual(
    expect.arrayContaining(["terrain-mesh", "stream-water", "flower-tree-trunk"]),
  );

  // 同一遮罩也在被真实绘制：玩家走过的位置显色 > 0.5
  await holdKey(page, "KeyW", 700);
  const painted = await readState(page);
  expect(painted.atPlayer).toBeGreaterThan(0.5);
});

test("M1-5：调试面板显示系统列表与染色统计", async ({ page }) => {
  await boot(page);
  const debugRoot = page.locator("#debug-root");
  await expect(debugRoot).toBeVisible();
  await expect(debugRoot).toContainText("已挂载系统");
  await expect(debugRoot).toContainText("player, story, ui-hud");
  await expect(debugRoot).toContainText("reveal.coverage");
});
