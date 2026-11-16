/**
 * 植被：草地与蓝花坡（A3，PRD 9.4「草和花使用 InstancedMesh」）。
 *
 * - 草：全图散布的实例化草叶，避开溪流水面与踏石带。
 * - 蓝花：以 flower 地标为中心的高斯聚拢花丛（花茎 + 花头两个实例网格共享变换）。
 * - 散布用确定性种子，场景可复现（单元测试与验收截图稳定）。
 * - 高度一律来自 terrainHeight 采样，保证贴地。
 */
import {
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from "three";
import { LANDMARKS, STREAM } from "../config/world";
import { sampleTerrainHeight, steppingStonePositions } from "./terrainHeight";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import { gaussianApprox, mulberry32, uniformRange } from "./scatter";

/** 草叶与蓝花的数量（实例化后 draw call 恒为 1+1+1，PRD 11.1 预算内）。 */
export const GRASS_INSTANCE_COUNT = 720;
export const FLOWER_INSTANCE_COUNT = 150;
const VEGETATION_SEED = 20261118;
/** 蓝花聚拢半径（flower 地标周围）。 */
const FLOWER_CLUSTER_RADIUS = 7;
/** 水面附近不种草的半宽（含河槽岸线过渡）。 */
const GRASS_WATER_MARGIN = 3.2;

/** 判断一点是否落在溪流水面/河槽带内（草与花都避开）。 */
export function isInStreamWaterZone(x: number, z: number): boolean {
  if (Math.abs(z - STREAM.centerZ) <= GRASS_WATER_MARGIN) return true;
  for (const stone of steppingStonePositions()) {
    if (Math.hypot(x - stone.x, z - stone.z) < 2) return true;
  }
  return false;
}

/** 草地 + 蓝花坡。 */
export function buildVegetationGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-vegetation-group";
  const random = mulberry32(VEGETATION_SEED);
  let triangleCount = 0;

  // ---- 草叶：低面数圆锥，随机高度与朝向 ----
  const bladeGeometry = new ConeGeometry(0.05, 0.42, 4);
  const grass = new InstancedMesh(bladeGeometry, materials("grass"), GRASS_INSTANCE_COUNT);
  grass.name = "grass-field";
  tagWorldMaterialKind(grass, "grass");
  const dummy = new Object3D();
  let placedGrass = 0;
  let guard = 0;
  while (placedGrass < GRASS_INSTANCE_COUNT && guard < GRASS_INSTANCE_COUNT * 12) {
    guard += 1;
    const x = uniformRange(random, -42, 42);
    const z = uniformRange(random, -42, 42);
    if (isInStreamWaterZone(x, z)) continue;
    const scale = uniformRange(random, 0.7, 1.5);
    dummy.position.set(x, sampleTerrainHeight(x, z) - 0.03, z);
    dummy.scale.set(1, scale, 1);
    dummy.rotation.set(uniformRange(random, -0.12, 0.12), uniformRange(random, 0, Math.PI * 2), uniformRange(random, -0.12, 0.12));
    dummy.updateMatrix();
    grass.setMatrixAt(placedGrass, dummy.matrix);
    placedGrass += 1;
  }
  grass.count = placedGrass;
  grass.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(bladeGeometry) * placedGrass;
  group.add(grass);

  // ---- 蓝花：花茎（grass 材质，绿色系）+ 花头（flower 材质，蓝色系）共享定位 ----
  const stemGeometry = new ConeGeometry(0.025, 0.26, 4);
  const bloomGeometry = new IcosahedronGeometry(0.07, 0);
  const stems = new InstancedMesh(stemGeometry, materials("grass"), FLOWER_INSTANCE_COUNT);
  const blooms = new InstancedMesh(bloomGeometry, materials("flower"), FLOWER_INSTANCE_COUNT);
  stems.name = "flower-stems";
  blooms.name = "flower-blooms";
  tagWorldMaterialKind(stems, "grass");
  tagWorldMaterialKind(blooms, "flower");

  const flowerX = LANDMARKS.flower.x;
  const flowerZ = LANDMARKS.flower.z;
  let placedFlowers = 0;
  guard = 0;
  while (placedFlowers < FLOWER_INSTANCE_COUNT && guard < FLOWER_INSTANCE_COUNT * 12) {
    guard += 1;
    const x = flowerX + gaussianApprox(random, FLOWER_CLUSTER_RADIUS);
    const z = flowerZ + gaussianApprox(random, FLOWER_CLUSTER_RADIUS);
    if (isInStreamWaterZone(x, z)) continue;
    const scale = uniformRange(random, 0.8, 1.4);
    const y = sampleTerrainHeight(x, z);
    dummy.position.set(x, y + 0.1, z);
    dummy.scale.set(scale, scale, scale);
    dummy.rotation.set(0, uniformRange(random, 0, Math.PI * 2), 0);
    dummy.updateMatrix();
    stems.setMatrixAt(placedFlowers, dummy.matrix);
    // 花头略微偏移出茎顶，随机倾倒模拟自然生长。
    dummy.position.set(x, y + 0.24 * scale, z);
    dummy.rotation.set(uniformRange(random, -0.35, 0.35), uniformRange(random, 0, Math.PI * 2), uniformRange(random, -0.35, 0.35));
    dummy.updateMatrix();
    blooms.setMatrixAt(placedFlowers, dummy.matrix);
    placedFlowers += 1;
  }
  stems.count = placedFlowers;
  blooms.count = placedFlowers;
  stems.instanceMatrix.needsUpdate = true;
  blooms.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(stemGeometry) * placedFlowers;
  triangleCount += geometryTriangleCount(bloomGeometry) * placedFlowers;
  group.add(stems, blooms);

  return { group, triangleCount };
}
