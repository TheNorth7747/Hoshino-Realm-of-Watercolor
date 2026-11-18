/**
 * 植被：高密度分块草地 + 红/黄/蓝花带（V0.2 Agent 3，参考帧 frame-01/03/07）。
 *
 * - 草：1.2万～2万簇，按 4×4 区域分块实例化（每块一个 InstancedMesh，支持视锥剔除），
 *   每块近/远两套几何（近=三叶簇、远=单叶）做 LOD；密度向路线走廊与地标聚集，
 *   不均匀撒满全图；避开溪流水面与小径路面。
 * - 花：蓝（花坡聚拢）+ 红 + 黄花带，共 700～1200 朵；花茎共享一个 InstancedMesh，
 *   花头按色各一个 InstancedMesh（共享几何，禁止每株单独 Mesh/Material）。
 * - 散布全部确定性种子（mulberry32），同参数同场景；高度一律 terrainHeight 采样。
 * - 不透明低面数几何（非 alpha billboard），控制透明 overdraw。
 */
import {
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LANDMARKS, STREAM } from "../config/world";
import { sampleTerrainHeight, steppingStonePositions } from "./terrainHeight";
import { distanceToPath } from "./Path";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import { gaussianApprox, mulberry32, uniformRange } from "./scatter";

/** 草簇目标总数（V0.2 要求 1.2万～2万）。 */
export const GRASS_INSTANCE_COUNT = 15000;
/** 花头目标总数（V0.2 要求 700～1200）。 */
export const FLOWER_INSTANCE_COUNT = 1100;
/** 草分块网格 4×4 = 16 块（视锥剔除 + LOD 单位）。 */
export const GRASS_CHUNK_GRID = 4;
/** 草 LOD 切换距离（米）：相机到块中心小于此值用近景三叶簇。 */
export const GRASS_LOD_DISTANCE = 30;
/** 小径路面避让半宽（草/花不长在路面上）。 */
const PATH_CLEARANCE = 0.9;
const VEGETATION_SEED = 20261118;
const FLOWER_CLUSTER_RADIUS = 8;
const GRASS_WATER_MARGIN = 3.2;
const GRASS_EXTENT = 44;

const FLOWER_BLUE_COUNT = 500;
const FLOWER_RED_COUNT = 320;
const FLOWER_YELLOW_COUNT = 280;

export interface GrassLodChunk {
  readonly near: InstancedMesh;
  readonly far: InstancedMesh;
  readonly center: Vector3;
}

export interface VegetationBuild extends WorldMeshBuild {
  readonly grassLod: readonly GrassLodChunk[];
  /** 实际放置的草簇数（拒绝采样后可能略低于目标）。 */
  readonly grassPlaced: number;
  /** 实际放置的花头数。 */
  readonly flowerPlaced: number;
}

/** 判断一点是否落在溪流水面/河槽带内（草与花都避开）。 */
export function isInStreamWaterZone(x: number, z: number): boolean {
  if (Math.abs(z - STREAM.centerZ) <= GRASS_WATER_MARGIN) return true;
  for (const stone of steppingStonePositions()) {
    if (Math.hypot(x - stone.x, z - stone.z) < 2) return true;
  }
  return false;
}

/** 三叶草簇几何（近景 LOD）：3 片开口圆锥合并，9 三角面。 */
function makeTuftGeometry(): BufferGeometry {
  const blades: BufferGeometry[] = [];
  for (let i = 0; i < 3; i += 1) {
    const blade = new ConeGeometry(0.05, 0.42, 3, 1, true);
    const angle = (i / 3) * Math.PI * 2;
    blade.rotateZ(0.16);
    blade.rotateY(angle);
    blade.translate(Math.cos(angle) * 0.05, 0.2, Math.sin(angle) * 0.05);
    blades.push(blade);
  }
  const merged = mergeGeometries(blades);
  for (const blade of blades) blade.dispose();
  if (!merged) throw new Error("草簇几何合并失败");
  return merged;
}

/** 单叶几何（远景 LOD）：3 三角面。 */
function makeBladeGeometry(): BufferGeometry {
  const blade = new ConeGeometry(0.05, 0.42, 3, 1, true);
  blade.translate(0, 0.2, 0);
  return blade;
}

