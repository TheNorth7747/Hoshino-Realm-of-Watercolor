/**
 * A1 开发期验证入口（只在 dev server 上按需加载，不进构建产物）。
 *
 * 用途：A2/A3 尚未合并时，用真实渲染验证“世界坐标染色”而不是屏幕滤镜。
 * 用法（Playwright 或浏览器控制台）：
 *   const mod = await import('/src/rendering/devHarness.ts');
 *   const handle = mod.startRevealHarness({ enableBench: true });
 *   handle.revealAtWorld(-8, 26);   // 0..1 显色值
 */
import { Game } from "../core/Game";
import type { GameSystem, StarwaterBridge } from "../core/contracts";
import { WORLD_BOUNDS } from "../config/world";
import { RevealSystem } from "./RevealSystem";
import { worldToMaskUv } from "./maskMapping";

export interface RevealHarnessOptions {
  readonly search?: string;
  readonly enableBench?: boolean;
  readonly enablePaperPass?: boolean;
  /** 仅用于取景（A2 的 CameraRig 尚未集成），默认俯瞰 L 形路径。 */
  readonly cameraPose?: {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
  };
}

export interface RevealHarnessHandle {
  readonly game: Game;
  readonly reveal: RevealSystem;
  /** 世界坐标处的显色值 0..1（R 通道），越界返回 0。 */
  revealAtWorld(x: number, z: number): number;
  stop(): void;
}

interface DisposableBridge {
  readonly game?: { dispose?: () => void };
}

export function startRevealHarness(options: RevealHarnessOptions = {}): RevealHarnessHandle {
  // 停掉 A0 默认 Game，避免两个渲染循环同时跑；同时移除旧 DOM，避免 #debug-root 重复
  const existing = window.__STARWATER__ as unknown as DisposableBridge | undefined;
  existing?.game?.dispose?.();
  document.querySelector("#app")?.remove();

  const root = document.createElement("div");
  root.id = "a1-harness";
  root.style.cssText = "position:fixed;inset:0;z-index:60;background:#f2ede4";

  const canvas = document.createElement("canvas");
  canvas.id = "a1-canvas";
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;outline:none";

  const uiRoot = document.createElement("div");
  uiRoot.style.cssText = "position:absolute;inset:0;pointer-events:none";

  const debugRoot = document.createElement("div");
  debugRoot.id = "debug-root";
  debugRoot.style.cssText =
    "position:absolute;top:12px;left:12px;max-width:340px;max-height:calc(100% - 24px);" +
    "overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(24,22,20,.82);" +
    "color:#f4efe6;font:12px/1.5 Consolas,monospace";

  root.append(canvas, uiRoot, debugRoot);
  document.body.append(root);

  const reveal = new RevealSystem({
    enableBench: options.enableBench ?? true,
    enablePaperPass: options.enablePaperPass ?? true,
  });
  const systems: GameSystem[] = [reveal];

  const game = new Game({
    canvas,
    uiRoot,
    debugContainer: debugRoot,
    search: options.search ?? "?debug=1",
    systems,
  });

  const bridge: StarwaterBridge = { version: "a1-harness", game };
  window.__STARWATER__ = bridge;

  game.start();

  // 取景：A2 的 CameraRig 尚未集成，这里直接把相机摆到能看清 L 形路径的位置
  const pose = options.cameraPose ?? {
    position: [14, 16, 46] as const,
    target: [-4, 0, 26] as const,
  };
  game.context.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  game.context.camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
  game.context.camera.updateProjectionMatrix();

  const handle: RevealHarnessHandle = {
    game,
    reveal,
    revealAtWorld(x: number, z: number): number {
      const mask = reveal.colorRevealMask;
      if (!mask) return 0;
      const uv = worldToMaskUv(x, z, WORLD_BOUNDS);
      return mask.surface.readRevealAt(uv.u, uv.v);
    },
    stop(): void {
      game.dispose();
      root.remove();
    },
  };

  window.__STARWATER_REVEAL_STATE__ = handle;
  return handle;
}

declare global {
  interface Window {
    __STARWATER_REVEAL__?: typeof startRevealHarness;
    __STARWATER_REVEAL_STATE__?: RevealHarnessHandle;
  }
}

window.__STARWATER_REVEAL__ = startRevealHarness;
