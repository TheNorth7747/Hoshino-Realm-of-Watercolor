/**
 * 游戏主循环与系统宿主（A0 独占）。
 *
 * 职责边界：
 * - 创建渲染器 / 空场景 / 事件总线 / 调试通道，并按阶段顺序调度 `GameSystem`。
 * - 不实现任何业务：染色、玩家、场景、故事、VFX 都由 A1～A5 以 GameSystem 形式挂入。
 *
 * 每帧顺序（PRD 7.3）：
 *   输入 → 玩家 → 伙伴 → 故事/触发器 → 染色 → VFX → 镜头 → 渲染 → 调试统计
 * 其中系统按 `SYSTEM_PHASES` 排序执行，渲染与统计由 Game 收尾。
 */
import type {
  DebugSnapshot,
  EngineSettings,
  GameContext,
  GameSystem,
  SystemRegistry,
} from "./contracts";
import { SYSTEM_PHASES, systemPhaseIndex } from "./contracts";
import { GameDebug, DebugOverlay } from "./debug";
import { clampDelta, readEngineSettings, applyDprCap } from "./config";
import { AppError } from "./errors";
import { EventBus } from "./EventBus";
import { createSceneScaffold, type SceneScaffold } from "./SceneScaffold";
import { WORLD_BOUNDS, sampleTerrainHeight, spawnPosition } from "../config/world";
import { createRenderer, type RendererBundle } from "../rendering/Renderer";

export interface GameOptions {
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;
  readonly debugContainer?: HTMLElement | null;
  readonly search?: string;
  readonly systems?: readonly GameSystem[];
}

const FPS_SMOOTHING = 0.1;

export class Game implements SystemRegistry {
  readonly settings: EngineSettings;
  readonly events: EventBus;
  readonly debug: GameDebug;
  readonly context: GameContext;

  private readonly rendererBundle: RendererBundle;
  private readonly scaffold: SceneScaffold;
  private readonly overlay: DebugOverlay | null;
  private readonly registered: GameSystem[] = [];

  private rafId = 0;
  private lastTimestamp = 0;
  private started = false;
  private paused = false;
  private elapsedSeconds = 0;
  private fps = 0;
  private frameTimeMs = 0;

  private readonly handleResize = (): void => {
    this.resize();
  };

  private readonly handleVisibility = (): void => {
    this.paused = document.hidden;
    // 切回页面时重置时间基准，配合 delta 截断避免瞬移。
    this.lastTimestamp = performance.now();
  };

  constructor(options: GameOptions) {
    this.settings = readEngineSettings(options.search);
    this.debug = new GameDebug(this.settings.debugEnabled);
    this.events = new EventBus({
      onHandlerError: (error, type) => {
        this.debug.reportError(error, `event:${String(type)}`);
      },
    });

    this.rendererBundle = createRenderer(options.canvas, this.settings);
    this.scaffold = createSceneScaffold({
      settings: this.settings,
      bounds: WORLD_BOUNDS,
      spawn: spawnPosition(),
    });

    this.context = {
      canvas: options.canvas,
      scene: this.scaffold.scene,
      camera: this.scaffold.camera,
      renderer: this.rendererBundle.renderer,
      events: this.events,
      debug: this.debug,
      settings: this.settings,
      world: { bounds: WORLD_BOUNDS, sampleHeight: sampleTerrainHeight },
      uiRoot: options.uiRoot,
      worldRoot: this.scaffold.worldRoot,
    };

    this.debug.setSnapshotProvider(() => this.getSnapshot());

    this.overlay =
      this.settings.debugEnabled && options.debugContainer
        ? new DebugOverlay({ container: options.debugContainer, debug: this.debug })
        : null;

    for (const system of options.systems ?? []) {
      this.registerSystem(system);
    }

    window.addEventListener("resize", this.handleResize);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.paused = document.hidden;
    this.resize();
  }

  get isRunning(): boolean {
    return this.started;
  }

  get systems(): readonly GameSystem[] {
    return this.registered;
  }

