/**
 * A1 验证台（PRD 12.2 A1「使测试地面和至少两种不同物体读取同一遮罩」）。
 *
 * 注意：这不是 A3 的正式场景，也不是 A2 的玩家控制。
 * - 只在显式开启（`enableBench` 或 `?debug=1`）时挂载；
 * - 地面 + 三个不同几何体全部使用 `createWatercolorMaterial` 的**同一份 uniforms**；
 * - 内置一个 L 形路线的行走器，用来在 A2 尚未集成时验证“世界坐标染色”而不是屏幕滤镜。
 * A3 接入后应整体删除本文件的使用（RevealSystem 的 bench 选项关闭即可）。
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import type { Object3D } from "three";
import type { PlayerSnapshot, PlayerSource } from "../core/contracts";
import { disposeObject3D } from "../core/dispose";
import { createWatercolorMaterial, type RevealUniforms } from "./WatercolorMaterial";

interface Waypoint {
  readonly x: number;
  readonly z: number;
}

/** AC-03 的验收路线：先沿 -X 走 8m，再沿 -Z 走 12m，形成世界坐标里的 L。 */
export const BENCH_PATH: readonly Waypoint[] = [
  { x: 0, z: 32 },
  { x: -8, z: 32 },
  { x: -8, z: 20 },
];

const WALK_SPEED = 5;

class BenchWalker implements PlayerSource {
  private readonly position = new Vector3();
  private distance = 0;
  private heading = 0;
  private finished = false;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.distance = 0;
    this.heading = 0;
    this.finished = false;
    const start = BENCH_PATH[0];
    if (start) this.position.set(start.x, 0, start.z);
  }

  update(deltaSeconds: number): void {
    if (this.finished) return;
    this.distance += WALK_SPEED * Math.max(0, deltaSeconds);
    this.evaluate();
  }

  getPlayerSnapshot(): PlayerSnapshot {
    return {
      position: this.position,
      headingRadians: this.heading,
      speed: this.finished ? 0 : WALK_SPEED,
      grounded: true,
    };
  }

  private evaluate(): void {
    let remaining = this.distance;
    for (let index = 0; index < BENCH_PATH.length - 1; index += 1) {
      const from = BENCH_PATH[index];
      const to = BENCH_PATH[index + 1];
      if (!from || !to) continue;
      const segment = Math.hypot(to.x - from.x, to.z - from.z);
      if (remaining <= segment) {
        const t = segment === 0 ? 0 : remaining / segment;
        this.position.set(from.x + (to.x - from.x) * t, 0, from.z + (to.z - from.z) * t);
        this.heading = Math.atan2(to.x - from.x, to.z - from.z);
        return;
      }
      remaining -= segment;
    }
    const end = BENCH_PATH[BENCH_PATH.length - 1];
    if (end) this.position.set(end.x, 0, end.z);
    this.finished = true;
  }
}

export interface RevealBenchOptions {
  readonly uniforms: RevealUniforms;
  readonly parent: Object3D;
}

export class RevealBench {
  readonly playerSource: PlayerSource;

  private readonly root = new Group();
  private readonly walker = new BenchWalker();

  constructor(options: RevealBenchOptions) {
    this.root.name = "reveal-bench";
    this.playerSource = this.walker;

    const ground = new Mesh(
      new PlaneGeometry(44, 44, 1, 1),
      createWatercolorMaterial({
        color: 0x9ec98a,
        uniforms: options.uniforms,
        name: "bench-ground",
      }),
    );
    ground.name = "bench-ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 30);

    const sphere = new Mesh(
      new SphereGeometry(1.5, 20, 14),
      createWatercolorMaterial({
        color: 0x6f8fd6,
        uniforms: options.uniforms,
        name: "bench-sphere",
      }),
    );
    sphere.name = "bench-sphere";
    sphere.position.set(5, 1.5, 30);

    const tree = new Mesh(
      new CylinderGeometry(0.7, 1.05, 4.2, 7),
      createWatercolorMaterial({
        color: 0xd98fb0,
        uniforms: options.uniforms,
        flatShading: true,
        name: "bench-tree",
      }),
    );
    tree.name = "bench-tree";
    tree.position.set(-6, 2.1, 28);

    const stone = new Mesh(
      new BoxGeometry(1.6, 1.1, 1.6),
      createWatercolorMaterial({
        color: 0x8d8f95,
        uniforms: options.uniforms,
        flatShading: true,
        name: "bench-stone",
      }),
    );
    stone.name = "bench-stone";
    stone.position.set(2.4, 0.55, 26.5);

    this.root.add(ground, sphere, tree, stone);
    options.parent.add(this.root);
  }

  update(deltaSeconds: number): void {
    this.walker.update(deltaSeconds);
  }

  reset(): void {
    this.walker.reset();
  }

  dispose(): void {
    disposeObject3D(this.root);
  }
}
