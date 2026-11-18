/**
 * 普通树森林（V0.2 Agent 3，参考帧 frame-01/03/07 的白干/深干/垂枝三类）。
 *
 * - 三类：深干绿树（brown trunk + green crown）、白干树（birch）、垂枝树（willow 下垂枝）。
 * - 全部 InstancedMesh 共享几何：树干按色 2 个、绿树冠 1 个、垂枝 1 个 → 4 draw calls
 *   承载全部 32 棵，禁止每株单独 Mesh/Material。
 * - 沿主路线两侧成排分布形成前/中/后景；避让路面（distanceToPath≥3.5）、溪流带与
 *   花树净空，保留望向花树的视线。装饰性树木不设碰撞体（主路线碰撞安全零回归）。
 * - 确定性种子；高度 terrainHeight 采样贴地。
 */
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
} from "three";
import { LANDMARKS, STREAM, WORLD_BOUNDS } from "../config/world";
import { sampleTerrainHeight } from "./terrainHeight";
import { distanceToPath } from "./Path";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import { mulberry32, uniformRange } from "./scatter";

/** 普通树总数（V0.2 要求 25～40）。 */
export const ORDINARY_TREE_COUNT = 32;
export const TREE_TYPE_COUNTS = {
  darkGreen: 12,
  birch: 12,
  weeping: 8,
} as const;

const TREE_SEED = 20261120;
/** 离小径中心线的最小距离（保证不挡路、保留视线走廊）。 */
const TREE_PATH_CLEARANCE = 3.5;
/** 离溪流中心线的最小距离（树不长在水里）。 */
const TREE_STREAM_CLEARANCE = 3;
/** 花树净空半径（保留花树轮廓与视线）。 */
const TREE_FLOWER_TREE_CLEARANCE = 6;
const TREE_EXTENT = 45;

interface TreeSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly height: number;
  readonly yaw: number;
  readonly lean: number;
}

function placeTrees(random: () => number, count: number): TreeSpot[] {
  const spots: TreeSpot[] = [];
  let guard = 0;
  while (spots.length < count && guard < count * 40) {
    guard += 1;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * uniformRange(random, 4.5, 17);
    const z = uniformRange(random, -TREE_EXTENT, TREE_EXTENT);
    if (Math.abs(x) > WORLD_BOUNDS.maxX - 2 || Math.abs(z) > WORLD_BOUNDS.maxZ - 2) continue;
    if (distanceToPath(x, z) < TREE_PATH_CLEARANCE) continue;
    if (Math.abs(z - STREAM.centerZ) < TREE_STREAM_CLEARANCE) continue;
    if (Math.hypot(x - LANDMARKS.tree.x, z - LANDMARKS.tree.z) < TREE_FLOWER_TREE_CLEARANCE) {
      continue;
    }
    spots.push({
      x,
      z,
      y: sampleTerrainHeight(x, z),
      height: uniformRange(random, 2.6, 4.2),
      yaw: uniformRange(random, 0, Math.PI * 2),
      lean: uniformRange(random, -0.06, 0.06),
    });
  }
  return spots;
}