  registerSystem(system: GameSystem): void {
    if (this.started) {
      throw new AppError(
        "system-registration",
        `系统 "${system.id}" 必须在 Game.start() 之前注册。`,
      );
    }
    if (this.registered.some((entry) => entry.id === system.id)) {
      throw new AppError("system-registration", `系统 ID 重复：${system.id}`);
    }
    this.registered.push(system);
    // 稳定排序：同阶段内保持注册顺序。
    this.registered.sort((a, b) => systemPhaseIndex(a.phase) - systemPhaseIndex(b.phase));
    this.debug.log(`system registered: ${system.id}`, { phase: system.phase });
  }

  getSystem<T extends GameSystem = GameSystem>(id: string): T | undefined {
    return this.registered.find((system) => system.id === id) as T | undefined;
  }

  start(): void {
    if (this.started) return;

    for (const system of this.registered) {
      system.init?.(this.context);
    }

    this.started = true;
    this.lastTimestamp = performance.now();
    this.overlay?.start();
    this.rafId = requestAnimationFrame(this.tick);
    this.debug.log("game started", {
      systems: this.registered.map((system) => system.id),
      debug: this.settings.debugEnabled,
      phases: SYSTEM_PHASES,
    });
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    this.overlay?.stop();
  }

  /** 重置：唯一入口是 `game:reset` 事件，避免事件与方法双触发（PRD 8.4）。 */
  reset(): void {
    this.elapsedSeconds = 0;
    this.events.emit("game:reset");
    this.debug.log("game reset");
  }

  getSnapshot(): DebugSnapshot {
    const renderInfo = this.rendererBundle.renderer.info.render;
    return {
      enabled: this.settings.debugEnabled,
      running: this.started,
      elapsedSeconds: Number(this.elapsedSeconds.toFixed(2)),
      fps: Number(this.fps.toFixed(1)),
      frameTimeMs: Number(this.frameTimeMs.toFixed(2)),
      drawCalls: renderInfo.calls,
      triangles: renderInfo.triangles,
      systems: this.registered.map((system) => system.id),
      errorCount: this.debug.errorCount,
    };
  }

  dispose(): void {
    this.stop();
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("visibilitychange", this.handleVisibility);

    this.overlay?.dispose();
    for (const system of [...this.registered].reverse()) {
      system.dispose?.();
    }
    this.registered.length = 0;
    this.events.clear();
    this.scaffold.dispose();
    this.rendererBundle.dispose();
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.started) return;
    this.rafId = requestAnimationFrame(this.tick);

    const rawDelta = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    if (this.paused) return;

    const delta = clampDelta(rawDelta, this.settings.maxDeltaSeconds);
    this.elapsedSeconds += delta;
    this.step(delta);
    this.renderFrame();
    this.measureFrame(delta);
  };

  private step(deltaSeconds: number): void {
    for (const system of this.registered) {
      system.update?.(deltaSeconds, this.context);
    }
  }

  private renderFrame(): void {
    this.rendererBundle.renderer.render(this.scaffold.scene, this.scaffold.camera);
  }

  private measureFrame(deltaSeconds: number): void {
    const frameMs = deltaSeconds * 1000;
    if (frameMs <= 0) return;
    this.frameTimeMs =
      this.frameTimeMs === 0
        ? frameMs
        : this.frameTimeMs * (1 - FPS_SMOOTHING) + frameMs * FPS_SMOOTHING;
    this.fps = this.frameTimeMs > 0 ? 1000 / this.frameTimeMs : 0;
  }

  private resize(): void {
    const width = Math.max(1, this.context.canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, this.context.canvas.clientHeight || window.innerHeight);

    this.rendererBundle.resize(width, height, window.devicePixelRatio);
    this.rendererBundle.renderer.setPixelRatio(
      applyDprCap(window.devicePixelRatio, this.settings.dprCap),
    );

    this.scaffold.camera.aspect = width / height;
    this.scaffold.camera.updateProjectionMatrix();

    for (const system of this.registered) {
      system.resize?.(width, height);
    }
  }
}
