/**
 * 暖土黄弯曲小径（V0.2 / V0.3 升级）。
 *
 * - 中心线用 CatmullRom 曲线串联 config 地标，宽度 1.35m（符合 1～1.4m 契约）。
 * - 逐顶点贴地并抬升防 z-fighting；补全 UV 属性，材质随 A1 同一 uniforms 染色。
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

/** 小径宽度（米），契约 1～1.4m。 */
export const PATH_WIDTH = 1.35;
/** 相对地形的抬升，防 z-fighting。 */
export const PATH_LIFT = 0.05;
const PATH_SEGMENTS = 150;
const PATH_FORD_HALF = 2.6;

function pathControlPoints(): Vector3[] {
  const ids = ["spawn", "flower", "stream", "tree", "lookout"] as const;
  return ids.map((id) => {
    const landmark = LANDMARKS[id];
    return new Vector3(landmark.x, 0, landmark.z);
  });
}

let coarseCenters: Vector3[] | null = null;
function pathCoarseCenters(): Vector3[] {
  if (!coarseCenters) {
    const curve = new CatmullRomCurve3(pathControlPoints(), false, "catmullrom", 0.5);
    coarseCenters = curve.getSpacedPoints(120);
  }
  return coarseCenters;
}

export function distanceToPath(x: number, z: number): number {
  let min = Number.POSITIVE_INFINITY;
  for (const center of pathCoarseCenters()) {
    const d = Math.hypot(x - center.x, z - center.z);
    if (d < min) min = d;
  }
  return min;
}

export function pathSurfaceHeight(x: number, z: number): number {
  let y = sampleTerrainHeight(x, z) + PATH_LIFT;
  if (Math.abs(z - STREAM.centerZ) <= PATH_FORD_HALF) {
    y = Math.max(y, STREAM_WATER_LEVEL + PATH_LIFT + 0.02);
  }
  return y;
}

export function buildPathGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-path-group";

  const curve = new CatmullRomCurve3(pathControlPoints(), false, "catmullrom", 0.5);
  const centers = curve.getSpacedPoints(PATH_SEGMENTS);
  const half = PATH_WIDTH / 2;

  const positions: number[] = [];
  const uvs: number[] = [];
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
    const px = -tangent.z;
    const pz = tangent.x;
    left.set(center.x + px * half, 0, center.z + pz * half);
    right.set(center.x - px * half, 0, center.z - pz * half);
    left.y = pathSurfaceHeight(left.x, left.z);
    right.y = pathSurfaceHeight(right.x, right.z);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    const v = i / Math.max(1, centers.length - 1);
    uvs.push(0, v, 1, v);
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const path = new Mesh(geometry, materials("path"));
  path.name = "world-path";
  tagWorldMaterialKind(path, "path");
  group.add(path);

  return { group, triangleCount: geometryTriangleCount(geometry) };
}
