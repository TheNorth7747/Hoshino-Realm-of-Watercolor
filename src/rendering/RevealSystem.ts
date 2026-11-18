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
import { spawnPosition } from "../config/world";
import { Vector3 } from "three";
import { ColorRevealMask } from "./ColorRevealMask";
import type { MaskSurface } from "./MaskSurface";
import { Atmosphere } from "./Atmosphere";
import { FinaleReveal } from "./FinaleReveal";
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
  /** V0.2 开场预染色半径（米）。默认 10（手册要求 8～12）。 */
  readonly spawnRevealRadius?: number;
  /** V0.2 笔刷沿角色朝向的前移距离（米）。默认 1.6；0 = 正脚下。 */
  readonly brushForwardOffset?: number;
  /** 是否挂载结局天空球。默认 true。 */
  readonly enableSkyDome?: boolean;
  /** 测试注入：替换遮罩底层的像素表面（默认用 canvas）。 */
  readonly maskSurface?: MaskSurface;
}

/** V0.2 默认笔刷半径（米）：手册要求 2.5～3.2。 */
export const V02_BRUSH_RADIUS = 2.8;
/** V0.2 默认开场预染色半径（米）：手册要求 8～12；取 8 以避开 A1 的镜像探针（距出生点 10m）。 */
export const V02_SPAWN_REVEAL_RADIUS = 8;
/** V0.2 默认笔刷前移距离（米）。 */
export const V02_BRUSH_FORWARD_OFFSET = 1.6;

export class RevealSystem implements GameSystem {
  readonly id = "reveal";
  readonly phase: SystemPhase = "reveal";

  private readonly options: RevealSystemOptions;
  private readonly unsubscribers: Unsubscribe[] = [];
  /** 最终章远景显色（只影响世界边界之外的远山）。 */
  private readonly finale = new FinaleReveal();
  /** V0.2：结局天空与雾的氛围控制。 */
  private atmosphere: Atmosphere | null = null;
  /** 笔刷落点（角色位置 + 朝向前移），复用避免每帧分配。 */
  private readonly brushPosition = new Vector3();
  private mask: ColorRevealMask | null = null;
  private uniforms: RevealUniforms | null = null;
  private bench: RevealBench | null = null;
  private pass: WatercolorPass | null = null;
  private debugView: RevealDebugView | null = null;

  constructor(options: RevealSystemOptions = {}) {
    this.options = options;
  }

  /** V0.2：开场预染色半径（米）。 */
  get spawnRevealRadius(): number {
    return this.options.spawnRevealRadius ?? V02_SPAWN_REVEAL_RADIUS;
  }

  /** V0.2：笔刷前移距离（米）。 */
  get brushForwardOffset(): number {
    return Math.max(0, this.options.brushForwardOffset ?? V02_BRUSH_FORWARD_OFFSET);
  }

  /** V0.2：结局氛围状态（测试与调试用）。 */
  get atmosphereState(): Atmosphere | null {
    return this.atmosphere;
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

  /** 最终章远景显色状态（调试与测试用）。 */
  get finaleReveal(): FinaleReveal {
    return this.finale;
  }

  init(context: GameContext): void {
    const mask = new ColorRevealMask({
      bounds: context.world.bounds,
      resolution: context.settings.maskResolution,
      ...(this.options.brushRadius === undefined
        ? { brushRadius: V02_BRUSH_RADIUS }
        : { brushRadius: this.options.brushRadius }),
      ...(this.options.maskSurface === undefined ? {} : { surface: this.options.maskSurface }),
    });
    this.mask = mask;
    this.uniforms = createRevealUniforms(mask.texture, context.world.bounds);

    // V0.2：开场预染色（8～12m），让下半屏是连续色域而不是脚下圆斑。
    // 与 reset 共用同一入口，保证「重新进入绘本」得到同一个开场画面。
    this.imprintOpening();

    this.atmosphere = new Atmosphere(
      this.options.enableSkyDome === undefined ? {} : { enableSkyDome: this.options.enableSkyDome },
    );
    this.atmosphere.init(context.scene);

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
    // 最终章远景显色：与花树 bloom 同一事件源，不新建故事状态（PRD 5.4）
    this.unsubscribers.push(
      context.events.on("story:completed", (payload) => {
        if (payload.nodeId === "tree") this.finale.trigger();
      }),
    );
    this.unsubscribers.push(
      context.events.on("game:reset", () => {
        this.mask?.reset();
        // 重置 = 重新进入绘本：回到开场画面（含开场预染色），而不是一张白纸
        this.imprintOpening();
        this.bench?.reset();
        this.finale.reset();
        this.atmosphere?.setFinale(0);
        if (this.uniforms) this.uniforms.uFinaleReveal.value = 0;
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

    // 远景显色推进（只影响世界边界之外的远山；界内遮罩不受影响）
    const finaleValue = this.finale.update(deltaSeconds);
    if (this.uniforms) this.uniforms.uFinaleReveal.value = finaleValue;
    this.atmosphere?.setFinale(finaleValue);

    this.bench?.update(deltaSeconds);

    const source = this.options.playerSource ?? this.bench?.playerSource;
    if (source) {
      // V0.2：笔刷略向角色前方偏移，让「前方先亮」而不是正脚下一点
      const snapshot = source.getPlayerSnapshot();
      const heading = snapshot.headingRadians;
      const offset = this.brushForwardOffset;
      this.brushPosition.set(
        snapshot.position.x + Math.sin(heading) * offset,
        snapshot.position.y,
        snapshot.position.z + Math.cos(heading) * offset,
      );
      mask.update(deltaSeconds, this.brushPosition);
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

    this.atmosphere?.dispose();
    this.atmosphere = null;
  }

  /**
   * V0.2：开场预染色。出生点落一笔大半径印记（8～12m），
   * 让开场下半屏是连续色域，而不是脚下一个小绿斑。
   * 与 reset 共用：重置后重放同一个开场画面。
   */
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
    };
  }
}
