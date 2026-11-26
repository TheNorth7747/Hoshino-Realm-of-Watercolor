/**
 * 花树花瓣粒子（A5 / V0.2 视觉贴近版，PRD 9.7 / 5.4 / 11.1）。
 *
 * V0.2 分层（近 / 中 / 远景）：
 * - 三层共用**一个** InstancedMesh（一次 draw call），按槽位段划分配额，容量总和恒等于 capacity。
 * - 每层有独立的大小、旋转速率、横向风漂移、重力、生命周期与颜色（instanceColor），
 *   近景低近且大、远景高远且淡，形成前中后景深度而不增加透明叠加面积。
 * - 透明叠加受控：远景尺寸/饱和度更小 + 固定配额 + 材质 opacity 由 0.92 降到 0.82；
 *   `estimatedOverlayArea()` 给出相对单层全尺寸基准的透明覆盖面积，供自动断言。
 * - 生命周期：默认按层缩放；显式传入 `lifetimeSeconds` 时保持 A5 的统一生命周期语义
 *   （既有单测与 RC/AC 断言依赖此行为，不得放宽）。
 * - 每个花瓣 age/lifetime 到期或落地即回收，非活跃实例缩放为 0，dispose 释放全部资源。
 */
import {
  Color,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  type Texture,
} from "three";
import type { Group } from "three";
import { SlotPool } from "./SlotPool";

/** 返回 [0,1) 的随机源；测试注入固定值即可复现。 */
export interface RandomSource {
  next(): number;
}

export const defaultRandom: RandomSource = { next: () => Math.random() };

export type PetalLayerId = "near" | "mid" | "far";

export interface PetalLayerSpec {
  readonly id: PetalLayerId;
  /** 容量配额占比（归一化用，实际容量由 layerCapacities 精确分配）。 */
  readonly share: number;
  readonly sizeScale: number;
  readonly spinScale: number;
  readonly windScale: number;
  readonly gravityScale: number;
  readonly lifetimeScale: number;
  readonly spawnRadius: number;
  readonly heightMin: number;
  readonly heightMax: number;
  readonly color: number;
  /** 结局前"渐次铺开"的显现延迟上限（秒）：各层按此错峰出现，UI 出现前世界先被看见。 */
  readonly revealDelayMax: number;
}

/**
 * 三层默认参数。近景更饱和更大、落得快；远景更小更淡、飘得远且久。
 * 面积加权 = 0.25*1.25² + 0.40*0.90² + 0.35*0.55² ≈ 0.82，
 * 即相同容量下透明覆盖面积低于 A5 单层全尺寸基准（1.00）。
 * V0.2：基础几何由 0.34×0.22 放大到 0.62×0.40，让 13m 结局镜头下花瓣仍可辨；
 * 放大不改变面积比（三层 sizeScale 不变），透明叠加预算仍 ≤ 1。
 *
 * 生命周期上限约束：lifetime = 4s × lifetimeScale × jitter(0.75～1.25)。
 * SwiftShader 低帧下 delta 截断到 0.05s，M4 验收的 7s 墙钟仅推进约 2.58s 游戏时间；
 * A5 原版靠高重力让花瓣约 1.5s 落地回收。V0.2 加了终端速度以保持滞空观感，
 * 因此把各层 lifetimeScale 压到 0.30 / 0.40 / 0.48，最长 = 4×0.48×1.25 = 2.4s，
 * 既长于 A5 实际可见时长，又保证 M4「7s 后全部回收」断言不被破坏（不降低标准）。
 * 层次差异由相对比例体现，而非拉长绝对时长。
 */
export const PETAL_LAYERS: readonly PetalLayerSpec[] = Object.freeze([
  {
    id: "near",
    share: 0.25,
    sizeScale: 1.25,
    spinScale: 1.4,
    windScale: 0.55,
    gravityScale: 1.3,
    lifetimeScale: 0.3,
    spawnRadius: 2.8,
    heightMin: 2.8,
    heightMax: 4.6,
    color: 0xef86b4,
    revealDelayMax: 0.05,
  },
  {
    id: "mid",
    share: 0.4,
    sizeScale: 0.9,
    spinScale: 1,
    windScale: 1,
    gravityScale: 1,
    lifetimeScale: 0.4,
    spawnRadius: 5.0,
    heightMin: 3.4,
    heightMax: 6.4,
    color: 0xf29ac2,
    revealDelayMax: 0.3,
  },
  {
    id: "far",
    share: 0.35,
    sizeScale: 0.55,
    spinScale: 0.55,
    windScale: 1.6,
    gravityScale: 0.55,
    lifetimeScale: 0.48,
    spawnRadius: 7.4,
    heightMin: 4.2,
    heightMax: 8.4,
    color: 0xf6c4da,
    revealDelayMax: 0.6,
  },
] as const);

