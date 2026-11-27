import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * V0.3 六组真实游戏截图（开场 / 草坡倒木 / 溪流垂柳 / 虞美人花坡 / 樱花绽放 / 回望光束）。
 *
 * 硬约束：
 * - 全部来自实际运行的页面 `page.screenshot()`，1280×720、Real Chrome GPU（禁止 SwiftShader）。
 * - 极简无对话自由探索体验：无对话弹窗、无星屑计数、无结局弹窗，仅保留底部轻提示条与右上角玻璃按钮。
 * - 截图前隐藏 `#debug-root`、`.sw-debug` 与 3D `debug-helpers`。
 */

const OUT_DIR = path.join(process.cwd(), "test-results", "visual-v03");
const SHOTS: Array<{ id: string; file: string }> = [
  { id: "opening", file: "01-opening.png" },
  { id: "meadow-log", file: "02-meadow-log.png" },
  { id: "stream-willow", file: "03-stream-willow.png" },
  { id: "poppy-hill", file: "04-poppy-hill.png" },
  { id: "sakura-bloom", file: "05-sakura-bloom.png" },
  { id: "lookback-godrays", file: "06-lookback-godrays.png" },
];

interface ManifestShot {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly state: {
    readonly step: string;
    readonly visited: readonly string[];
    readonly finished: boolean;
    readonly petalsActive: number;
    readonly petalLayers: { near: number; mid: number; far: number };
    readonly cameraFinale: boolean;
    readonly finaleReveal: number;
    readonly controlsHintVisible: boolean;
  };
}

interface VisualGameLike {
  readonly context?: {
    readonly scene?: { getObjectByName(name: string): { visible: boolean } | null };
  };
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      if (!message.location()?.url?.endsWith("/favicon.ico")) {
        errors.push(`console: ${message.text()}`);
      }
    }
  });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 25_000,
  });
  await expect(page.locator(".sw-controls-hint")).toBeVisible();
  await expect(page.locator("#boot-status")).toBeHidden();
  return errors;
}

/** 关闭所有调试 UI（DOM 覆盖层 + `.sw-debug` + 3D `debug-helpers`），保留极简游戏 HUD。 */
async function hideDebugUi(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>("#debug-root");
    if (overlay) overlay.hidden = true;
    for (const panel of document.querySelectorAll<HTMLElement>(".sw-debug")) {
      panel.style.display = "none";
    }
    const game = window.__STARWATER__?.game as unknown as VisualGameLike | undefined;
    const helpers = game?.context?.scene?.getObjectByName("debug-helpers") ?? null;
    if (helpers) helpers.visible = false;
  });
  await expect(page.locator("#debug-root")).toBeHidden();
  await expect(page.locator(".sw-debug")).toBeHidden();
  const helpersVisible = await page.evaluate(() => {
    const game = window.__STARWATER__?.game as unknown as VisualGameLike | undefined;
    return game?.context?.scene?.getObjectByName("debug-helpers")?.visible ?? false;
  });
  expect(helpersVisible).toBe(false);
}

async function readState(page: Page): Promise<ManifestShot["state"]> {
  return page.evaluate(() => {
    const game = window.__STARWATER__?.game;
    const story = game?.getSystem("story") as unknown as
      { getState(): { step: string; visited: string[]; finished: boolean } } | undefined;
    const vfx = game?.getSystem("effects-vfx") as unknown as
      | {
          stats: {
            petals: { active: number };
            petalLayerCounts: { near: number; mid: number; far: number };
          } | null;
        }
      | undefined;
    const cam = game?.getSystem("camera") as unknown as { isFinaleActive(): boolean } | undefined;
    const reveal = game?.getSystem("reveal") as unknown as
      { finaleReveal: { value: number } } | undefined;
    const explore = story?.getState();
    const hint = document.querySelector<HTMLElement>(".sw-controls-hint");
    return {
      step: explore?.step ?? "unknown",
      visited: explore?.visited ?? [],
      finished: explore?.finished ?? false,
      petalsActive: vfx?.stats?.petals.active ?? 0,
      petalLayers: vfx?.stats?.petalLayerCounts ?? { near: 0, mid: 0, far: 0 },
      cameraFinale: cam?.isFinaleActive() ?? false,
      finaleReveal: reveal?.finaleReveal.value ?? 0,
      controlsHintVisible: hint ? !hint.hidden : false,
    };
  });
}

