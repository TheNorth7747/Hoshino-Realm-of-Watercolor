/**
 * 染色系统挂载点（A1）。
 *
 * GameSystem 契约来自 A0：`phase = "reveal"`，因此它一定在 story/trigger 之后、
 * effects 之前执行（PRD 7.3）。
 *
 * 集成方式（main.ts 由集成者改，A1 不动共享文件）：
 *   new RevealSystem({ playerSource: playerController })   // A2 的控制器实现 PlayerSource
 * 场景材质由 A3 通过 `createWatercolorMaterial({ uniforms: reveal.revealUniforms, ... })` 取用，
 * 保证地面/草/水/花树共用同一份 uniforms（AC-05）。
 */
import type {
  DebugValue,
  GameContext,
  GameSystem,
  PlayerSource,
  SystemPhase,
  Unsubscribe,
} from "../core/contracts";
import { ColorRevealMask } from "./ColorRevealMask";
import { RevealBench } from "./RevealBench";
import { RevealDebugView } from "./RevealDebugView";
import { WatercolorPass } from "./WatercolorPass";
import { createRevealUniforms, type RevealUniforms } from "./WatercolorMaterial";

export interface RevealSystemOptions {
  /** A2 的玩家来源；缺省时使用 bench 行走器（仅调试），都没有则不落笔刷。 */
  readonly playerSource?: PlayerSource;
  /** 是否挂载 A1 验证台。缺省：debug 模式开启。 */
  readonly enableBench?: boolean;
  /** 是否启用纸张后期。默认 true。 */
  readonly enablePaperPass?: boolean;
  readonly paperPassStrength?: number;
  readonly brushRadius?: number;
}

export class RevealSystem implements GameSystem {
  readonly id = "reveal";
  readonly phase: SystemPhase = "reveal";

  private readonly options: RevealSystemOptions;
  private readonly unsubscribers: Unsubscribe[] = [];
  private mask: ColorRevealMask | null = null;
  private uniforms: RevealUniforms | null = null;
  private bench: RevealBench | null = null;
  private pass: WatercolorPass | null = null;
  private debugView: RevealDebugView | null = null;

  constructor(options: RevealSystemOptions = {}) {
    this.options = options;
  }

  /** 供 A3 取材质 uniforms、供调试与测试读取。 */
  get colorRevealMask(): ColorRevealMask | null {
    return this.mask;
  }

  get revealUniforms(): RevealUniforms | null {
    return this.uniforms;
  }

  get paperPass(): WatercolorPass | null {
    return this.pass;
  }

  init(context: GameContext): void {
    const mask = new ColorRevealMask({
      bounds: context.world.bounds,
      resolution: context.settings.maskResolution,
      ...(this.options.brushRadius === undefined ? {} : { brushRadius: this.options.brushRadius }),
    });
    this.mask = mask;
    this.uniforms = createRevealUniforms(mask.texture, context.world.bounds);

    const enableBench = this.options.enableBench ?? context.settings.debugEnabled;
    if (enableBench) {
      this.bench = new RevealBench({ uniforms: this.uniforms, parent: context.worldRoot });
    }

    const enablePaperPass = this.options.enablePaperPass ?? true;
    if (enablePaperPass) {
      this.pass = new WatercolorPass(
        context.renderer,
        context.scene,
        context.camera,
        this.options.paperPassStrength === undefined
          ? {}
          : { strength: this.options.paperPassStrength },
      );
      this.pass.setSize(
        context.canvas.clientWidth || window.innerWidth,
        context.canvas.clientHeight || window.innerHeight,
      );
      this.pass.install();
    }

    this.unsubscribers.push(
      context.events.on("color:bloom", (payload) => {
        this.mask?.bloom(payload.position, payload.radius, payload.duration);
      }),
    );
    this.unsubscribers.push(
      context.events.on("game:reset", () => {
        this.mask?.reset();
        this.bench?.reset();
      }),
    );
    this.unsubscribers.push(
      context.debug.registerStatSource({ id: "reveal", read: () => this.readStats() }),
    );

    if (context.settings.debugEnabled) {
      this.debugView = new RevealDebugView({ mask, bounds: context.world.bounds });
      this.debugView.start();
    }

    context.debug.log("reveal system ready", {
      brushRadius: mask.brushRadius,
      resolution: context.settings.maskResolution,
      paperPass: this.pass !== null,
      bench: this.bench !== null,
    });
  }

  update(deltaSeconds: number, context: GameContext): void {
    const mask = this.mask;
    if (!mask) return;

    // 排线按相机距离加粗需要相机世界坐标
    this.uniforms?.uCameraPosition.value.copy(context.camera.position);

    this.bench?.update(deltaSeconds);

    const source = this.options.playerSource ?? this.bench?.playerSource;
    if (source) {
      mask.update(deltaSeconds, source.getPlayerSnapshot().position);
    } else {
      mask.advance(deltaSeconds);
    }
  }

  resize(width: number, height: number): void {
    this.pass?.setSize(width, height);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;

    this.debugView?.dispose();
    this.debugView = null;

    this.pass?.dispose();
    this.pass = null;

    this.bench?.dispose();
    this.bench = null;

    this.mask?.dispose();
    this.mask = null;
    this.uniforms = null;
  }

  private readStats(): Readonly<Record<string, DebugValue>> {
    const mask = this.mask;
    if (!mask) return {};
    const info = mask.getDebugInfo();
    return {
      brushRadius: `${info.brushRadius.toFixed(2)}m`,
      stamps: info.stampCount,
      flushes: info.flushCount,
      blooms: info.activeBlooms,
      coverage: `${(mask.surface.readRevealCoverage() * 100).toFixed(1)}%`,
    };
  }
}
