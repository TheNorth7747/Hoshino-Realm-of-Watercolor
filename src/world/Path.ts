/**
 * 暖土黄弯曲小径（V0.2 Agent 3，参考帧 frame-01/03 的引导土路）。
 *
 * - 中心线用 CatmullRom 曲线串联 config 地标（出生点 → 蓝花坡 → 溪流 → 花树 → 瞭望点），
 *   不引入第二套世界坐标；宽度先试 1.2m（PRD 任务 1～1.4m）。
 * - 逐顶点贴地（terrainHeight 采样）并整体抬升 PATH_LIFT 避免与地形 z-fighting；
 *   溪流带内抬到水面之上，读作可蹚过的浅滩 ford，与踏石对齐。
 * - 单条 ribbon 网格（1 draw call），材质种类 path，随 A1 同一 uniforms 染色。
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  Mesh,
  Vector3,
} from "three";
import { LANDMARKS, STREAM } from "../config/world";
import { STREAM_WATER_LEVEL, sampleTerrainHeight } from "./terrainHeight";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";

/** 小径宽度（米），任务要求 1～1.4m。 */
export const PATH_WIDTH = 1.2;
/** 相对地形的抬升，防 z-fighting。 */
export const PATH_LIFT = 0.05;
/** 中心线采样段数（ribbon 三角面 = 段数 × 2）。 */
const PATH_SEGMENTS = 150;
/** 溪流带内把小径抬到水面之上的半宽。 */
const PATH_FORD_HALF = 2.6;

/** 小径中心线控制点：全部取自 config 地标（含结局瞭望点收尾）。 */
function pathControlPoints(): Vector3[] {
  const ids = ["spawn", "flower", "stream", "tree", "lookout"] as const;
  return ids.map((id) => {
    const landmark = LANDMARKS[id];
    return new Vector3(landmark.x, 0, landmark.z);
  });
}

/** 粗采样中心线缓存（供植被/树木避让小径，避免逐点求曲线）。 */
let coarseCenters: Vector3[] | null = null;
function pathCoarseCenters(): Vector3[] {
  if (!coarseCenters) {
    const curve = new CatmullRomCurve3(pathControlPoints(), false, "catmullrom", 0.5);
    coarseCenters = curve.getSpacedPoints(120);
  }
  return coarseCenters;
}

/** 点到小径中心线的近似水平距离（米），用于草/花/树避让路面。 */
export function distanceToPath(x: number, z: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (const center of pathCoarseCenters()) {
    const d = Math.hypot(x - center.x, z - center.z);
    if (d < min) min = d;
  }
  return min;
}

/** 某点的小径高度：贴地 + 抬升；溪流带内不低于水面（浅滩 ford）。 */
export function pathSurfaceHeight(x: number, z: number): number {
  let y = sampleTerrainHeight(x, z) + PATH_LIFT;
  if (Math.abs(z - STREAM.centerZ) <= PATH_FORD_HALF) {
    y = Math.max(y, STREAM_WATER_LEVEL + PATH_LIFT + 0.02);
  }
  return y;
}

/** 弯曲小径 ribbon。 */
export function buildPathGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-path-group";

  const curve = new CatmullRomCurve3(pathControlPoints(), false, "catmullrom", 0.5);
  const centers = curve.getSpacedPoints(PATH_SEGMENTS);
  const half = PATH_WIDTH / 2;

  const positions: number[] = [];
  const indices: number[] = [];
  const left = new Vector3();
  const right = new Vector3();
  const tangent = new Vector3();

  for (let i = 0; i < centers.length; i += 1) {
    const center = centers[i];
    if (!center) continue;
    const prev = centers[Math.max(0, i - 1)] ?? center;
    const next = centers[Math.min(centers.length - 1, i + 1)] ?? center;
    tangent.set(next.x - prev.x, 0, next.z - prev.z);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, -1);
    tangent.normalize();
    // XZ 平面垂直方向。
    const px = -tangent.z;
    const pz = tangent.x;
    left.set(center.x + px * half, 0, center.z + pz * half);
    right.set(center.x - px * half, 0, center.z - pz * half);
    left.y = pathSurfaceHeight(left.x, left.z);
    right.y = pathSurfaceHeight(right.x, right.z);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const path = new Mesh(geometry, materials("path"));
  path.name = "world-path";
  tagWorldMaterialKind(path, "path");
  group.add(path);

  return { group, triangleCount: geometryTriangleCount(geometry) };
}