function shotPath(file: string): string {
  return path.join(OUT_DIR, file);
}

async function capture(
  page: Page,
  file: string,
  state: ManifestShot["state"],
): Promise<ManifestShot> {
  await hideDebugUi(page);
  const box = await page.locator("#game-canvas").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  const filePath = shotPath(file);
  const buffer = await page.screenshot({ path: filePath });
  expect(buffer.byteLength).toBeGreaterThan(10_000);
  const stats = fs.statSync(filePath);
  expect(stats.size).toBe(buffer.byteLength);
  return {
    id: "",
    file,
    bytes: stats.size,
    width: 1280,
    height: 720,
    state,
  };
}

async function playerPos(page: Page): Promise<{ x: number; z: number }> {
  return page.evaluate(() => {
    const player = window.__STARWATER__?.game.getSystem("player") as unknown as
      { getPlayerSnapshot(): { position: { x: number; z: number } } } | undefined;
    const pos = player?.getPlayerSnapshot().position;
    return { x: pos?.x ?? Number.NaN, z: pos?.z ?? Number.NaN };
  });
}

/** 真实键盘移动向目标 XZ（带 Shift 疾跑），不直接修改玩家坐标。 */
async function walkToXZ(
  page: Page,
  targetX: number | null,
  targetZ: number,
): Promise<{ x: number; z: number }> {
  await page.keyboard.down("ShiftLeft");
  let pos = await playerPos(page);
  for (let i = 0; i < 180; i += 1) {
    const needNorth = Number.isFinite(pos.z) && pos.z > targetZ + 0.35;
    const needSouth = Number.isFinite(pos.z) && pos.z < targetZ - 0.35;
    const needLeft = targetX !== null && Number.isFinite(pos.x) && pos.x > targetX + 0.35;
    const needRight = targetX !== null && Number.isFinite(pos.x) && pos.x < targetX - 0.35;

    if (!needNorth && !needSouth && !needLeft && !needRight) break;

    if (needNorth) await page.keyboard.down("KeyW");
    else await page.keyboard.up("KeyW");

    if (needSouth) await page.keyboard.down("KeyS");
    else await page.keyboard.up("KeyS");

    if (needLeft) await page.keyboard.down("KeyA");
    else await page.keyboard.up("KeyA");

    if (needRight) await page.keyboard.down("KeyD");
    else await page.keyboard.up("KeyD");

    await page.waitForTimeout(100);
    pos = await playerPos(page);
  }
  await page.keyboard.up("KeyW");
  await page.keyboard.up("KeyS");
  await page.keyboard.up("KeyA");
  await page.keyboard.up("KeyD");
  await page.keyboard.up("ShiftLeft");
  await page.waitForTimeout(350);
  return pos;
}

/** 按像素步进左键拖拽旋转镜头（绕开单帧 240px 防跳变上限）。 */
async function orbitDrag(page: Page, totalDeltaX: number, totalDeltaY = 0): Promise<void> {
  const startX = 640;
  const startY = 360;
  const steps = 8;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: "left" });
  for (let s = 1; s <= steps; s += 1) {
    const nextX = startX + (totalDeltaX * s) / steps;
    const nextY = startY + (totalDeltaY * s) / steps;
    await page.mouse.move(nextX, nextY);
    await page.waitForTimeout(45);
  }
  await page.mouse.up({ button: "left" });
  await page.waitForTimeout(350);
}

