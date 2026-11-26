/**
 * 参考视频标志性叙事小景（V0.3）：
 * 1. 溪畔倒木 + 苔藓斑 + 红顶小蘑菇（还原视频 00:00～00:02 路径旁倒木与红蘑菇）。
 * 2. 开场与路径两侧黄色开花水彩灌木丛（还原视频 00:00～00:04 亮黄绿灌木簇）。
 */
import {
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import type { CollisionCircle } from "../player/collision";
import { LANDMARKS } from "../config/world";
import { sampleTerrainHeight } from "./terrainHeight";
import {
  geometryTriangleCount,
  tagWorldMaterialKind,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
import { mulberry32, uniformRange } from "./scatter";

export interface PropsBuildResult extends WorldMeshBuild {
  readonly colliders: readonly CollisionCircle[];
}

interface BushSpot {
  readonly x: number;
  readonly z: number;
  readonly scale: number;
}

const BUSH_SPOTS: readonly BushSpot[] = [
  { x: 3.4, z: 26.8, scale: 1.05 },
  { x: 5.1, z: 24.5, scale: 0.85 },
  { x: -4.2, z: 28.0, scale: 0.9 },
  { x: -11.5, z: 18.0, scale: 1.0 },
  { x: 5.5, z: 15.5, scale: 0.95 },
  { x: -6.2, z: 2.0, scale: 1.05 },
  { x: 6.4, z: -4.5, scale: 1.0 },
  { x: -5.8, z: -12.0, scale: 0.95 },
];

export function buildPropsGroup(materials: MaterialAccessor): PropsBuildResult {
  const group = new Group();
  group.name = "world-props-group";
  const random = mulberry32(20260312);
  const colliders: CollisionCircle[] = [];
  let triangleCount = 0;

  // ---- 1. 溪边倒木 + 红点小蘑菇（在 (3.4, 13.8)，远离溪水带与主路线中心） ----
  const logX = LANDMARKS.stream.x + 3.4;
  const logZ = LANDMARKS.stream.z + 5.8;
  const logY = sampleTerrainHeight(logX, logZ);

  const fallenLog = new Group();
  fallenLog.name = "fallen-log-group";
  fallenLog.position.set(logX, logY + 0.16, logZ);
  fallenLog.rotation.y = 0.36;

  const logGeometry = new CylinderGeometry(0.22, 0.28, 2.6, 10);
  logGeometry.rotateZ(Math.PI / 2);
  const logMesh = new Mesh(logGeometry, materials("treeTrunk"));
  logMesh.name = "fallen-log-trunk";
  tagWorldMaterialKind(logMesh, "treeTrunk");
  triangleCount += geometryTriangleCount(logGeometry);
  fallenLog.add(logMesh);

  // 倒木苔藓贴片
  const mossGeometry = new SphereGeometry(0.26, 8, 6);
  const mossMesh = new Mesh(mossGeometry, materials("moss"));
  mossMesh.name = "fallen-log-moss";
  mossMesh.scale.set(2.4, 0.35, 0.85);
  mossMesh.position.set(-0.2, 0.19, 0.04);
  tagWorldMaterialKind(mossMesh, "moss");
  triangleCount += geometryTriangleCount(mossGeometry);
  fallenLog.add(mossMesh);

  // 红帽白柄小蘑菇簇
  const capGeometry = new SphereGeometry(0.09, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const stemGeometry = new CylinderGeometry(0.025, 0.035, 0.12, 7);
  const mushroomOffsets: ReadonlyArray<{ dx: number; dz: number; s: number }> = [
    { dx: -0.75, dz: 0.3, s: 1.15 },
    { dx: -0.58, dz: 0.38, s: 0.85 },
    { dx: -0.45, dz: 0.25, s: 0.7 },
    { dx: 0.55, dz: 0.34, s: 1.05 },
    { dx: 0.72, dz: 0.28, s: 0.78 },
  ];
  const caps = new InstancedMesh(capGeometry, materials("mushroomCap"), mushroomOffsets.length);
  caps.name = "fallen-log-mushroom-caps";
  tagWorldMaterialKind(caps, "mushroomCap");
  const stems = new InstancedMesh(
    stemGeometry,
    materials("treeTrunkWhite"),
    mushroomOffsets.length,
  );
  stems.name = "fallen-log-mushroom-stems";
  tagWorldMaterialKind(stems, "treeTrunkWhite");

  const dummy = new Object3D();
  mushroomOffsets.forEach((m, i) => {
    dummy.position.set(m.dx, -0.06 + 0.06 * m.s, m.dz);
    dummy.scale.setScalar(m.s);
    dummy.rotation.set(0, i * 0.8, 0);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);

    dummy.position.set(m.dx, -0.06 + 0.11 * m.s, m.dz);
    dummy.scale.set(m.s, m.s * 0.85, m.s);
    dummy.updateMatrix();
    caps.setMatrixAt(i, dummy.matrix);
  });
  caps.instanceMatrix.needsUpdate = true;
  stems.instanceMatrix.needsUpdate = true;
  triangleCount +=
    (geometryTriangleCount(capGeometry) + geometryTriangleCount(stemGeometry)) *
    mushroomOffsets.length;
  fallenLog.add(stems, caps);
  group.add(fallenLog);
  colliders.push({ x: logX, z: logZ, radius: 0.75 });

  // ---- 2. 黄色开花水彩灌木丛（单次 InstancedMesh） ----
  const cardGeo = new PlaneGeometry(1.1, 0.9);
  const cardsPerBush = 7;
  const bushMesh = new InstancedMesh(
    cardGeo,
    materials("bushYellow"),
    BUSH_SPOTS.length * cardsPerBush,
  );
  bushMesh.name = "meadow-yellow-bushes";
  tagWorldMaterialKind(bushMesh, "bushYellow");

  let idx = 0;
  for (const spot of BUSH_SPOTS) {
    const y = sampleTerrainHeight(spot.x, spot.z);
    for (let i = 0; i < cardsPerBush; i += 1) {
      const a = (i / cardsPerBush) * Math.PI * 2 + uniformRange(random, -0.2, 0.2);
      const r = i === 0 ? 0 : uniformRange(random, 0.25, 0.55) * spot.scale;
      dummy.position.set(
        spot.x + Math.cos(a) * r,
        y + (0.38 + (i === 0 ? 0.18 : uniformRange(random, 0, 0.15))) * spot.scale,
        spot.z + Math.sin(a) * r,
      );
      dummy.rotation.set(
        uniformRange(random, -0.25, 0.25),
        a + Math.PI * 0.5,
        uniformRange(random, -0.2, 0.2),
      );
      dummy.scale.setScalar(spot.scale * uniformRange(random, 0.85, 1.2));
      dummy.updateMatrix();
      bushMesh.setMatrixAt(idx, dummy.matrix);
      idx += 1;
    }
  }
  bushMesh.instanceMatrix.needsUpdate = true;
  bushMesh.computeBoundingSphere();
  triangleCount += geometryTriangleCount(cardGeo) * idx;
  group.add(bushMesh);

  return { group, triangleCount, colliders };
}