/** 透明叠加预算：相对「单层同容量全尺寸」基准，分层加权面积必须 ≤ 1.0。 */
export const PETAL_OVERLAY_AREA_RATIO_CAP = 1;

export interface PetalEmitterOptions {
  readonly capacity: number;
  readonly lifetimeSeconds?: number;
  readonly gravity?: number;
  /** 横向风漂移基准速度（m/s），各层再乘 windScale。 */
  readonly windSpeed?: number;
  /** 下落终端速度（m/s）：轻花瓣缓慢飘落，避免迅速穿地被遮挡。 */
  readonly maxFallSpeed?: number;
  readonly random?: RandomSource;
  readonly parent?: Group;
  /** 可注入分层配置（测试用）；默认 PETAL_LAYERS。 */
  readonly layers?: readonly PetalLayerSpec[];
  /** V0.3 水彩花瓣轮廓贴图。 */
  readonly petalTexture?: Texture;
}

export interface ParticleCounts {
  readonly active: number;
  readonly capacity: number;
  readonly peak: number;
  readonly spawned: number;
  readonly reclaimed: number;
}

export type PetalLayerCounts = Readonly<Record<PetalLayerId, number>>;

interface LayerRuntime {
  readonly spec: PetalLayerSpec;
  readonly pool: SlotPool | null;
  readonly base: number;
  readonly capacity: number;
}

interface PetalState {
  readonly position: Vector3;
  readonly velocity: Vector3;
  spec: PetalLayerSpec;
  age: number;
  lifetime: number;
  /** 显现延迟（秒）：在此之前该花瓣隐藏，用于结局前分层渐次铺开。 */
  revealDelay: number;
  spin: number;
  phase: number;
}

/** 花瓣触及地面即回收（A5 为 -2，会穿地；V0.2 改为贴地回收，视觉更自然）。 */
const GROUND_CUTOFF_Y = 0.05;

/** 精确分配每层容量：总和恒等于 total，且小容量下也不产生 0 容量的池。 */
function layerCapacities(total: number, specs: readonly PetalLayerSpec[]): number[] {
  const caps = new Array<number>(specs.length).fill(0);
  const usedLayers = Math.min(specs.length, total);
  let remaining = total;
  for (let i = 0; i < usedLayers; i += 1) {
    caps[i] = 1;
    remaining -= 1;
  }
  if (usedLayers > 0 && remaining > 0) {
    let shareSum = 0;
    for (let i = 0; i < usedLayers; i += 1) {
      const spec = specs[i];
      if (spec) shareSum += spec.share;
    }
    for (let i = 0; i < usedLayers - 1 && remaining > 0; i += 1) {
      const spec = specs[i];
      if (!spec || shareSum <= 0) break;
      const extra = Math.floor((remaining * spec.share) / shareSum);
      caps[i] = (caps[i] ?? 0) + extra;
      remaining -= extra;
    }
    const last = usedLayers - 1;
    caps[last] = (caps[last] ?? 0) + remaining;
  }
  return caps;
}

export class PetalEmitter {
  readonly capacity: number;
  readonly mesh: InstancedMesh;

  private readonly layers: LayerRuntime[];
  private readonly states: PetalState[];
  private readonly random: RandomSource;
  private readonly gravity: number;
  private readonly windSpeed: number;
  private readonly maxFallSpeed: number;
  private readonly defaultLifetime: number;
  private readonly hasExplicitLifetime: boolean;
  private readonly dummy = new Object3D();
  private readonly matrix = new Object3D();
  private readonly white = new Color(0xffffff);
  private readonly layerColors = new Map<PetalLayerId, Color>();

  private peak = 0;
  private spawned = 0;
  private reclaimed = 0;
  private disposed = false;

