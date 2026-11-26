/**
 * 染色系统挂载点（A1 / V0.3 视觉集成）。
 *
 * GameSystem 契约来自 A0：`phase = "reveal"`，因此它一定在 story/trigger 之后、
 * effects 之前执行（PRD 7.3）。
 */
import type {
  DebugValue,
  GameContext,
  GameSystem,
  PlayerSource,
  SystemPhase,
  Unsubscribe,
} from "../core/contracts";
import { spawnPosition } from "../config/world";
import { Vector3 } from "three";
import { ColorRevealMask } from "./ColorRevealMask";
import type { MaskSurface } from "./MaskSurface";
import { Atmosphere } from "./Atmosphere";
import { FinaleReveal } from "./FinaleReveal";
import { GodRays } from "./GodRays";
import { createProceduralBrushPack, type ProceduralBrushPack } from "./ProceduralBrushes";
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
  /** V0.2/V0.3 开场预染色半径（米）。默认 8。 */
  readonly spawnRevealRadius?: number;
  /** V0.2/V0.3 笔刷沿角色朝向的前移距离（米）。默认 1.6；0 = 正脚下。 */
  readonly brushForwardOffset?: number;
  /** 是否挂载结局天空球。默认 true。 */
  readonly enableSkyDome?: boolean;
  /** 是否挂载结局林间体积光束。默认 true。 */
  readonly enableGodRays?: boolean;
  /** 测试注入：替换遮罩底层的像素表面（默认用 canvas）。 */
  readonly maskSurface?: MaskSurface;
}

/** V0.2/V0.3 默认笔刷半径（米）。 */
export const V02_BRUSH_RADIUS = 2.8;
/** V0.2/V0.3 默认开场预染色半径（米）。 */
export const V02_SPAWN_REVEAL_RADIUS = 8;
/** V0.2/V0.3 默认笔刷前移距离（米）。 */
export const V02_BRUSH_FORWARD_OFFSET = 1.6;

export class RevealSystem implements GameSystem {
  readonly id = "reveal";
  readonly phase: SystemPhase = "reveal";

  private readonly options: RevealSystemOptions;
  private readonly unsubscribers: Unsubscribe[] = [];
  /** 最终章远景显色（只影响世界边界之外的远山）。 */
  private readonly finale = new FinaleReveal();
  /** V0.2/V0.3：结局天空与雾的氛围控制。 */
  private atmosphere: Atmosphere | null = null;
  /** V0.3：结局林间体积光束。 */
  private godRays: GodRays | null = null;
  /** V0.3：程序化水彩与线稿贴图包。 */
  private brushes: ProceduralBrushPack | null = null;
  /** 笔刷落点（角色位置 + 朝向前移），复用避免每帧分配。 */
  private readonly brushPosition = new Vector3();
  private elapsedTime = 0;
  private mask: ColorRevealMask | null = null;
  private uniforms: RevealUniforms | null = null;
  private bench: RevealBench | null = null;
  private pass: WatercolorPass | null = null;
  private debugView: RevealDebugView | null = null;

  constructor(options: RevealSystemOptions = {}) {
    this.options = options;
  }

  get spawnRevealRadius(): number {
    return this.options.spawnRevealRadius ?? V02_SPAWN_REVEAL_RADIUS;
  }

  get brushForwardOffset(): number {
    return Math.max(0, this.options.brushForwardOffset ?? V02_BRUSH_FORWARD_OFFSET);
  }

  get atmosphereState(): Atmosphere | null {
    return this.atmosphere;
  }

  get brushPack(): ProceduralBrushPack | null {
    return this.brushes;
  }

  get godRaysState(): GodRays | null {
    return this.godRays;
  }

  get colorRevealMask(): ColorRevealMask | null {
    return this.mask;
  }

  get revealUniforms(): RevealUniforms | null {
    return this.uniforms;
  }

  get paperPass(): WatercolorPass | null {
    return this.pass;
  }

  get finaleReveal(): FinaleReveal {
    return this.finale;
  }

