/**
 * 故事染色涟漪（PRD 9.7 / 5.4 / 8.4）。
 *
 * 由 `color:bloom` 事件驱动：在染色中心生成一圈向外扩散的水彩色环，
 * 生命周期结束自动回收。与花瓣共用 SlotPool 思路，固定容量、可 dispose。
 */
import {
  Color,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  RingGeometry,
  Vector3,
} from "three";
import type { Group } from "three";
import { SlotPool } from "./SlotPool";
import type { ParticleCounts } from "./Petals";

export interface RippleEmitterOptions {
  readonly capacity: number;
  readonly lifetimeSeconds?: number;
  readonly random?: { next(): number };
  readonly parent?: Group;
}

interface RippleState {
  readonly position: Vector3;
  age: number;
  lifetime: number;
  targetRadius: number;
}

export class RippleEmitter {
  readonly capacity: number;
  readonly mesh: InstancedMesh;

  private readonly pool: SlotPool;
  private readonly states: RippleState[];
  private readonly defaultLifetime: number;
  private readonly dummy = new Object3D();
  private readonly matrix = new Object3D();

  private peak = 0;
  private spawned = 0;
  private reclaimed = 0;
  private disposed = false;

  constructor(options: RippleEmitterOptions) {
    this.capacity = options.capacity;
    this.pool = new SlotPool(options.capacity);
    this.defaultLifetime = options.lifetimeSeconds ?? 1.2;

    const geometry = new RingGeometry(0.86, 1, 40);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      color: new Color(0x7fb6e8),
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.mesh = new InstancedMesh(geometry, material, options.capacity);
    this.mesh.name = "vfx-ripples";
    this.mesh.frustumCulled = false;
    this.mesh.count = options.capacity;

    this.states = Array.from({ length: options.capacity }, () => ({
      position: new Vector3(),
      age: 0,
      lifetime: 0,
      targetRadius: 0,
    }));

    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let i = 0; i < options.capacity; i += 1) this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;

    if (options.parent) options.parent.add(this.mesh);
  }

  /** 在 position 生成一圈涟漪；radius 来自 bloom 事件，duration 决定生命周期。 */
  emit(position: Vector3, radius: number, duration?: number): number {
    if (this.disposed) return 0;
    const slot = this.pool.acquire();
    if (slot === null) return 0;
    const state = this.states[slot];
    if (!state) return 0;

    state.position.set(position.x, position.y + 0.06, position.z);
    state.age = 0;
    state.lifetime = duration && duration > 0 ? duration : this.defaultLifetime;
    state.targetRadius = radius > 0 ? radius : 1;

    this.spawned += 1;
    if (this.pool.activeCount > this.peak) this.peak = this.pool.activeCount;
    return 1;
  }

  update(deltaSeconds: number): void {
    if (this.disposed || deltaSeconds <= 0) return;
    let needsUpload = false;

    this.pool.forEachActive((slot) => {
      const state = this.states[slot];
      if (!state) return;
      state.age += deltaSeconds;

      if (state.age >= state.lifetime) {
        this.pool.release(slot);
        this.reclaimed += 1;
        this.dummy.scale.setScalar(0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(slot, this.dummy.matrix);
        needsUpload = true;
        return;
      }

      const progress = state.age / state.lifetime;
      const radius = 0.2 + (state.targetRadius - 0.2) * progress;
      this.matrix.position.copy(state.position);
      this.matrix.rotation.set(0, 0, 0);
      this.matrix.scale.setScalar(radius);
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
}
