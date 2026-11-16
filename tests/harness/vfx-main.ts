/**
 * A5 独立 VFX 测试替身入口（不修改 main.ts）。
 * 只挂载 VfxSystem，通过 window.__VFX_HARNESS__ 暴露事件契约与统计，
 * 供 Playwright 用共享事件驱动验证花瓣/涟漪，而不依赖故事系统实现。
 */
import { Vector3 } from "three";
import { Game } from "../../src/core/Game";
import type { StoryNodeId } from "../../src/core/contracts";
import { VfxSystem } from "../../src/effects/VfxSystem";

export interface VfxHarnessStats {
  readonly running: boolean;
  readonly errorCount: number;
  readonly petals: { readonly active: number; readonly capacity: number; readonly peak: number };
  readonly ripples: { readonly active: number; readonly capacity: number; readonly peak: number };
  readonly treeBursts: number;
  readonly resets: number;
}

export interface VfxHarness {
  emitBloom(x: number, y: number, z: number, radius: number, duration: number): void;
  emitStoryCompleted(nodeId: StoryNodeId): void;
  emitGameFinished(elapsedSeconds: number): void;
  reset(): void;
  step(deltaSeconds: number): void;
  stats(): VfxHarnessStats;
}

declare global {
  interface Window {
    __VFX_HARNESS__?: VfxHarness;
  }
}

function requireEl<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`harness 缺少节点：${selector}`);
  return el;
}

const canvas = requireEl<HTMLCanvasElement>("#game-canvas");
const uiRoot = requireEl<HTMLElement>("#ui-root");
const debugRoot = requireEl<HTMLElement>("#debug-root");

const game = new Game({
  canvas,
  uiRoot,
  debugContainer: debugRoot,
  search: window.location.search,
});

const vfx = new VfxSystem({
  bus: game.events,
  treePosition: new Vector3(0, 0, -22),
  petalCapacity: 160,
  rippleCapacity: 48,
  petalsPerBloom: 48,
  random: { next: () => 0.5 },
});

game.registerSystem(vfx);
game.start();

window.__VFX_HARNESS__ = {
  emitBloom(x, y, z, radius, duration) {
    game.events.emit("color:bloom", {
      position: new Vector3(x, y, z),
      radius,
      duration,
    });
  },
  emitStoryCompleted(nodeId) {
    game.events.emit("story:completed", { nodeId });
  },
  emitGameFinished(elapsedSeconds) {
    game.events.emit("game:finished", { elapsedSeconds });
  },
  reset() {
    game.reset();
  },
  step(deltaSeconds) {
    vfx.update(deltaSeconds, game.context);
  },
  stats() {
    const snapshot = game.getSnapshot();
    const s = vfx.stats;
    return {
      running: snapshot.running,
      errorCount: snapshot.errorCount,
      petals: {
        active: s.petals.active,
        capacity: s.petals.capacity,
        peak: s.petals.peak,
      },
      ripples: {
        active: s.ripples.active,
        capacity: s.ripples.capacity,
        peak: s.ripples.peak,
      },
      treeBursts: s.treeBursts,
      resets: s.resets,
    };
  },
};