  init(context: GameContext): void {
    this.elapsedTime = 0;
    const mask = new ColorRevealMask({
      bounds: context.world.bounds,
      resolution: context.settings.maskResolution,
      ...(this.options.brushRadius === undefined
        ? { brushRadius: V02_BRUSH_RADIUS }
        : { brushRadius: this.options.brushRadius }),
      ...(this.options.maskSurface === undefined ? {} : { surface: this.options.maskSurface }),
    });
    this.mask = mask;
    this.brushes = createProceduralBrushPack();
    this.uniforms = createRevealUniforms(mask.texture, context.world.bounds);

    this.imprintOpening();

    this.atmosphere = new Atmosphere(
      this.options.enableSkyDome === undefined ? {} : { enableSkyDome: this.options.enableSkyDome },
    );
    this.atmosphere.init(context.scene);

    if (this.options.enableGodRays !== false) {
      this.godRays = new GodRays();
      this.godRays.init(context.scene);
    }

    const enableBench = this.options.enableBench ?? context.settings.debugEnabled;
    if (enableBench) {
      this.bench = new RevealBench({ uniforms: this.uniforms, parent: context.worldRoot });
    }

    const enablePaperPass = this.options.enablePaperPass ?? true;
    if (enablePaperPass) {
      this.pass = new WatercolorPass(context.renderer, context.scene, context.camera, {
        paperTexture: this.brushes.paperGrain,
        ...(this.options.paperPassStrength === undefined
          ? {}
          : { strength: this.options.paperPassStrength }),
      });
      this.pass.setSize(
        context.canvas.clientWidth || window.innerWidth,
        context.canvas.clientHeight || window.innerHeight,
      );
    }

    this.unsubscribers.push(
      context.events.on("color:bloom", (payload) => {
        this.mask?.bloom(payload.position, payload.radius, payload.duration);
      }),
    );
    this.unsubscribers.push(
      context.events.on("story:completed", (payload) => {
        if (payload.nodeId === "tree") this.finale.trigger();
      }),
    );
    this.unsubscribers.push(
      context.events.on("game:reset", () => {
        this.mask?.reset();
        this.imprintOpening();
        this.bench?.reset();
        this.finale.reset();
        this.atmosphere?.setFinale(0);
        this.godRays?.setFinale(0);
        if (this.uniforms) {
          this.uniforms.uFinaleReveal.value = 0;
          this.uniforms.uGlobalReveal.value = 0;
        }
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

    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.elapsedTime += dt;

    if (this.uniforms) {
      this.uniforms.uCameraPosition.value.copy(context.camera.position);
      this.uniforms.uTime.value = this.elapsedTime;
    }

    const finaleValue = this.finale.update(dt);
    if (this.uniforms) {
      this.uniforms.uFinaleReveal.value = finaleValue;
      this.uniforms.uGlobalReveal.value = finaleValue;
    }
    this.atmosphere?.setFinale(finaleValue);
    this.atmosphere?.setTime(this.elapsedTime);
    this.godRays?.setFinale(finaleValue);
    this.godRays?.update(dt);

    this.bench?.update(dt);

    const source = this.options.playerSource ?? this.bench?.playerSource;
    if (source) {
      const snapshot = source.getPlayerSnapshot();
      const heading = snapshot.headingRadians;
      const offset = this.brushForwardOffset;
      this.brushPosition.set(
        snapshot.position.x + Math.sin(heading) * offset,
        snapshot.position.y,
        snapshot.position.z + Math.cos(heading) * offset,
      );
      mask.update(dt, this.brushPosition);
    } else {
      mask.advance(dt);
    }
  }

  renderFrame(context: GameContext): boolean {
    if (!this.pass) return false;
    this.pass.renderWithComposer(context.scene, context.camera);
    return true;
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

    this.godRays?.dispose();
    this.godRays = null;

    this.atmosphere?.dispose();
    this.atmosphere = null;

    this.brushes?.dispose();
    this.brushes = null;
  }

  private imprintOpening(): void {
    const mask = this.mask;
    if (!mask) return;
    const spawn = spawnPosition();
    this.brushPosition.set(spawn.x, spawn.y, spawn.z);
    mask.stamp(this.brushPosition, this.spawnRevealRadius);
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
      finale: Number(this.finale.value.toFixed(2)),
      opening: `${this.spawnRevealRadius.toFixed(1)}m`,
      brushAhead: `${this.brushForwardOffset.toFixed(1)}m`,
      atmosphere: Number((this.atmosphere?.value ?? 0).toFixed(2)),
      godRays: Number((this.godRays?.value ?? 0).toFixed(2)),
    };
  }
}
