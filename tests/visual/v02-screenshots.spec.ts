import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * V0.2 五组真实游戏截图（开场 / 蓝花坡 / 溪流 / 花树 / 结尾）。
 *
 * 硬约束（V02_VISUAL_WORKFLOW 4.4）：
 * - 全部来自**实际运行的页面** `page.screenshot()`，不使用静态拼图、参考帧或任何预置图片。
 * - 1280×720、**无调试 UI**：截图前隐藏 A0 DebugOverlay、A4 Story Debug 面板与 3D debug helpers。
 * - 参考视频与抽帧只做本地人工对照，不进入 Git（产物在 test-results/，已被 .gitignore 忽略）。
 * - 不做跨 GPU 易失败的逐像素断言；只断言结构/状态（DOM、canvas 尺寸、粒子统计、故事步骤）。
 *
 * 节点推进用 PRD 11.4 允许的 `?debug=1` 调试按钮（真实 StorySystem 状态机），
 * 并在每次截图前关闭调试 UI，因此最终图片不含任何调试元素。
 */

const OUT_DIR = path.join(process.cwd(), "test-results", "visual-v02");
const SHOTS: Array<{ id: string; file: string }> = [
  { id: "opening", file: "01-opening.png" },
  { id: "flower-hill", file: "02-flower-hill.png" },
  { id: "stream", file: "03-stream.png" },
  { id: "flower-tree", file: "04-flower-tree.png" },
  { id: "ending", file: "05-ending.png" },
];

interface ManifestShot {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly state: {
    readonly step: string;
    readonly shards: string;
    readonly petalsActive: number;
    readonly petalLayers: { near: number; mid: number; far: number };
    readonly cameraFinale: boolean;
    readonly finaleReveal: number;
    readonly endingVisible: boolean;
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
      // favicon 的浏览器自动 404 与游戏渲染无关，精确排除，其余错误照常捕获。
      if (!message.location()?.url?.endsWith("/favicon.ico")) {
        errors.push(`console: ${message.text()}`);
      }
    }
  });
  await page.goto("/?debug=1");
  await page.waitForFunction(() => window.__STARWATER__?.game.isRunning === true, undefined, {
    timeout: 20_000,
  });
  await expect(page.locator(".sw-hud__shards")).toBeVisible();
  await expect(page.locator("#boot-status")).toBeHidden();
  return errors;
}

/** 关闭所有调试 UI：DOM 覆盖层 + 3D helpers；HUD/对话/结局等正常游戏 UI 保留。 */
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
  // 结构断言：截图里不应存在任何可见调试 UI。
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
      { getHudState(): { step: string; shardsCollected: number; shardTotal: number } } | undefined;
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
    const hud = story?.getHudState();
    const ending = document.querySelector<HTMLElement>(".sw-ending");
    return {
      step: hud?.step ?? "unknown",
      shards: `${hud?.shardsCollected ?? 0}/${hud?.shardTotal ?? 3}`,
      petalsActive: vfx?.stats?.petals.active ?? 0,
      petalLayers: vfx?.stats?.petalLayerCounts ?? { near: 0, mid: 0, far: 0 },
      cameraFinale: cam?.isFinaleActive() ?? false,
      finaleReveal: reveal?.finaleReveal.value ?? 0,
      endingVisible: ending ? !ending.hidden : false,
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
  // 结构断言：canvas 必须存在且尺寸非零（真实渲染输出，而非空白/静态占位）。
  const box = await page.locator("#game-canvas").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);
  const filePath = shotPath(file);
  const buffer = await page.screenshot({ path: filePath });
  expect(buffer.byteLength).toBeGreaterThan(10_000); // 真实 3D 帧，不是纯色空图
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

/**
 * 调试按钮只在 `?debug=1` 下挂载。截图前会隐藏调试面板（避免出现在最终图片里），
 * 因此每次推进节点前先临时恢复可见，点完再由 capture() 隐藏。
 * 节点本身仍走真实 StorySystem.debugCompleteNode 状态机，不是伪造状态。
 */
async function clickNode(page: Page, nodeId: string): Promise<void> {
  await page.evaluate(() => {
    for (const panel of document.querySelectorAll<HTMLElement>(".sw-debug")) {
      panel.style.removeProperty("display");
    }
  });
  await page.locator(`.sw-debug__button[data-node="${nodeId}"]`).click();
}

async function playerZ(page: Page): Promise<number> {
  return page.evaluate(() => {
    const player = window.__STARWATER__?.game.getSystem("player") as unknown as
      { getPlayerSnapshot(): { position: { z: number } } } | undefined;
    return player?.getPlayerSnapshot().position.z ?? Number.NaN;
  });
}