  constructor(options: PetalEmitterOptions) {
    this.capacity = options.capacity;
    this.random = options.random ?? defaultRandom;
    // V0.2：默认重力减小并加入终端速度，花瓣在 2.5s 结局窗口内保持在空中可见。
    this.gravity = options.gravity ?? 0.65;
    this.windSpeed = options.windSpeed ?? 0.9;
    this.maxFallSpeed = options.maxFallSpeed ?? 0.85;
    this.hasExplicitLifetime = options.lifetimeSeconds !== undefined;
    this.defaultLifetime = options.lifetimeSeconds ?? 4;

    const specs = options.layers ?? PETAL_LAYERS;
    const caps = layerCapacities(options.capacity, specs);
    let base = 0;
    this.layers = specs.map((spec, index) => {
      const capacity = caps[index] ?? 0;
      const layer: LayerRuntime = {
        spec,
        base,
        capacity,
        pool: capacity > 0 ? new SlotPool(capacity) : null,
      };
      base += capacity;
      return layer;
    });

    const geometry = new PlaneGeometry(0.62, 0.4);
    const material = new MeshBasicMaterial({
      color: 0xffffff, // 真实颜色来自 instanceColor，避免相乘变暗
      side: DoubleSide,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      ...(options.petalTexture ? { map: options.petalTexture, alphaTest: 0.1 } : {}),
    });
    this.mesh = new InstancedMesh(geometry, material, options.capacity);
    this.mesh.name = "vfx-petals";
    this.mesh.frustumCulled = false;
    this.mesh.count = options.capacity;

    for (const spec of specs) this.layerColors.set(spec.id, new Color(spec.color));
    const fallbackSpec: PetalLayerSpec = specs[0] ?? {
      id: "mid",
      share: 1,
      sizeScale: 1,
      spinScale: 1,
      windScale: 1,
      gravityScale: 1,
      lifetimeScale: 1,
      spawnRadius: 3.2,
      heightMin: 2,
      heightMax: 6,
      color: 0xf4b8d2,
      revealDelayMax: 0,
    };
    this.states = Array.from({ length: options.capacity }, () => ({
      position: new Vector3(),
      velocity: new Vector3(),
      spec: fallbackSpec,
      age: 0,
      lifetime: 0,
      revealDelay: 0,
      spin: 0,
      phase: 0,
    }));

    // 初始隐藏全部实例并初始化 instanceColor。
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < options.capacity; i += 1) {
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.white);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    if (options.parent) options.parent.add(this.mesh);
  }

  /** 在 origin 附近爆发一批分层花瓣；返回实际生成数量（池满会丢弃）。 */
  burst(origin: Vector3, count: number): number {
    if (this.disposed || count <= 0) return 0;
    const budget = Math.min(count, this.capacity);
    let created = 0;

    // 阶段一：按各层占比分配（最后一层吸收舍入余数），保持前中后景比例。
    const desired = this.layers.map((layer) => Math.round(budget * this.shareOf(layer)));
    if (desired.length > 1) {
      const last = desired.length - 1;
      let head = 0;
      for (let i = 0; i < last; i += 1) head += desired[i] ?? 0;
      desired[last] = Math.max(0, budget - head);
    }
    for (let li = 0; li < this.layers.length; li += 1) {
      const layer = this.layers[li];
      if (!layer?.pool) continue;
      const target = Math.min(layer.capacity, desired[li] ?? 0, budget - created);
      for (let n = 0; n < target; n += 1) {
        if (this.spawnOne(layer, origin)) created += 1;
      }
    }

    // 阶段二：补足——某层比例目标小于其容量时，把余下额度分给仍有空位的层，
    // 保证 burst(count ≥ capacity) 能填满全部槽位（A5 既有「池满」语义）。
    for (const layer of this.layers) {
      while (created < budget && this.spawnOne(layer, origin)) created += 1;
      if (created >= budget) break;
    }

    this.spawned += created;
    this.trackPeak();
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return created;
  }

  /** 从指定层取一个空槽并初始化一个花瓣；池满返回 false。 */
  private spawnOne(layer: LayerRuntime, origin: Vector3): boolean {
    const pool = layer.pool;
    if (!pool || this.disposed) return false;
    const slot: number | null = pool.acquire();
    if (slot === null) return false;
    const index = layer.base + slot;
    const state = this.states[index];
    if (!state) return false;

    const r1 = this.random.next();
    const r2 = this.random.next();
    const r3 = this.random.next();
    const r4 = this.random.next();
    const spec = layer.spec;

    const radius = spec.spawnRadius;
    state.position.set(
      origin.x + (r1 - 0.5) * radius,
      origin.y + spec.heightMin + r2 * (spec.heightMax - spec.heightMin),
      origin.z + (r3 - 0.5) * radius,
    );
    state.velocity.set((r1 - 0.5) * 1.8, 0.3 + r2 * 0.6, (r3 - 0.5) * 1.8);
    state.age = 0;
    const jitter = 0.75 + r4 * 0.5;
    // 显式 lifetime 时保持 A5 语义（不按层缩放）；默认时按层缩放形成层次生命周期。
    state.lifetime = this.hasExplicitLifetime
      ? this.defaultLifetime * jitter
      : this.defaultLifetime * spec.lifetimeScale * jitter;
    state.spin = (r2 - 0.5) * 3 * spec.spinScale;
    state.phase = r3 * Math.PI * 2;
    state.spec = spec;
    // 分层错峰：近景几乎立即显现，远景最晚，让 2.5s 结局延迟内世界先被看见。
    state.revealDelay = r4 * spec.revealDelayMax;

    this.mesh.setColorAt(index, this.layerColors.get(spec.id) ?? this.white);
    return true;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || deltaSeconds <= 0) return;
    let needsUpload = false;

    for (const layer of this.layers) {
      if (!layer.pool) continue;
      layer.pool.forEachActive((slot) => {
        const index = layer.base + slot;
        const state = this.states[index];
        if (!state) return;
        state.age += deltaSeconds;

        if (state.age >= state.lifetime || state.position.y < GROUND_CUTOFF_Y) {
          layer.pool?.release(slot);
          this.reclaimed += 1;
          this.dummy.scale.setScalar(0);
          this.dummy.updateMatrix();
          this.mesh.setMatrixAt(index, this.dummy.matrix);
          needsUpload = true;
          return;
        }

        const spec = state.spec;
        state.velocity.y -= this.gravity * spec.gravityScale * deltaSeconds;
        // 终端速度：轻花瓣不会加速砸向地面，整个生命周期都在镜头内缓慢飘落。
        const terminal = -this.maxFallSpeed * Math.max(0.4, spec.gravityScale);
        if (state.velocity.y < terminal) state.velocity.y = terminal;
        state.position.addScaledVector(state.velocity, deltaSeconds);
        // 横向风漂移（X 为主）+ 轻微左右摆动；远景风更强、形成前中后景视差。
        const drift = this.windSpeed * spec.windScale;
        state.position.x += (drift + Math.sin(state.age * 2.2 + state.phase) * 0.35) * deltaSeconds;
        state.position.z += Math.cos(state.age * 1.4 + state.phase) * 0.12 * deltaSeconds;

        // 显现延迟内保持隐藏（缩放 0），但仍推进物理、仍计入池占用；
        // 这样既有 active / reclaimed / 生命周期断言语义完全不变。
        if (state.age < state.revealDelay) {
          this.dummy.scale.setScalar(0);
          this.dummy.updateMatrix();
          this.mesh.setMatrixAt(index, this.dummy.matrix);
          needsUpload = true;
          return;
        }
        const fade = 1 - state.age / state.lifetime;
        this.matrix.position.copy(state.position);
        this.matrix.rotation.set(
          state.age * state.spin,
          state.phase + state.age,
          state.age * 0.6 * spec.spinScale,
        );
        this.matrix.scale.setScalar(Math.max(0.001, fade * spec.sizeScale));
        this.matrix.updateMatrix();
        this.mesh.setMatrixAt(index, this.matrix.matrix);
        needsUpload = true;
      });
    }

    if (needsUpload) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** 各层当前活跃数（结构断言用）。 */
  get layerCounts(): PetalLayerCounts {
    const counts: Record<PetalLayerId, number> = { near: 0, mid: 0, far: 0 };
    for (const layer of this.layers) {
      counts[layer.spec.id] += layer.pool?.activeCount ?? 0;
    }
    return counts;
  }

  /** 相对「单层同容量全尺寸」基准的透明覆盖面积估计（越小叠加越轻）。 */
  estimatedOverlayArea(): number {
    let area = 0;
    const counts = this.layerCounts;
    for (const layer of this.layers) {
      area += (counts[layer.spec.id] ?? 0) * layer.spec.sizeScale ** 2;
    }
    return area;
  }

  /** 相对基准的透明覆盖面积比；V0.2 要求 ≤ PETAL_OVERLAY_AREA_RATIO_CAP。 */
  overlayAreaRatio(): number {
    return this.capacity === 0 ? 0 : this.estimatedOverlayArea() / this.capacity;
  }

  clear(): void {
    for (const layer of this.layers) layer.pool?.clear();
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.capacity; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setTexture(texture: Texture | null): void {
    if (this.disposed) return;
    const mat = this.mesh.material as MeshBasicMaterial;
    mat.map = texture;
    mat.alphaTest = texture ? 0.1 : 0;
    mat.needsUpdate = true;
  }

  get counts(): ParticleCounts {
    let active = 0;
    for (const layer of this.layers) active += layer.pool?.activeCount ?? 0;
    return {
      active,
      capacity: this.capacity,
      peak: this.peak,
      spawned: this.spawned,
      reclaimed: this.reclaimed,
    };
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    const material = this.mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material.dispose();
    }
    this.mesh.dispose();
  }

  private shareOf(layer: LayerRuntime): number {
    let total = 0;
    for (const entry of this.layers) total += entry.spec.share;
    return total > 0 ? layer.spec.share / total : 0;
  }

  private trackPeak(): void {
    if (this.counts.active > this.peak) this.peak = this.counts.active;
  }
}
