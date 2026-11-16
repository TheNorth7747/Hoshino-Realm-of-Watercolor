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

declare global {
  interface Window {
    __STARWATER__?: StarwaterBridge;
  }
}

/**
 * 模块挂载表。M0 为空：任何业务系统都不在这里提前接上。
 * 集成顺序：A1 rendering → A2 player → A3 world → A4 narrative/ui → A5 effects。
 */
function createSystems(): GameSystem[] {
  return [];
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
