/**
 * 地标场景物：花树、枯树、岩石与碰撞数据（A3，PRD 5.2 / 9.3 / 9.4）。
 *
 * - 花树是叙事主体：位置取 LANDMARKS.tree；树冠几何固定，
 *   「线稿枯树 → 粉色花树」由 A1 的染色遮罩驱动（treeCanopy 材质），几何不做两种状态。
 * - 枯树 / 岩石是路线上的装饰与碰撞载体：位置以地标为锚点的**偏移量**表达，
 *   不引入第二套世界坐标（PRD 5.3 / 7.2）。
 * - 碰撞：树干与岩石用圆形碰撞体（半径与 A2 的 CollisionCircle 契约一致），
 *   由集成者接到 PlayerController.addColliders()；踏石不设碰撞（可直接通行）。
 *
 * 踏石（PRD 5.3「设置 3～5 块踏石」）：位置唯一来源是 terrainHeight 的
 * `steppingStonePositions()`（由 config 的 STREAM 数量/间距推导），这里只负责
 * 在其上摆石块几何体；高度取自地形采样，因此石块顶面与可通过的河槽凸起一致。
 */
import { CylinderGeometry, Group, IcosahedronGeometry, Mesh } from "three";
import { LANDMARKS } from "../config/world";
import type { CollisionCircle } from "../player/collision";
import { sampleTerrainHeight, steppingStonePositions } from "./terrainHeight";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import { mulberry32, uniformRange } from "./scatter";

/** 花树树干碰撞半径（玩家半径 0.4 由 A2 解算时叠加）。 */
export const TREE_TRUNK_COLLIDER_RADIUS = 0.7;
/** 枯树 / 岩石碰撞半径。 */
const PROP_COLLIDER_RADIUS = 0.55;

interface PropOffset {
  /** 相对锚点地标的偏移（米）。 */
  readonly anchor: keyof typeof LANDMARKS;
  readonly dx: number;
  readonly dz: number;
}

/** 枯树：锚定在路线两侧，形成少量绕行趣味。 */
const DEAD_TREE_OFFSETS: readonly PropOffset[] = [
  { anchor: "flower", dx: 7, dz: 4.5 },
  { anchor: "stream", dx: 5.5, dz: -3.5 },
  { anchor: "tree", dx: -6.5, dz: 5 },
];

/** 岩石：小体量，可绕行。 */
const ROCK_OFFSETS: readonly PropOffset[] = [
  { anchor: "spawn", dx: 4.5, dz: -2 },
  { anchor: "tree", dx: 3.5, dz: 2.5 },
  { anchor: "lookout", dx: -4, dz: 3 },
];

export interface LandmarkBuildResult extends WorldMeshBuild {
  /** 圆形碰撞体（花树 + 枯树 + 岩石），交给 A2 的 PlayerController。 */
  readonly colliders: readonly CollisionCircle[];
}

