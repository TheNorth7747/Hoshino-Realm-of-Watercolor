/**
 * 花树花瓣粒子（PRD 9.7 / 5.4 / 12.2 A5）。
 *
 * 设计要点：
 * - 固定容量 InstancedMesh：一次 draw call，数量上限即 capacity。
 * - 每个花瓣有 age/lifetime，到期或落地即回收，非活跃实例缩放为 0（隐藏）。
 * - 位置/重力/飘摆全部由参数或注入的随机源决定，测试可用确定性随机。
 * - dispose 释放 geometry/material/instanceMatrix 并从父节点摘除。
 */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  InstancedMesh,
} from "three";
import type { Group } from "three";
import { SlotPool } from "./SlotPool";

/** 返回 [0,1) 的随机源；测试注入固定值即可复现。 */
export interface RandomSource {
  next(): number;
}

export const defaultRandom: RandomSource = { next: () => Math.random() };

export interface PetalEmitterOptions {
  readonly capacity: number;
  readonly lifetimeSeconds?: number;
  readonly gravity?: number;
  readonly random?: RandomSource;
  readonly parent?: Group;
}

export interface ParticleCounts {
  readonly active: number;
  readonly capacity: number;
  readonly peak: number;
  readonly spawned: number;
  readonly reclaimed: number;
}

interface PetalState {
  readonly position: Vector3;
  readonly velocity: Vector3;
  age: number;
  lifetime: number;
  spin: number;
  phase: number;
}

const GROUND_CUTOFF_Y = -2;

export class PetalEmitter {
  readonly capacity: number;
  readonly mesh: InstancedMesh;

  private readonly pool: SlotPool;
  private readonly states: PetalState[];
  private readonly random: RandomSource;
  private readonly gravity: number;
  private readonly defaultLifetime: number;
  private readonly dummy = new Object3D();
  private readonly matrix = new Object3D();

  private peak = 0;
  private spawned = 0;
  private reclaimed = 0;
  private disposed = false;

  constructor(options: PetalEmitterOptions) {
    this.capacity = options.capacity;
    this.pool = new SlotPool(options.capacity);
    this.random = options.random ?? defaultRandom;
    this.gravity = options.gravity ?? 3.2;
    this.defaultLifetime = options.lifetimeSeconds ?? 4;

    const geometry = new PlaneGeometry(0.34, 0.22);
    const material = new MeshBasicMaterial({
      color: new Color(0xf4b8d2),
      side: DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(geometry, material, options.capacity);
    this.mesh.name = "vfx-petals";
    this.mesh.frustumCulled = false;
    this.mesh.count = options.capacity;

    this.states = Array.from({ length: options.capacity }, () => ({
      position: new Vector3(),
      velocity: new Vector3(),
      age: 0,
      lifetime: 0,
      spin: 0,
      phase: 0,
    }));

    // 初始隐藏全部实例。
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < options.capacity; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (options.parent) options.parent.add(this.mesh);
  }

  /** 在 origin 附近爆发一批花瓣；返回实际生成数量（池满会丢弃）。 */
  burst(origin: Vector3, count: number): number {
    if (this.disposed || count <= 0) return 0;
    let created = 0;
    for (let n = 0; n < count; n += 1) {
      const slot = this.pool.acquire();
      if (slot === null) break;
      const state = this.states[slot];
      if (!state) break;

      const r1 = this.random.next();
      const r2 = this.random.next();
      const r3 = this.random.next();
      const r4 = this.random.next();

      state.position.set(
        origin.x + (r1 - 0.5) * 3.2,
        origin.y + 2 + r2 * 4,
        origin.z + (r3 - 0.5) * 3.2,
      );
      state.velocity.set((r1 - 0.5) * 1.8, 0.3 + r2 * 0.6, (r3 - 0.5) * 1.8);
      state.age = 0;
      state.lifetime = this.defaultLifetime * (0.75 + r4 * 0.5);
      state.spin = (r2 - 0.5) * 3;
      state.phase = r3 * Math.PI * 2;
      created += 1;
    }
    this.spawned += created;
    this.trackPeak();
    return created;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || deltaSeconds <= 0) return;
    let needsUpload = false;

    this.pool.forEachActive((slot) => {
      const state = this.states[slot];
      if (!state) return;
      state.age += deltaSeconds;

      if (state.age >= state.lifetime || state.position.y < GROUND_CUTOFF_Y) {
        this.pool.release(slot);
        this.reclaimed += 1;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(slot, this.dummy.matrix);
        needsUpload = true;
        return;
      }

      state.velocity.y -= this.gravity * deltaSeconds;
      state.position.addScaledVector(state.velocity, deltaSeconds);
      // 水平飘摆：随年龄与相位轻微左右晃动。
      state.position.x += Math.sin(state.age * 2.2 + state.phase) * 0.35 * deltaSeconds;

      const fade = 1 - state.age / state.lifetime;
      this.matrix.position.copy(state.position);
      this.matrix.rotation.set(state.age * state.spin, state.phase + state.age, state.age * 0.6);
      this.matrix.scale.setScalar(Math.max(0.001, fade));
      this.matrix.updateMatrix();
      this.mesh.setMatrixAt(slot, this.matrix.matrix);
      needsUpload = true;
    });

    if (needsUpload) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.pool.clear();
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < this.capacity; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get counts(): ParticleCounts {
    return {
      active: this.pool.activeCount,
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

  private trackPeak(): void {
    if (this.pool.activeCount > this.peak) this.peak = this.pool.activeCount;
  }
}
