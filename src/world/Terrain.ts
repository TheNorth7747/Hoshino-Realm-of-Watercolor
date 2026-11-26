/**
 * 地形 / 水面 / 远山网格构建（A3 / V0.3 升级）。
 *
 * - 地形：96m × 96m 平面细分后按 terrainHeight 逐顶点抬升，平滑法线。
 * - 水面：横跨 X 轴的平面，保留 UV 供 V0.3 `water` 流动水彩笔触着色器使用。
 * - 远山：委托 `./Mountains` 构建 3 层连绵水彩山脊环带（替代圆锥）。
 */
import {
  Group,
  Mesh,
  PlaneGeometry,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from "three";
import { STREAM, WORLD_BOUNDS } from "../config/world";
import { STREAM_WATER_LEVEL, sampleTerrainHeight } from "./terrainHeight";
import { buildMountainGroup } from "./Mountains";
import type { WorldMaterialKind } from "./worldMaterials";

/** 地形网格分辨率：121² 顶点 ≈ 28.8k 三角面，远低于 PRD 350k 预算。 */
const TERRAIN_SEGMENTS = 120;

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

/** 标记网格的材质种类，WorldSystem 据此做染色材质替换。 */
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

  // ---- 溪流水面：PlaneGeometry 自带 u∈[0,1] 沿 X、v∈[0,1] 跨宽度，供水彩水纹流动 ----
  const waterGeometry = new PlaneGeometry(
    WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX,
    STREAM.widthMeters,
    96,
    4,
  );
  waterGeometry.rotateX(-Math.PI / 2);
  waterGeometry.translate(0, STREAM_WATER_LEVEL, STREAM.centerZ);
  const water = new Mesh(waterGeometry, materials("water"));
  water.name = "stream-water";
  tagWorldMaterialKind(water, "water");
  triangleCount += geometryTriangleCount(waterGeometry);
  group.add(water);

  // ---- 三层连绵水彩远山 ----
  const mountains = buildMountainGroup(materials);
  triangleCount += mountains.triangleCount;
  group.add(mountains.group);

  return { group, triangleCount };
}
