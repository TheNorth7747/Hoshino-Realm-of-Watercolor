/**
 * A2 测试助手：构造不依赖 DOM/WebGL 的 GameContext 替身。
 *
 * PlayerController / CameraRig 只消费 GameContext 契约（scene/camera/events/
 * debug/settings/world），这里按契约逐字段提供最小实现；
 * 渲染器与 UI 根节点在本模块测试中不被触碰。
 */
import { Group, PerspectiveCamera, Scene } from "three";
import type {
  DebugApi,
  DebugSnapshot,
  DebugStatSource,
  DebugValue,
  EngineSettings,
  GameContext,
  GameSystem,
  WorldBounds,
} from "../../../src/core/contracts";
import { EventBus } from "../../../src/core/EventBus";
import { WORLD_BOUNDS } from "../../../src/config/world";

export function createFakeSettings(
  overrides: Partial<EngineSettings> = {},
): EngineSettings {
  return {
    appName: "Hoshino: Realm of Watercolor",
    maxDeltaSeconds: 0.05,
    dprCap: 1.5,
    maskResolution: 512,
    clearColor: 0xf2ede4,
    debugEnabled: false,
    ...overrides,
  };
}

/** 收集 stat source 的最小 DebugApi 替身。 */
export class FakeDebug implements DebugApi {
  readonly enabled = false;
  readonly errorMessages: string[] = [];
  private readonly sources = new Map<string, DebugStatSource>();

  log(): void {
    // 测试中不关心日志。
  }

  reportError(error: unknown, context?: string): void {
    this.errorMessages.push(`${context ?? ""}: ${String(error)}`);
  }

  registerStatSource(source: DebugStatSource): () => void {
    this.sources.set(source.id, source);
    return () => {
      this.sources.delete(source.id);
    };
  }

  readStats(): Record<string, DebugValue> {
    const stats: Record<string, DebugValue> = {};
    for (const [id, source] of this.sources) {
      for (const [key, value] of Object.entries(source.read())) {
        stats[`${id}.${key}`] = value;
      }
    }
    return stats;
  }

  snapshot(): DebugSnapshot {
    return {
      enabled: this.enabled,
      running: true,
      elapsedSeconds: 0,
      fps: 60,
      frameTimeMs: 16.7,
      drawCalls: 0,
      triangles: 0,
      systems: [],
      errorCount: this.errorMessages.length,
    };
  }
}

export interface FakeContextOptions {
  /** 测试地形高度采样；默认平坦 y=0。 */
  readonly sampleHeight?: (x: number, z: number) => number;
  /** 测试世界边界；默认 config/world.ts 的 WORLD_BOUNDS。 */
  readonly bounds?: WorldBounds;
  readonly settings?: Partial<EngineSettings>;
}

export function createFakeGameContext(options: FakeContextOptions = {}): GameContext {
  return {
    canvas: {} as HTMLCanvasElement,
    scene: new Scene(),
    camera: new PerspectiveCamera(50, 1, 0.1, 500),
    renderer: {} as never,
    events: new EventBus(),
    debug: new FakeDebug(),
    settings: createFakeSettings(options.settings),
    world: {
      bounds: options.bounds ?? WORLD_BOUNDS,
      sampleHeight: options.sampleHeight ?? (() => 0),
    },
    uiRoot: {} as HTMLElement,
    worldRoot: new Group(),
  };
}

/** 以固定步长驱动若干帧（60FPS 基准）。 */
export function runFrames(
  system: GameSystem,
  context: GameContext,
  frames: number,
  deltaSeconds = 1 / 60,
): void {
  for (let i = 0; i < frames; i += 1) {
    system.update?.(deltaSeconds, context);
  }
}

/** 把镜头摆在目标 +Z 侧看向原点水平方向（forward = -Z）。 */
export function placeCameraLookingNegZ(camera: PerspectiveCamera): void {
  camera.position.set(0, 3, 9);
  camera.lookAt(0, 1, 0);
}

/** A0 之外的“测试地形”：缓起伏山丘，坡度远小于可通行阈值。 */
export function hillyTerrain(x: number, z: number): number {
  return Math.sin(x / 9) * 0.6 + Math.cos(z / 12) * 0.8;
}