/** 花树 + 枯树 + 岩石。 */
export function buildLandmarkGroup(materials: MaterialAccessor): LandmarkBuildResult {
  const group = new Group();
  group.name = "world-landmark-group";
  const random = mulberry32(20261119);
  const colliders: CollisionCircle[] = [];
  let triangleCount = 0;

  // ---- 花树（叙事主体，PRD 5.2）----
  const tree = new Group();
  tree.name = "flower-tree";
  const treeX = LANDMARKS.tree.x;
  const treeZ = LANDMARKS.tree.z;
  const treeY = sampleTerrainHeight(treeX, treeZ);
  tree.position.set(treeX, treeY, treeZ);

  const trunk = new Mesh(new CylinderGeometry(0.28, 0.42, 2.9, 7), materials("treeTrunk"));
  trunk.name = "flower-tree-trunk";
  tagWorldMaterialKind(trunk, "treeTrunk");
  trunk.position.y = 1.45;
  trunk.rotation.z = 0.06;
  tree.add(trunk);

  // 三根主枝：细圆锥倾斜，撑起树冠轮廓。
  const branchAngles = [2.4, 4.1, 5.5];
  for (let i = 0; i < branchAngles.length; i += 1) {
    const angle = branchAngles[i] ?? 0;
    const branch = new Mesh(new CylinderGeometry(0.06, 0.14, 1.7, 5), materials("treeTrunk"));
    branch.name = `flower-tree-branch-${i}`;
    tagWorldMaterialKind(branch, "treeTrunk");
    branch.position.set(Math.cos(angle) * 0.55, 2.6, Math.sin(angle) * 0.55);
    branch.rotation.set(Math.sin(angle) * 0.5, 0, -Math.cos(angle) * 0.5);
    tree.add(branch);
  }

  // 树冠：4 个低面数球体簇（粉色由染色遮罩揭示；线稿态由 A1 shader 呈现）。
  const canopySpecs: ReadonlyArray<{ r: number; x: number; y: number; z: number }> = [
    { r: 1.75, x: 0, y: 3.6, z: 0 },
    { r: 1.15, x: 1.0, y: 3.0, z: 0.5 },
    { r: 1.05, x: -1.05, y: 3.1, z: -0.45 },
    { r: 0.85, x: 0.25, y: 4.5, z: 0.15 },
  ];
  for (let i = 0; i < canopySpecs.length; i += 1) {
    const spec = canopySpecs[i];
    if (!spec) continue;
    const canopy = new Mesh(new IcosahedronGeometry(spec.r, 1), materials("treeCanopy"));
    canopy.name = `flower-tree-canopy-${i}`;
    tagWorldMaterialKind(canopy, "treeCanopy");
    canopy.position.set(spec.x, spec.y, spec.z);
    canopy.rotation.y = uniformRange(random, 0, Math.PI);
    tree.add(canopy);
  }

  triangleCount += countGroupTriangles(tree);
  colliders.push({ x: treeX, z: treeZ, radius: TREE_TRUNK_COLLIDER_RADIUS });
  group.add(tree);

  // ---- 枯树（路线装饰，有碰撞）----
  DEAD_TREE_OFFSETS.forEach((offset, index) => {
    const landmark = LANDMARKS[offset.anchor];
    const x = landmark.x + offset.dx;
    const z = landmark.z + offset.dz;
    const y = sampleTerrainHeight(x, z);

    const dead = new Group();
    dead.name = `dead-tree-${index}`;
    dead.position.set(x, y, z);
    const trunkMesh = new Mesh(new CylinderGeometry(0.12, 0.22, 1.9, 5), materials("treeTrunk"));
    trunkMesh.name = `dead-tree-${index}-trunk`;
    tagWorldMaterialKind(trunkMesh, "treeTrunk");
    trunkMesh.position.y = 0.95;
    trunkMesh.rotation.z = uniformRange(random, -0.18, 0.18);
    const branch = new Mesh(new CylinderGeometry(0.05, 0.1, 1.1, 5), materials("treeTrunk"));
    branch.name = `dead-tree-${index}-branch`;
    tagWorldMaterialKind(branch, "treeTrunk");
    branch.position.set(0.3, 1.55, 0);
    branch.rotation.z = -0.7;
    dead.add(trunkMesh, branch);
    triangleCount += countGroupTriangles(dead);
    colliders.push({ x, z, radius: PROP_COLLIDER_RADIUS });
    group.add(dead);
  });

  // ---- 岩石（可绕行的小障碍）----
  ROCK_OFFSETS.forEach((offset, index) => {
    const landmark = LANDMARKS[offset.anchor];
    const x = landmark.x + offset.dx;
    const z = landmark.z + offset.dz;
    const y = sampleTerrainHeight(x, z);
    const rock = new Mesh(
      new IcosahedronGeometry(uniformRange(random, 0.45, 0.7), 0),
      materials("rock"),
    );
    rock.name = `rock-${index}`;
    tagWorldMaterialKind(rock, "rock");
    rock.position.set(x, y + 0.12, z);
    rock.scale.set(1.15, 0.62, 1);
    rock.rotation.y = uniformRange(random, 0, Math.PI * 2);
    triangleCount += geometryTriangleCount(rock.geometry);
    colliders.push({ x, z, radius: PROP_COLLIDER_RADIUS });
    group.add(rock);
  });

  // ---- 踏石（PRD 5.3：溪流上 3～5 块，可通行，不设碰撞）----
  const stones = steppingStonePositions();
  stones.forEach((stone, index) => {
    const y = sampleTerrainHeight(stone.x, stone.z);
    // 石面略高于河槽凸起顶面一半，形成明确的“可踩”视觉，同时不阻断水槽。
    const slab = new Mesh(new IcosahedronGeometry(0.62, 0), materials("rock"));
    slab.name = `stepping-stone-${index}`;
    tagWorldMaterialKind(slab, "rock");
    slab.position.set(stone.x, y + 0.06, stone.z);
    slab.scale.set(1.05, 0.32, 0.95);
    slab.rotation.y = uniformRange(random, 0, Math.PI * 2);
    triangleCount += geometryTriangleCount(slab.geometry);
    group.add(slab);
  });

  return { group, triangleCount, colliders };
}

function countGroupTriangles(group: Group): number {
  let total = 0;
  group.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.geometry) total += geometryTriangleCount(mesh.geometry);
  });
  return total;
}
