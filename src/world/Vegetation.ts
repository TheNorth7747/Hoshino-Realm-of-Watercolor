/**
 * 植被：风动水彩弧形草海 + 红/蓝/紫红/黄四色野花带（V0.3）。
 *
 * - 草：16,000 簇，4×4 分块视锥剔除 + LOD（近景 3 片弧形草叶、远景单叶）；
 *   保留 `uv.y ∈ [0,1]` 驱动顶点微风摇曳、草根融地及樱树坡暖金草色渐变。
 * - 花：蓝风铃（520）+ 红罂粟（580，聚于樱树坡）+ 紫红花（240）+ 黄花（260）= 1,600 朵；
 *   改用交叉水彩花瓣片，替代低模小球。
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  Vector3,
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

export const GRASS_INSTANCE_COUNT = 16000;
export const FLOWER_INSTANCE_COUNT = 1600;
export const GRASS_CHUNK_GRID = 4;
export const GRASS_LOD_DISTANCE = 30;
const PATH_CLEARANCE = 0.85;
const VEGETATION_SEED = 20261118;
const FLOWER_CLUSTER_RADIUS = 8;
const GRASS_WATER_MARGIN = 3.1;
const GRASS_EXTENT = 44;

const FLOWER_BLUE_COUNT = 520;
const FLOWER_RED_COUNT = 580;
const FLOWER_MAGENTA_COUNT = 240;
const FLOWER_YELLOW_COUNT = 260;

export interface GrassLodChunk {
  readonly near: InstancedMesh;
  readonly far: InstancedMesh;
  readonly center: Vector3;
}

export interface VegetationBuild extends WorldMeshBuild {
  readonly grassLod: readonly GrassLodChunk[];
  readonly grassPlaced: number;
  readonly flowerPlaced: number;
}

export function isInStreamWaterZone(x: number, z: number): boolean {
  if (Math.abs(z - STREAM.centerZ) <= GRASS_WATER_MARGIN) return true;
  for (const stone of steppingStonePositions()) {
    if (Math.hypot(x - stone.x, z - stone.z) < 2) return true;
  }
  return false;
}

/** 构造单叶弧形弯曲草片（3 段 6 三角面或 2 段 4 三角面，uv.y 从根 0 到梢 1）。 */
function makeArchedBlade(lean: number, width: number, height: number): BufferGeometry {
  const positions = [
    -width,
    0,
    0,
    width,
    0,
    0,
    -width * 0.58,
    height * 0.52,
    lean * 0.32,
    width * 0.58,
    height * 0.52,
    lean * 0.32,
    0,
    height,
    lean,
  ];
  const uvs = [0, 0, 1, 0, 0.15, 0.52, 0.85, 0.52, 0.5, 1];
  const indices = [0, 1, 2, 1, 3, 2, 2, 3, 4];
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 近景三叶弧形草簇（9 三角面）。 */
function makeTuftGeometry(): BufferGeometry {
  const blades: BufferGeometry[] = [];
  for (let i = 0; i < 3; i += 1) {
    const blade = makeArchedBlade(0.11, 0.045, 0.44);
    const angle = (i / 3) * Math.PI * 2 + 0.3;
    blade.rotateY(angle);
    blade.translate(Math.cos(angle) * 0.04, 0, Math.sin(angle) * 0.04);
    blades.push(blade);
  }
  const merged = mergeGeometries(blades);
  for (const b of blades) b.dispose();
  if (!merged) throw new Error("草簇几何合并失败");
  return merged;
}

/** 远景单叶草（3 三角面）。 */
function makeBladeGeometry(): BufferGeometry {
  return makeArchedBlade(0.08, 0.055, 0.44);
}

/** 交叉双面片花头（4 三角面），替代多面体小球。 */
function makeFlowerHeadGeometry(): BufferGeometry {
  const a = new PlaneGeometry(0.18, 0.14);
  a.rotateX(-0.35);
  const b = new PlaneGeometry(0.18, 0.14);
  b.rotateY(Math.PI * 0.5);
  b.rotateX(-0.35);
  const merged = mergeGeometries([a, b]);
  a.dispose();
  b.dispose();
  if (!merged) throw new Error("花头几何合并失败");
  return merged;
}

/** 细花茎（uv.y 0→1，随风轻摆）。 */
function makeStemGeometry(): BufferGeometry {
  const geo = makeArchedBlade(0.04, 0.015, 0.28);
  return geo;
}

function chunkWeight(cx: number, cz: number): number {
  let w = 0.45 + 0.95 * Math.exp(-(cx * cx) / (2 * 13 * 13));
  for (const id of ["spawn", "flower", "stream", "tree"] as const) {
    const landmark = LANDMARKS[id];
    const dx = cx - landmark.x;
    const dz = cz - landmark.z;
    w += 1.55 * Math.exp(-(dx * dx + dz * dz) / (2 * 14 * 14));
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

type FlowerKind = "flower" | "flowerRed" | "flowerMagenta" | "flowerYellow";

export function buildVegetationGroup(materials: MaterialAccessor): VegetationBuild {
  const group = new Group();
  group.name = "world-vegetation-group";
  const random = mulberry32(VEGETATION_SEED);
  const dummy = new Object3D();
  let triangleCount = 0;

  // ---- 分块草 ----
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
        const scale = uniformRange(random, 0.72, 1.52);
        dummy.position.set(x, sampleTerrainHeight(x, z) - 0.02, z);
        dummy.scale.set(1, scale, 1);
        dummy.rotation.set(
          uniformRange(random, -0.1, 0.1),
          uniformRange(random, 0, Math.PI * 2),
          uniformRange(random, -0.1, 0.1),
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
      triangleCount += geometryTriangleCount(tuftGeometry) * placed;
      group.add(near, far);
      grassLod.push({ near, far, center: new Vector3(cx, 0, cz) });
    }
  }

  // ---- 四色野花带 ----
  const stemGeometry = makeStemGeometry();
  const bloomGeometry = makeFlowerHeadGeometry();

  const spots: Record<FlowerKind, FlowerSpot[]> = {
    flower: [],
    flowerRed: [],
    flowerMagenta: [],
    flowerYellow: [],
  };

  const tryPlace = (kind: FlowerKind, x: number, z: number): void => {
    if (isInStreamWaterZone(x, z)) return;
    if (distanceToPath(x, z) < 0.75) return;
    spots[kind].push({
      x,
      z,
      scale: uniformRange(random, 0.85, 1.45),
      yaw: uniformRange(random, 0, Math.PI * 2),
      tiltX: uniformRange(random, -0.25, 0.25),
      tiltZ: uniformRange(random, -0.25, 0.25),
    });
  };

  // 蓝风铃：出生路侧 + 蓝花坡聚集 + 樱树坡散落
  let guard = 0;
  while (spots.flower.length < FLOWER_BLUE_COUNT && guard < FLOWER_BLUE_COUNT * 16) {
    guard += 1;
    const roll = random();
    if (roll < 0.55) {
      tryPlace(
        "flower",
        LANDMARKS.flower.x + gaussianApprox(random, FLOWER_CLUSTER_RADIUS),
        LANDMARKS.flower.z + gaussianApprox(random, FLOWER_CLUSTER_RADIUS),
      );
    } else if (roll < 0.82) {
      const side = random() < 0.5 ? -3.4 : 3.4;
      tryPlace(
        "flower",
        LANDMARKS.spawn.x + side + gaussianApprox(random, 3.2),
        LANDMARKS.spawn.z - 4 + gaussianApprox(random, 5),
      );
    } else {
      tryPlace(
        "flower",
        LANDMARKS.tree.x + 4 + gaussianApprox(random, 6),
        LANDMARKS.tree.z + 8 + gaussianApprox(random, 5),
      );
    }
  }

  // 红罂粟：花树暖金坡面大片红花海 + 溪北侧坡
  guard = 0;
  while (spots.flowerRed.length < FLOWER_RED_COUNT && guard < FLOWER_RED_COUNT * 16) {
    guard += 1;
    const roll = random();
    if (roll < 0.68) {
      tryPlace(
        "flowerRed",
        LANDMARKS.tree.x + gaussianApprox(random, 8.5),
        LANDMARKS.tree.z + 6 + gaussianApprox(random, 7.5),
      );
    } else {
      tryPlace(
        "flowerRed",
        LANDMARKS.stream.x - 5 + gaussianApprox(random, 5.5),
        LANDMARKS.stream.z - 6 + gaussianApprox(random, 4),
      );
    }
  }

  // 紫红野花：过溪流后的路径弯道花丛（还原视频 00:05～00:06）
  guard = 0;
  while (spots.flowerMagenta.length < FLOWER_MAGENTA_COUNT && guard < FLOWER_MAGENTA_COUNT * 16) {
    guard += 1;
    tryPlace(
      "flowerMagenta",
      LANDMARKS.stream.x - 3.5 + gaussianApprox(random, 4.5),
      LANDMARKS.stream.z - 5 + gaussianApprox(random, 3.5),
    );
  }

  // 黄花：溪畔与出生点花丛
  guard = 0;
  while (spots.flowerYellow.length < FLOWER_YELLOW_COUNT && guard < FLOWER_YELLOW_COUNT * 16) {
    guard += 1;
    if (random() < 0.55) {
      const bank = random() < 0.5 ? -4.2 : 4.2;
      tryPlace(
        "flowerYellow",
        uniformRange(random, -20, 20),
        STREAM.centerZ + bank + gaussianApprox(random, 1.5),
      );
    } else {
      tryPlace(
        "flowerYellow",
        LANDMARKS.spawn.x - 4.5 + gaussianApprox(random, 4.5),
        LANDMARKS.spawn.z - 3 + gaussianApprox(random, 4.5),
      );
    }
  }

  const totalFlowers =
    spots.flower.length +
    spots.flowerRed.length +
    spots.flowerMagenta.length +
    spots.flowerYellow.length;
  const stems = new InstancedMesh(stemGeometry, materials("grass"), totalFlowers);
  stems.name = "flower-stems";
  tagWorldMaterialKind(stems, "grass");

  let stemIndex = 0;
  for (const kind of ["flower", "flowerRed", "flowerMagenta", "flowerYellow"] as const) {
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

      dummy.position.set(spot.x, y + 0.27 * spot.scale, spot.z);
      dummy.rotation.set(spot.tiltX, spot.yaw, spot.tiltZ);
      dummy.updateMatrix();
      blooms.setMatrixAt(i, dummy.matrix);
      stemIndex += 1;
    }
    blooms.instanceMatrix.needsUpdate = true;
    blooms.computeBoundingSphere();
    triangleCount += geometryTriangleCount(bloomGeometry) * list.length;
    group.add(blooms);
  }
  stems.count = stemIndex;
  stems.instanceMatrix.needsUpdate = true;
  stems.computeBoundingSphere();
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