test("V0.3 六组真实游戏截图（1280×720，无调试 UI，真实 GPU）", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shots: ManifestShot[] = [];

  // ---- 1) 开场：出生点，铅笔素描远景与第一片绿金草地 ----
  await page.waitForTimeout(900);
  shots.push({
    ...(await capture(page, SHOTS[0]!.file, await readState(page))),
    id: "opening",
  });

  // ---- 2) 草坡倒木与蓝花坡：走到 (-3, 21) 自然触发 flower 晕染 ----
  const flowerPos = await walkToXZ(page, -3.2, 21);
  expect(flowerPos.z).toBeLessThanOrEqual(22);
  await page.waitForTimeout(950);
  const flowerState = await readState(page);
  expect(flowerState.visited).toContain("flower");
  expect(await page.locator(".sw-dialogue").count()).toBe(0);
  shots.push({ ...(await capture(page, SHOTS[1]!.file, flowerState)), id: "meadow-log" });

  // ---- 3) 溪流垂柳与踏石：回到主线 (0, 8) 自然触发 stream 晕染 ----
  const streamPos = await walkToXZ(page, 0, 8);
  expect(streamPos.z).toBeLessThanOrEqual(9);
  await page.waitForTimeout(950);
  const streamState = await readState(page);
  expect(streamState.visited).toContain("stream");
  shots.push({ ...(await capture(page, SHOTS[2]!.file, streamState)), id: "stream-willow" });

  // ---- 4) 虞美人花坡：跨溪走进南面红罂粟与暖金坡 (-2.5, -10.5)，此时尚未触发 tree ----
  const poppyPos = await walkToXZ(page, -2.5, -10.5);
  expect(poppyPos.z).toBeLessThanOrEqual(-9);
  await page.waitForTimeout(550);
  const poppyState = await readState(page);
  shots.push({ ...(await capture(page, SHOTS[3]!.file, poppyState)), id: "poppy-hill" });

  // ---- 5) 樱花绽放：抵达树前 (0, -17.5) 自然触发 tree 终局晕染、晚霞与三层花瓣 ----
  const treePos = await walkToXZ(page, 0, -17.5);
  expect(treePos.z).toBeLessThan(-15.5);
  // 等待三层花瓣（near/mid/far）同时出现在画面内（near 生命周期约 0.9–1.5s）
  await page.waitForFunction(
    () => {
      const game = window.__STARWATER__?.game;
      const vfx = game?.getSystem("effects-vfx") as unknown as
        | { stats: { petalLayerCounts: { near: number; mid: number; far: number } } | null }
        | undefined;
      const layers = vfx?.stats?.petalLayerCounts;
      return Boolean(layers && layers.near > 0 && layers.mid > 0 && layers.far > 0);
    },
    undefined,
    { timeout: 6_000 },
  );
  await page.waitForTimeout(180);
  const treeState = await readState(page);
  expect(treeState.visited).toContain("tree");
  expect(treeState.petalsActive).toBeGreaterThan(0);
  expect(treeState.petalLayers.near).toBeGreaterThan(0);
  expect(treeState.petalLayers.mid).toBeGreaterThan(0);
  expect(treeState.petalLayers.far).toBeGreaterThan(0);
  expect(treeState.cameraFinale).toBe(true);
  expect(treeState.finaleReveal).toBeGreaterThan(0);
  shots.push({ ...(await capture(page, SHOTS[4]!.file, treeState)), id: "sakura-bloom" });

  // ---- 6) 回望金光与神光柱：回到开阔花坡 (0, 2.0) 后转身 180° 回望溪流、晚霞与林间光束 ----
  await walkToXZ(page, 0, 2.0);
  await page.waitForTimeout(1600);
  await orbitDrag(page, 620, -18);
  await page.waitForTimeout(600);
  const lookbackState = await readState(page);
  expect(lookbackState.finaleReveal).toBeGreaterThan(0.8);
  shots.push({ ...(await capture(page, SHOTS[5]!.file, lookbackState)), id: "lookback-godrays" });

  expect(shots).toHaveLength(6);
  for (const shot of shots) {
    expect(fs.existsSync(shotPath(shot.file))).toBe(true);
    expect(shot.bytes).toBeGreaterThan(10_000);
  }

  const device = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: ext ? String(gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "n/a",
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  expect(device.renderer.toLowerCase()).not.toMatch(/swiftshader|software|llvmpipe|softpipe/);
  expect(device.viewport).toEqual({ width: 1280, height: 720 });

  const manifest = {
    note: "V0.3 real-game screenshots from the running page; no reference frames or static composites.",
    spec: "1280x720, debug UI hidden, real Chrome GPU (not SwiftShader)",
    device,
    realMovementPositions: {
      spawn: { x: 0, z: 32 },
      flower: flowerPos,
      stream: streamPos,
      poppy: poppyPos,
      tree: treePos,
    },
    shots,
    runtimeErrors: errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  expect(errors).toEqual([]);
});
