/**
 * 入口（A0 独占）。A1～A5 不修改本文件：
 * 需要挂载时，由集成者在 `createSystems()` 里加入对应 GameSystem。
 */
import "./styles/main.css";
import { Game } from "./core/Game";
import { APP_VERSION } from "./core/config";
import {
  AppError,
  installGlobalErrorHandlers,
  showFatalError,
  toFatalErrorDetail,
} from "./core/errors";
import type { GameSystem, StarwaterBridge } from "./core/contracts";
import { createPlayerSystems } from "./player";
import { RevealSystem } from "./rendering";
import { createWorldSystem } from "./world";
import { createNarrativeSystems } from "./narrative";
import { VfxSystem, type VfxStats } from "./effects";
import { landmarkPosition } from "./config/world";

declare global {
  interface Window {
    __STARWATER__?: StarwaterBridge;
  }
}

interface SystemsBuild {
  readonly systems: readonly GameSystem[];
  /**
   * 世界碰撞体在 WorldSystem.init() 里才构建，而 init 发生在 Game.start() 内部，
   * 所以必须等 start 之后再接入，否则玩家拿到的是空碰撞表（A3 示例里的顺序是错的）。
   */
  attachColliders(): void;
}

/**
 * VfxSystem 构造时需要事件总线，而总线由 Game 内部创建、只能从 GameContext 拿到。
 * 这里用一个延迟构造的适配器：init(context) 时才真正 new VfxSystem。
 * 同时把 `stats` 透出来，供调试面板与 A6 的验收测试读取。
 */
interface VfxSystemAdapter extends GameSystem {
  readonly stats: VfxStats | null;
}

function createVfxSystem(): VfxSystemAdapter {
  let inner: VfxSystem | null = null;
  const adapter: VfxSystemAdapter = {
    id: "effects-vfx",
    phase: "effects",
    init(context): void {
      inner = new VfxSystem({
        bus: context.events,
        treePosition: () => landmarkPosition("tree"),
      });
      inner.init(context);
    },
    update(deltaSeconds, context): void {
      inner?.update(deltaSeconds, context);
    },
    dispose(): void {
      inner?.dispose();
      inner = null;
    },
    get stats(): VfxStats | null {
      return inner?.stats ?? null;
    },
  };
  return adapter;
}

/**
 * 模块挂载表（集成者独占）。
 * M3：A4 故事/伙伴/星屑/UI + A3 场景 + A2 玩家/镜头 + A1 染色。A5 VFX 合入后继续追加。
 */
function createSystems(): SystemsBuild {
  const { player, camera } = createPlayerSystems();
  // M2 起用真实场景，关掉 A1 的调试验证台
  const reveal = new RevealSystem({ playerSource: player, enableBench: false });
  const world = createWorldSystem({
    revealUniformsProvider: () => reveal.revealUniforms,
  });
  // companion → story → HUD/对话/结局/调试（同阶段内按注册顺序执行）
  const narrative = createNarrativeSystems({ player });
  const vfx = createVfxSystem();

  return {
    // 注册顺序：player → reveal → world → narrative → vfx → camera。
    // Game 按 SYSTEM_PHASES 稳定排序，所以 story 一定在 reveal 之前、
    // world 的水彩材质绑定在 RevealSystem 之后（PRD 7.3）。
    systems: [player, reveal, world, ...narrative, vfx, camera],
    attachColliders(): void {
      player.addColliders(world.getColliders());
    },
  };
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new AppError("dom-missing", `缺少必需的 DOM 节点：${selector}`);
  }
  return element;
}

function hideBootStatus(): void {
  const boot = document.querySelector<HTMLElement>("#boot-status");
  if (boot) boot.hidden = true;
}

let booted = false;

function bootstrap(): void {
  const canvas = requireElement<HTMLCanvasElement>("#game-canvas");
  const uiRoot = requireElement<HTMLElement>("#ui-root");
  const debugContainer = document.querySelector<HTMLElement>("#debug-root");

  const build = createSystems();
  const game = new Game({
    canvas,
    uiRoot,
    debugContainer,
    search: window.location.search,
    systems: [...build.systems],
  });

  window.__STARWATER__ = { version: APP_VERSION, game };
  game.start();
  build.attachColliders();

  // 等第一帧真正画出来再撤掉启动提示，避免闪一下空白。
  requestAnimationFrame(() => {
    requestAnimationFrame(hideBootStatus);
  });

  window.addEventListener("beforeunload", () => {
    game.dispose();
  });
}

installGlobalErrorHandlers((error, context) => {
  console.error(`[starwater] ${context}`, error);
  if (!booted) showFatalError(toFatalErrorDetail(error));
});

try {
  bootstrap();
  booted = true;
} catch (error) {
  console.error("[starwater] boot failed", error);
  showFatalError(toFatalErrorDetail(error));
}
