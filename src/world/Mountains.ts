/**
 * 三层连绵水彩远山环带（V0.3）。
 *
 * 取代 V0.1/V0.2 的 7 边圆锥金字塔，改用 3 层连续起伏山脊：
 * - 近山层（r ≈ 70m，豆绿 #86b37d）
 * - 中山层（r ≈ 88m，雾青 #84a9a4）
 * - 远山层（r ≈ 108m，淡蓝紫 #9fa7c5）
 * 所有顶点严格位于可玩边界（±48m）之外；`uv.y` 从山脚 0 到山脊 1，供 `mountain` 着色器画斜排线与水彩晕染。
 */
import { BufferGeometry, Float32BufferAttribute, Group, Mesh } from "three";
import { WORLD_BOUNDS } from "../config/world";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import type { WorldMaterialKind } from "./worldMaterials";

interface RidgeSpec {
  readonly name: string;
  readonly kind: WorldMaterialKind;
  readonly baseRadius: number;
  readonly radialWave: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly baseOffsetY: number;
  readonly phase: number;
  readonly segments: number;
}

const RIDGE_SPECS: readonly RidgeSpec[] = [
  {
    name: "mountain-ridge-near",
    kind: "mountain",
    baseRadius: 74,
    radialWave: 4.5,
    minHeight: 11,
    maxHeight: 22,
    baseOffsetY: -6.5,
    phase: 0.4,
    segments: 120,
  },
  {
    name: "mountain-ridge-mid",
    kind: "mountainMid",
    baseRadius: 94,
    radialWave: 6.0,
    minHeight: 16,
    maxHeight: 30,
    baseOffsetY: -6.0,
    phase: 1.9,
    segments: 120,
  },
  {
    name: "mountain-ridge-far",
    kind: "mountainFar",
    baseRadius: 114,
    radialWave: 7.0,
    minHeight: 22,
    maxHeight: 40,
    baseOffsetY: -5.5,
    phase: 3.4,
    segments: 120,
  },
];

function ridgeHeight(angle: number, spec: RidgeSpec): number {
  const n =
    0.45 * Math.sin(angle * 3 + spec.phase) +
    0.3 * Math.cos(angle * 5 - spec.phase * 0.7) +
    0.16 * Math.sin(angle * 9 + spec.phase * 1.4) +
    0.09 * Math.cos(angle * 15 - spec.phase);
  const t = Math.min(1, Math.max(0, n * 0.5 + 0.5));
  return spec.minHeight + (spec.maxHeight - spec.minHeight) * t;
}

function buildRidgeMesh(
  spec: RidgeSpec,
  materials: MaterialAccessor,
): { mesh: Mesh; triangles: number } {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const smoothMinOuter = Math.max(WORLD_BOUNDS.maxX, WORLD_BOUNDS.maxZ) + 21;

  for (let i = 0; i <= spec.segments; i += 1) {
    const u = i / spec.segments;
    const angle = u * Math.PI * 2;
    const radialJitter = Math.sin(angle * 4 + spec.phase) * spec.radialWave;
    const r = Math.max(smoothMinOuter, spec.baseRadius + radialJitter);

    const dirX = Math.cos(angle);
    const dirZ = Math.sin(angle);

    const x = dirX * r;
    const z = dirZ * r;
    const ridgeY = spec.baseOffsetY + ridgeHeight(angle, spec);

    // 下顶点（山脚）与上顶点（山脊线），法线朝向圆心内侧
    positions.push(x, spec.baseOffsetY, z, x * 1.03, ridgeY, z * 1.03);
    uvs.push(u * 4, 0, u * 4, 1);

    if (i > 0) {
      const a = (i - 1) * 2;
      // 顺时针朝向内侧（世界中心）
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new Mesh(geometry, materials(spec.kind));
  mesh.name = spec.name;
  tagWorldMaterialKind(mesh, spec.kind);
  return { mesh, triangles: geometryTriangleCount(geometry) };
}

export function buildMountainGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "mountain-ring";
  let triangleCount = 0;

  for (const spec of RIDGE_SPECS) {
    const built = buildRidgeMesh(spec, materials);
    triangleCount += built.triangles;
    group.add(built.mesh);
  }

  return { group, triangleCount };
}
