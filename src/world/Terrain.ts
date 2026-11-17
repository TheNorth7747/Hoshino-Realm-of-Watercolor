/**
 * 地形 / 水面 / 远山网格构建（A3，PRD 9.4）。
 *
 * - 地形：96m × 96m 平面细分后按 terrainHeight 逐顶点抬升，法线重算；
 *   顶点位置即世界坐标（网格位于原点），A1 的世界坐标染色直接成立。
 * - 水面：横跨 X 轴的平面，宽度与中心线来自 config/world.ts 的 STREAM；
 *   高度取 terrainHeight.STREAM_WATER_LEVEL，两岸高度由地形函数保证恒高于水面。
 * - 远山：边界外一圈低面数圆锥（实例化、不进入高度采样、不设碰撞），雾化收边。
 *
 * 材质由调用方通过 MaterialAccessor 注入（WorldSystem 持有并负责后续替换为
 * A1 水彩材质）；每个网格用 userData["worldMaterialKind"] 标记种类。
 */
import {
  ConeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  PlaneGeometry,
  Object3D,
  type BufferGeometry,
  type Material,
} from "three";
import { STREAM, WORLD_BOUNDS } from "../config/world";
import { STREAM_WATER_LEVEL, sampleTerrainHeight } from "./terrainHeight";
import type { WorldMaterialKind } from "./worldMaterials";
import { mulberry32, uniformRange } from "./scatter";

/** 地形网格分辨率：121² 顶点 ≈ 28.8k 三角面，远低于 PRD 350k 预算。 */
const TERRAIN_SEGMENTS = 120;
/** 远山数量与种子（确定性复现）。 */
const MOUNTAIN_COUNT = 9;
const MOUNTAIN_SEED = 20261117;
/** 远山环带半径：全部在可玩边界外。 */
const MOUNTAIN_RING_MIN = 74;
const MOUNTAIN_RING_MAX = 94;

export interface WorldMeshBuild {
  readonly group: Group;
  /** 几何体三角面总数（性能预算统计用，PRD 11.1）。 */
  readonly triangleCount: number;
}

/** 材质访问器：按种类取材质（同一种类共享同一实例，减少 draw call 状态切换）。 */
export type MaterialAccessor = (kind: WorldMaterialKind) => Material;

/** 估算几何体三角面数（索引几何按 index/3，非索引按 position/3）。 */
export function geometryTriangleCount(geometry: BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3;
  return (geometry.attributes["position"]?.count ?? 0) / 3;
}

/** 标记网格的材质种类，WorldSystem 据此做染色材质替换。三个构建文件共用。 */
export function tagWorldMaterialKind(mesh: Mesh | InstancedMesh, kind: WorldMaterialKind): void {
  mesh.userData["worldMaterialKind"] = kind;
}

/** 地形 + 水面 + 远山。网格位于原点，顶点坐标即世界坐标。 */
export function buildTerrainGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-terrain-group";
  let triangleCount = 0;

  // ---- 地形 ----
  const terrainGeometry = new PlaneGeometry(
    WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
    WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  );
  // PlaneGeometry 默认在 XY 平面：翻转到 XZ 后逐顶点按世界坐标采样抬升。
  terrainGeometry.rotateX(-Math.PI / 2);
  const positions = terrainGeometry.attributes["position"];
  if (!positions) throw new Error("terrain geometry 缺少 position 属性");
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, sampleTerrainHeight(x, z));
  }
  positions.needsUpdate = true;
  terrainGeometry.computeVertexNormals();
  const terrain = new Mesh(terrainGeometry, materials("terrain"));
  terrain.name = "terrain-mesh";
  tagWorldMaterialKind(terrain, "terrain");
  triangleCount += geometryTriangleCount(terrainGeometry);
  group.add(terrain);

  // ---- 溪流水面：宽度/中心线/长度全部来自 config与世界常量 ----
  const waterGeometry = new PlaneGeometry(
    WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
    STREAM.widthMeters,
    96,
    1,
  );
  waterGeometry.rotateX(-Math.PI / 2);
  waterGeometry.translate(0, STREAM_WATER_LEVEL, STREAM.centerZ);
  const water = new Mesh(waterGeometry, materials("water"));
  water.name = "stream-water";
  tagWorldMaterialKind(water, "water");
  triangleCount += geometryTriangleCount(waterGeometry);
  group.add(water);

  // ---- 远山 ----
  const mountains = buildMountainRing(materials);
  triangleCount += mountains.triangleCount;
  group.add(mountains.group);

  return { group, triangleCount };
}

/** 远山环带：界外低面数圆锥，实例化单次绘制（PRD 11.1 Draw Calls 预算）。 */
function buildMountainRing(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "mountain-ring";
  const random = mulberry32(MOUNTAIN_SEED);
  let triangleCount = 0;

  const geometry = new ConeGeometry(1, 1, 7);
  const mesh = new InstancedMesh(geometry, materials("mountain"), MOUNTAIN_COUNT);
  mesh.name = "mountain-instances";
  tagWorldMaterialKind(mesh, "mountain");

  const dummy = new Object3D();
  let placed = 0;
  for (let i = 0; i < MOUNTAIN_COUNT; i += 1) {
    const angle = (i / MOUNTAIN_COUNT) * Math.PI * 2 + uniformRange(random, -0.18, 0.18);
    const radius = uniformRange(random, MOUNTAIN_RING_MIN, MOUNTAIN_RING_MAX);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // 只保留真正在可玩边界外的山，避免山体进入玩家视野前景。
    if (Math.abs(x) < WORLD_BOUNDS.maxX + 12 && Math.abs(z) < WORLD_BOUNDS.maxZ + 12) continue;
    const height = uniformRange(random, 16, 30);
    const baseRadius = uniformRange(random, 14, 22);
    dummy.position.set(x, height / 2 - 1.5, z);
    dummy.scale.set(baseRadius, height, baseRadius);
    dummy.rotation.y = uniformRange(random, 0, Math.PI);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(geometry) * placed;
  group.add(mesh);

  return { group, triangleCount };
}
