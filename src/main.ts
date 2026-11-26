/**
 * 入口（A0 独占 / V0.3 极简自由探索挂载）。
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
import { createMinimalExploreSystems } from "./narrative";
import { AudioSystem, VfxSystem, type VfxStats } from "./effects";
import { landmarkPosition } from "./config/world";
import type { Texture } from "three";

declare global {
  interface Window {
    __STARWATER__?: StarwaterBridge;
  }
}

interface SystemsBuild {
  readonly systems: readonly GameSystem[];
  attachColliders(): void;
}

interface VfxSystemAdapter extends GameSystem {
  readonly stats: VfxStats | null;
}

function createVfxSystem(petalTextureProvider: () => Texture | null): VfxSystemAdapter {
  let inner: VfxSystem | null = null;
  const adapter: VfxSystemAdapter = {
    id: "effects-vfx",
    phase: "effects",
    init(context): void {
      inner = new VfxSystem({
        bus: context.events,
        treePosition: () => landmarkPosition("tree"),
        petalTextureProvider,
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

function createSystems(): SystemsBuild {
  const { player, camera } = createPlayerSystems();
  const reveal = new RevealSystem({ playerSource: player, enableBench: false });
  const world = createWorldSystem({
    revealUniformsProvider: () => reveal.revealUniforms,
    brushPackProvider: () => reveal.brushPack,
  });
  const audio = new AudioSystem();
  const explore = createMinimalExploreSystems({
    player,
    hud: {
      onToggleAudio: () => audio.toggleMute(),
      isAudioMuted: () => audio.isMuted(),
    },
  });
  const vfx = createVfxSystem(() => reveal.brushPack?.petal ?? null);

  return {
    systems: [player, reveal, world, ...explore, vfx, audio, camera],
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
