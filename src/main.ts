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

declare global {
  interface Window {
    __STARWATER__?: StarwaterBridge;
  }
}

/**
 * 模块挂载表（集成者独占）。
 * M1：A2 玩家/镜头 + A1 染色已接入。
 * A3 场景、A4 故事/UI、A5 VFX 合入后在这里继续追加。
 */
function createSystems(): GameSystem[] {
  const { player, camera } = createPlayerSystems();
  // RevealSystem 读取 playerSource 的玩家位置落笔；bench 只在 ?debug=1 下挂载
  const reveal = new RevealSystem({ playerSource: player });
  return [player, reveal, camera];
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

  const game = new Game({
    canvas,
    uiRoot,
    debugContainer,
    search: window.location.search,
    systems: createSystems(),
  });

  window.__STARWATER__ = { version: APP_VERSION, game };
  game.start();

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