/** 块密度权重：向路线走廊（x≈0）与地标聚集。 */
function chunkWeight(cx: number, cz: number): number {
  let w = 0.45 + 0.9 * Math.exp(-(cx * cx) / (2 * 12 * 12));
  for (const id of ["spawn", "flower", "stream", "tree"] as const) {
    const landmark = LANDMARKS[id];
    const dx = cx - landmark.x;
    const dz = cz - landmark.z;
    w += 1.5 * Math.exp(-(dx * dx + dz * dz) / (2 * 14 * 14));
  }
  return w;
}

interface FlowerSpot {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly yaw: number;
  readonly tiltX: number;
  readonly tiltZ: number;
}

type FlowerKind = "flower" | "flowerRed" | "flowerYellow";

/** 草地 + 红黄蓝花带。 */
export function buildVegetationGroup(materials: MaterialAccessor): VegetationBuild {
  const group = new Group();
  group.name = "world-vegetation-group";
  const random = mulberry32(VEGETATION_SEED);
  const dummy = new Object3D();
  let triangleCount = 0;

  // ---- 分块草（近/远 LOD 双 InstancedMesh，共享同一 grass 材质） ----
  const tuftGeometry = makeTuftGeometry();
  const bladeGeometry = makeBladeGeometry();
  const grassLod: GrassLodChunk[] = [];
  const chunkSize = (GRASS_EXTENT * 2) / GRASS_CHUNK_GRID;

  const weights: number[] = [];
  let weightSum = 0;
  for (let gz = 0; gz < GRASS_CHUNK_GRID; gz += 1) {
    for (let gx = 0; gx < GRASS_CHUNK_GRID; gx += 1) {
      const cx = -GRASS_EXTENT + (gx + 0.5) * chunkSize;
      const cz = -GRASS_EXTENT + (gz + 0.5) * chunkSize;
      const w = chunkWeight(cx, cz);
      weights.push(w);
      weightSum += w;
    }
  }

  let grassPlaced = 0;
  let chunkIndex = 0;
  for (let gz = 0; gz < GRASS_CHUNK_GRID; gz += 1) {
    for (let gx = 0; gx < GRASS_CHUNK_GRID; gx += 1) {
      const weight = weights[chunkIndex] ?? 1;
      chunkIndex += 1;
      const target = Math.round((GRASS_INSTANCE_COUNT * weight) / weightSum);
      const minX = -GRASS_EXTENT + gx * chunkSize;
      const minZ = -GRASS_EXTENT + gz * chunkSize;
      const cx = minX + chunkSize / 2;
      const cz = minZ + chunkSize / 2;

      const near = new InstancedMesh(tuftGeometry, materials("grass"), target);
      const far = new InstancedMesh(bladeGeometry, materials("grass"), target);
      near.name = `grass-chunk-${gx}-${gz}-near`;
      far.name = `grass-chunk-${gx}-${gz}-far`;
      tagWorldMaterialKind(near, "grass");
      tagWorldMaterialKind(far, "grass");
      far.visible = false;

      let placed = 0;
      let guard = 0;
      while (placed < target && guard < target * 14) {
        guard += 1;
        const x = uniformRange(random, minX, minX + chunkSize);
        const z = uniformRange(random, minZ, minZ + chunkSize);
        if (isInStreamWaterZone(x, z)) continue;
        if (distanceToPath(x, z) < PATH_CLEARANCE) continue;
        const scale = uniformRange(random, 0.7, 1.5);
        dummy.position.set(x, sampleTerrainHeight(x, z) - 0.02, z);
        dummy.scale.set(1, scale, 1);
        dummy.rotation.set(
          uniformRange(random, -0.12, 0.12),
          uniformRange(random, 0, Math.PI * 2),
          uniformRange(random, -0.12, 0.12),
        );
        dummy.updateMatrix();
        near.setMatrixAt(placed, dummy.matrix);
        far.setMatrixAt(placed, dummy.matrix);
        placed += 1;
      }
      near.count = placed;
      far.count = placed;
      near.instanceMatrix.needsUpdate = true;
      far.instanceMatrix.needsUpdate = true;
      near.computeBoundingSphere();
      far.computeBoundingSphere();
      grassPlaced += placed;
      // 预算按近景几何计（LOD 远景只会更少）。
      triangleCount += geometryTriangleCount(tuftGeometry) * placed;
      group.add(near, far);
      grassLod.push({ near, far, center: new Vector3(cx, 0, cz) });
    }
  }

  // ---- 红/黄/蓝花带：花茎共享一个 InstancedMesh，花头按色各一个 ----
  const stemGeometry = new ConeGeometry(0.025, 0.26, 3, 1, true);
  stemGeometry.translate(0, 0.13, 0);
  const bloomGeometry = new IcosahedronGeometry(0.07, 0);

  const spots: Record<FlowerKind, FlowerSpot[]> = {
    flower: [],
    flowerRed: [],
    flowerYellow: [],
  };

  const tryPlace = (kind: FlowerKind, x: number, z: number): void => {
    if (isInStreamWaterZone(x, z)) return;
    if (distanceToPath(x, z) < 0.7) return;
    spots[kind].push({
      x,
      z,
      scale: uniformRange(random, 0.8, 1.4),
      yaw: uniformRange(random, 0, Math.PI * 2),
      tiltX: uniformRange(random, -0.35, 0.35),
      tiltZ: uniformRange(random, -0.35, 0.35),
    });
  };

  // 蓝花：花坡高斯聚拢。
  let guard = 0;
  while (spots.flower.length < FLOWER_BLUE_COUNT && guard < FLOWER_BLUE_COUNT * 14) {
    guard += 1;
    tryPlace(
      "flower",
      LANDMARKS.flower.x + gaussianApprox(random, FLOWER_CLUSTER_RADIUS),
      LANDMARKS.flower.z + gaussianApprox(random, FLOWER_CLUSTER_RADIUS),
    );
  }
  // 红花：花树周围 + 出生点右侧花带。
  guard = 0;
  while (spots.flowerRed.length < FLOWER_RED_COUNT && guard < FLOWER_RED_COUNT * 14) {
    guard += 1;
    const nearTree = random() < 0.62;
    const anchor = nearTree ? LANDMARKS.tree : LANDMARKS.spawn;
    const dx = nearTree ? 0 : 5;
    const dz = nearTree ? 0 : -3;
    tryPlace(
      "flowerRed",
      anchor.x + dx + gaussianApprox(random, 6),
      anchor.z + dz + gaussianApprox(random, 6),
    );
  }
  // 黄花：溪流两岸 + 出生点左侧花带。
  guard = 0;
  while (spots.flowerYellow.length < FLOWER_YELLOW_COUNT && guard < FLOWER_YELLOW_COUNT * 14) {
    guard += 1;
    if (random() < 0.57) {
      const bank = random() < 0.5 ? -4 : 4;
      tryPlace(
        "flowerYellow",
        uniformRange(random, -22, 22),
        STREAM.centerZ + bank + gaussianApprox(random, 1.4),
      );
    } else {
      tryPlace(
        "flowerYellow",
        LANDMARKS.spawn.x - 5 + gaussianApprox(random, 5),
        LANDMARKS.spawn.z - 2 + gaussianApprox(random, 5),
      );
    }
  }

  const totalFlowers = spots.flower.length + spots.flowerRed.length + spots.flowerYellow.length;
  const stems = new InstancedMesh(stemGeometry, materials("grass"), totalFlowers);
  stems.name = "flower-stems";
  tagWorldMaterialKind(stems, "grass");

  let stemIndex = 0;
  for (const kind of ["flower", "flowerRed", "flowerYellow"] as const) {
    const list = spots[kind];
    const blooms = new InstancedMesh(bloomGeometry, materials(kind), list.length);
    blooms.name = `flower-blooms-${kind}`;
    tagWorldMaterialKind(blooms, kind);
    for (let i = 0; i < list.length; i += 1) {
      const spot = list[i];
      if (!spot) continue;
      const y = sampleTerrainHeight(spot.x, spot.z);
      dummy.position.set(spot.x, y, spot.z);
      dummy.scale.set(spot.scale, spot.scale, spot.scale);
      dummy.rotation.set(0, spot.yaw, 0);
      dummy.updateMatrix();
      stems.setMatrixAt(stemIndex, dummy.matrix);
      dummy.position.set(spot.x, y + 0.24 * spot.scale, spot.z);
      dummy.rotation.set(spot.tiltX, spot.yaw, spot.tiltZ);
      dummy.updateMatrix();
      blooms.setMatrixAt(i, dummy.matrix);
      stemIndex += 1;
    }
    blooms.instanceMatrix.needsUpdate = true;
    triangleCount += geometryTriangleCount(bloomGeometry) * list.length;
    group.add(blooms);
  }
  stems.count = stemIndex;
  stems.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(stemGeometry) * stemIndex;
  group.add(stems);

  return {
    group,
    triangleCount,
    grassLod,
    grassPlaced,
    flowerPlaced: stemIndex,
  };
}
