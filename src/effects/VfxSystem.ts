/**
 * 事件驱动的 VFX 系统（A5，PRD 8.4 / 9.7 / 12.2）。
 *
 * 边界：
 * - 只消费共享事件契约（color:bloom / story:completed / game:reset），不读故事系统内部状态。
 * - 花树花瓣由 `story:completed({nodeId:"tree"})` 触发，染色涟漪由 `color:bloom` 触发。
 * - 逻辑不等待粒子结束：事件处理是 O(1) 生成，粒子在 update 中自行回收。
 * - 音频属于 P1，本系统完全不依赖它，关闭音频不影响任何流程。
 */
import type { Vector3 } from "three";
import type { DebugValue, EventBusLike, GameContext, GameSystem } from "../core/contracts";
import { landmarkPosition } from "../config/world";
import {
  PetalEmitter,
  defaultRandom,
  type ParticleCounts,
  type PetalLayerCounts,
  type PetalLayerSpec,
  type RandomSource,
} from "./Petals";
import { RippleEmitter } from "./Ripples";

export interface VfxSystemOptions {
  /** 事件总线由集成者/测试替身注入，符合共享契约 EventBusLike。 */
  readonly bus: EventBusLike;
  /** 花树位置；测试可注入固定坐标，不写死故事状态。 */
  readonly treePosition?: Vector3 | (() => Vector3);
  readonly petalCapacity?: number;
  readonly rippleCapacity?: number;
  readonly petalsPerBloom?: number;
  readonly petalLifetimeSeconds?: number;
  readonly rippleLifetimeSeconds?: number;
  /** 横向风漂移基准速度（m/s），各层再乘 windScale。 */
  readonly windSpeed?: number;
  /** 下落终端速度（m/s）。 */
  readonly petalMaxFallSpeed?: number;
  /** 可注入分层配置（测试用）；默认 PETAL_LAYERS。 */
  readonly petalLayers?: readonly PetalLayerSpec[];
  readonly random?: RandomSource;
}

export interface VfxStats {
  readonly petals: ParticleCounts;
  readonly ripples: ParticleCounts;
  /** V0.2：近/中/远景当前活跃花瓣数，供结构断言与调试面板读取。 */
  readonly petalLayerCounts: PetalLayerCounts;
  /** V0.2：透明覆盖面积比（相对单层同容量全尺寸基准）。 */
  readonly overlayAreaRatio: number;
  readonly treeBursts: number;
  readonly resets: number;
}

const DEFAULT_PETAL_CAPACITY = 160;
const DEFAULT_RIPPLE_CAPACITY = 48;
const DEFAULT_PETALS_PER_BLOOM = 64;

export class VfxSystem implements GameSystem {
  readonly id = "effects-vfx";
  readonly phase = "effects" as const;

  private readonly bus: EventBusLike;
  private readonly petals: PetalEmitter;
  private readonly ripples: RippleEmitter;
  private readonly resolveTreePosition: () => Vector3;
  private readonly petalsPerBloom: number;
  private readonly unsubscribers: Array<() => void> = [];
  private readonly attached = { value: false };

  private treeBursts = 0;
  private resets = 0;
  private disposed = false;

  constructor(options: VfxSystemOptions) {
    this.bus = options.bus;
    const random = options.random ?? defaultRandom;

    this.petals = new PetalEmitter({
      capacity: options.petalCapacity ?? DEFAULT_PETAL_CAPACITY,
      random,
      ...(options.petalLifetimeSeconds !== undefined
        ? { lifetimeSeconds: options.petalLifetimeSeconds }
        : {}),
      ...(options.windSpeed !== undefined ? { windSpeed: options.windSpeed } : {}),
      ...(options.petalMaxFallSpeed !== undefined
        ? { maxFallSpeed: options.petalMaxFallSpeed }
        : {}),
      ...(options.petalLayers !== undefined ? { layers: options.petalLayers } : {}),
    });
    this.ripples = new RippleEmitter({
      capacity: options.rippleCapacity ?? DEFAULT_RIPPLE_CAPACITY,
      ...(options.rippleLifetimeSeconds !== undefined
        ? { lifetimeSeconds: options.rippleLifetimeSeconds }
        : {}),
    });

    this.petalsPerBloom = options.petalsPerBloom ?? DEFAULT_PETALS_PER_BLOOM;
    this.resolveTreePosition =
      typeof options.treePosition === "function"
        ? options.treePosition
        : options.treePosition
          ? () => options.treePosition as Vector3
          : () => landmarkPosition("tree");

    // 事件订阅在构造时完成：测试替身无需构造完整 GameContext 即可驱动 VFX。
    this.unsubscribers.push(
      this.bus.on("color:bloom", (payload) => {
        this.ripples.emit(payload.position, payload.radius, payload.duration);
      }),
      this.bus.on("story:completed", (payload) => {
        if (payload.nodeId !== "tree" || this.disposed) return;
        this.petals.burst(this.resolveTreePosition(), this.petalsPerBloom);
        this.treeBursts += 1;
      }),
      this.bus.on("game:reset", () => {
        this.petals.clear();
        this.ripples.clear();
        this.resets += 1;
      }),
    );
  }

  init(context: GameContext): void {
    if (this.attached.value) return;
    context.worldRoot.add(this.petals.mesh, this.ripples.mesh);
    this.attached.value = true;
    context.debug.registerStatSource({
      id: "vfx",
      read: (): Readonly<Record<string, DebugValue>> => {
        const stats = this.stats;
        return {
          "vfx.petals.active": stats.petals.active,
          "vfx.petals.peak": stats.petals.peak,
          "vfx.petals.near": stats.petalLayerCounts.near,
          "vfx.petals.mid": stats.petalLayerCounts.mid,
          "vfx.petals.far": stats.petalLayerCounts.far,
          "vfx.petals.overlayRatio": Number(stats.overlayAreaRatio.toFixed(3)),
          "vfx.ripples.active": stats.ripples.active,
          "vfx.treeBursts": stats.treeBursts,
          "vfx.resets": stats.resets,
        };
      },
    });
  }

  update(deltaSeconds: number, _context: GameContext): void {
    this.petals.update(deltaSeconds);
    this.ripples.update(deltaSeconds);
  }

  get stats(): VfxStats {
    return {
      petals: this.petals.counts,
      ripples: this.ripples.counts,
      petalLayerCounts: this.petals.layerCounts,
      overlayAreaRatio: this.petals.overlayAreaRatio(),
      treeBursts: this.treeBursts,
      resets: this.resets,
    };
  }

  /** 暴露给测试/集成的场景对象（只读引用）。 */
  get objects(): Readonly<{ petals: PetalEmitter["mesh"]; ripples: RippleEmitter["mesh"] }> {
    return { petals: this.petals.mesh, ripples: this.ripples.mesh };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;
    this.petals.dispose();
    this.ripples.dispose();
  }
}