/**
 * 真实键盘移动（Shift+W，相对镜头朝 -Z 主路线前进）到目标 z。
 * 只轮询玩家快照判断到达，不用固定时长（真 GPU 与软件渲染速度不同）。
 * 不直接改玩家坐标，保证截图来自真实输入下的运行画面与真实染色路径。
 */
async function walkToZ(page: Page, targetZ: number): Promise<number> {
  await page.keyboard.down("ShiftLeft");
  await page.keyboard.down("KeyW");
  let z = await playerZ(page);
  for (let i = 0; i < 160; i += 1) {
    await page.waitForTimeout(100);
    z = await playerZ(page);
    if (Number.isFinite(z) && z <= targetZ) break;
  }
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await page.waitForTimeout(350); // 等镜头跟随稳定
  return z;
}

test("V0.2 五组真实游戏截图（1280×720，无调试 UI）", async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await boot(page);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const shots: ManifestShot[] = [];

  // ---- 1) 开场：出生点，世界尚未互动 ----
  await page.waitForTimeout(900);
  shots.push({
    ...(await capture(page, SHOTS[0]!.file, await readState(page))),
    id: "opening",
  });

  // ---- 2) 蓝花坡：真实键盘走到 z≈20，产生脚下染色路径，再触发 flower 节点 ----
  const flowerZ = await walkToZ(page, 20);
  expect(flowerZ).toBeLessThanOrEqual(20); // 确实走到蓝花坡，而非停在出生点
  await clickNode(page, "flower");
  await expect(page.locator(".sw-dialogue")).toBeVisible();
  await page.waitForTimeout(900); // 等染色扩散与水彩过渡
  // 截图前关闭对话框（正常游戏 UI，避免遮挡场景对照）
  await page.locator(".sw-dialogue").click();
  await page.waitForTimeout(250);
  const flowerState = await readState(page);
  expect(flowerState.step).not.toBe("intro");
  shots.push({ ...(await capture(page, SHOTS[1]!.file, flowerState)), id: "flower-hill" });

  // ---- 3) 溪流：继续走到 z≈8，再触发 stream ----
  const streamZ = await walkToZ(page, 8);
  expect(streamZ).toBeLessThanOrEqual(8);
  await clickNode(page, "stream");
  await page.waitForTimeout(900);
  const streamState = await readState(page);
  expect(streamState.shards).toContain("2/3");
  shots.push({ ...(await capture(page, SHOTS[2]!.file, streamState)), id: "stream" });

  // ---- 4) 花树：走到树根触发圈内（z < -18，与 M2/AC-02 的到达判据同源）----
  // 花树有碰撞体，玩家会停在 z≈-20.9；这已让花瓣生成点进入镜头视锥。
  const treeZ = await walkToZ(page, -21);
  expect(treeZ).toBeLessThan(-18);
  await clickNode(page, "tree");
  await page.waitForTimeout(1200);
  const treeState = await readState(page);
  expect(treeState.petalsActive).toBeGreaterThan(0); // 花瓣已可见
  expect(treeState.petalLayers.near).toBeGreaterThan(0);
  expect(treeState.petalLayers.mid).toBeGreaterThan(0);
  expect(treeState.petalLayers.far).toBeGreaterThan(0); // 三层齐备
  expect(treeState.cameraFinale).toBe(true); // 镜头拉远中
  expect(treeState.finaleReveal).toBeGreaterThan(0); // 远山/花树显色
  expect(treeState.endingVisible).toBe(false); // UI 尚未出现（故事时序不变）
  shots.push({ ...(await capture(page, SHOTS[3]!.file, treeState)), id: "flower-tree" });

  // ---- 5) 结尾：结局 UI 出现后 ----
  await expect(page.locator(".sw-ending")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".sw-ending__restart")).toBeVisible();
  const endingState = await readState(page);
  expect(endingState.shards).toContain("3/3");
  expect(endingState.endingVisible).toBe(true);
  shots.push({ ...(await capture(page, SHOTS[4]!.file, endingState)), id: "ending" });

  // 五组截图均存在且来自真实页面
  expect(shots).toHaveLength(5);
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
  // 真 GPU 门禁：不得是软件光栅化（截图用于人工对照，必须反映真机画面）
  expect(device.renderer.toLowerCase()).not.toMatch(/swiftshader|software|llvmpipe|softpipe/);
  expect(device.viewport).toEqual({ width: 1280, height: 720 });

  const manifest = {
    note: "V0.2 real-game screenshots from the running page; no reference frames or static composites.",
    spec: "1280x720, debug UI hidden, real Chrome GPU (not SwiftShader)",
    device,
    realMovementPlayerZ: { spawn: 32, flower: flowerZ, stream: streamZ, tree: treeZ },
    shots,
    runtimeErrors: errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  expect(errors).toEqual([]);
});