/** 三类普通树（实例化）。 */
export function buildOrdinaryTreeGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-ordinary-tree-group";
  const random = mulberry32(TREE_SEED);
  const dummy = new Object3D();
  let triangleCount = 0;

  const darkGreen = placeTrees(random, TREE_TYPE_COUNTS.darkGreen);
  const birch = placeTrees(random, TREE_TYPE_COUNTS.birch);
  const weeping = placeTrees(random, TREE_TYPE_COUNTS.weeping);

  // ---- 树干：棕色（深干+垂枝）与白色（白干）各一个 InstancedMesh ----
  const trunkGeometry = new CylinderGeometry(0.13, 0.24, 1, 5);
  trunkGeometry.translate(0, 0.5, 0); // 原点移到根部，便于按高度缩放
  const brownTrunks = new InstancedMesh(
    trunkGeometry,
    materials("treeTrunk"),
    darkGreen.length + weeping.length,
  );
  const whiteTrunks = new InstancedMesh(trunkGeometry, materials("treeTrunkWhite"), birch.length);
  brownTrunks.name = "ordinary-tree-trunk-brown";
  whiteTrunks.name = "ordinary-tree-trunk-white";
  tagWorldMaterialKind(brownTrunks, "treeTrunk");
  tagWorldMaterialKind(whiteTrunks, "treeTrunkWhite");

  let brownIndex = 0;
  const setTrunk = (mesh: InstancedMesh, index: number, spot: TreeSpot, slender: number): void => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(slender, spot.height, slender);
    dummy.rotation.set(spot.lean, spot.yaw, spot.lean);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  for (const spot of darkGreen) setTrunk(brownTrunks, brownIndex++, spot, 1);
  for (const spot of weeping) setTrunk(brownTrunks, brownIndex++, spot, 1.1);
  birch.forEach((spot, i) => setTrunk(whiteTrunks, i, spot, 0.62));
  brownTrunks.instanceMatrix.needsUpdate = true;
  whiteTrunks.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(trunkGeometry) * (brownIndex + birch.length);
  group.add(brownTrunks, whiteTrunks);

  // ---- 绿树冠：深干+白干+垂枝核心 共享一个 InstancedMesh（小球簇拼成圆冠） ----
  const crownGeometry = new IcosahedronGeometry(1, 0);
  const crownClusters: Array<{ spot: TreeSpot; dx: number; dy: number; dz: number; r: number }> =
    [];
  const addCrown = (spot: TreeSpot, clusters: number, spread: number, base: number): void => {
    for (let i = 0; i < clusters; i += 1) {
      const angle = (i / clusters) * Math.PI * 2 + spot.yaw;
      const ring = i === 0 ? 0 : spread;
      crownClusters.push({
        spot,
        dx: Math.cos(angle) * ring,
        dy: base + (i === 0 ? 0.5 : uniformRange(random, -0.2, 0.4)),
        dz: Math.sin(angle) * ring,
        r: i === 0 ? 1.25 : uniformRange(random, 0.8, 1.05),
      });
    }
  };
  for (const spot of darkGreen) addCrown(spot, 5, 1.0, spot.height * 0.86);
  for (const spot of birch) addCrown(spot, 4, 0.85, spot.height * 0.92);
  for (const spot of weeping) addCrown(spot, 2, 0.6, spot.height * 0.9);

  const crowns = new InstancedMesh(
    crownGeometry,
    materials("treeCanopyGreen"),
    crownClusters.length,
  );
  crowns.name = "ordinary-tree-canopy-green";
  tagWorldMaterialKind(crowns, "treeCanopyGreen");
  crownClusters.forEach((cluster, i) => {
    dummy.position.set(
      cluster.spot.x + cluster.dx,
      cluster.spot.y + cluster.dy,
      cluster.spot.z + cluster.dz,
    );
    dummy.scale.setScalar(cluster.r);
    dummy.rotation.set(0, cluster.spot.yaw + i, 0);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  crowns.instanceMatrix.needsUpdate = true;
  crowns.computeBoundingSphere();
  triangleCount += geometryTriangleCount(crownGeometry) * crownClusters.length;
  group.add(crowns);

  // ---- 垂枝：下垂细锥共享一个 InstancedMesh ----
  const strandGeometry = new ConeGeometry(0.07, 1.6, 4, 1, true);
  strandGeometry.translate(0, -0.8, 0); // 顶点在上、向下垂
  const strandCount = weeping.length * 10;
  const strands = new InstancedMesh(strandGeometry, materials("treeWillow"), strandCount);
  strands.name = "ordinary-tree-willow-strands";
  tagWorldMaterialKind(strands, "treeWillow");
  let strandIndex = 0;
  for (const spot of weeping) {
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + spot.yaw;
      const ring = uniformRange(random, 0.7, 1.3);
      dummy.position.set(
        spot.x + Math.cos(angle) * ring,
        spot.y + spot.height * 0.92,
        spot.z + Math.sin(angle) * ring,
      );
      dummy.scale.set(1, uniformRange(random, 0.8, 1.3), 1);
      dummy.rotation.set(
        uniformRange(random, -0.12, 0.12),
        angle,
        uniformRange(random, -0.12, 0.12),
      );
      dummy.updateMatrix();
      strands.setMatrixAt(strandIndex, dummy.matrix);
      strandIndex += 1;
    }
  }
  strands.instanceMatrix.needsUpdate = true;
  strands.computeBoundingSphere();
  triangleCount += geometryTriangleCount(strandGeometry) * strandIndex;
  group.add(strands);

  return { group, triangleCount };
}
