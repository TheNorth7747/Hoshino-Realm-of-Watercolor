/**
 * 地标场景物（A3 / V0.3 雕塑感樱花树与圆润河石）：
 *
 * - 花树：虬结弯曲主干 + 7 根曲线枝杈 + 115 枚三色分层樱花水彩卡片，
 *   未显色时是通透铅笔枯枝速写，显色后绽放柔边粉霞花海。
 * - 踏石：平滑扁圆河石（14×10 细分椭球），与浅滩水位契合。
 * - 碰撞体：保留 6 处（花树 1 + 路侧/边缘自然岩块 5），配合 Props 倒木共 7 处（保持碰撞预算）。
 */
import {
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  Mesh,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
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

export const TREE_TRUNK_COLLIDER_RADIUS = 0.7;
const PROP_COLLIDER_RADIUS = 0.55;

interface PropOffset {
  readonly anchor: keyof typeof LANDMARKS;
  readonly dx: number;
  readonly dz: number;
}

/** 保持 5 处自然岩石错落（+ 花树 1 + Props 倒木 1 = 总计 7 碰撞体）。 */
const ROCK_OFFSETS: readonly PropOffset[] = [
  { anchor: "spawn", dx: 6.2, dz: -1.5 },
  { anchor: "flower", dx: -11.0, dz: 3.5 },
  { anchor: "stream", dx: -7.8, dz: -4.2 },
  { anchor: "tree", dx: 5.4, dz: 3.2 },
  { anchor: "lookout", dx: -4.8, dz: 3.2 },
];

export interface LandmarkBuildResult extends WorldMeshBuild {
  readonly colliders: readonly CollisionCircle[];
}

export function buildLandmarkGroup(materials: MaterialAccessor): LandmarkBuildResult {
  const group = new Group();
  group.name = "world-landmark-group";
  const random = mulberry32(20261119);
  const colliders: CollisionCircle[] = [];
  let triangleCount = 0;

  // ---- 1. 主角樱花树（LANDMARKS.tree）----
  const tree = new Group();
  tree.name = "flower-tree";
  const treeX = LANDMARKS.tree.x;
  const treeZ = LANDMARKS.tree.z;
  const treeY = sampleTerrainHeight(treeX, treeZ);
  tree.position.set(treeX, treeY, treeZ);

  // 弯曲有生命的樱树主干
  const trunkCurve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(-0.08, 1.0, 0.06),
    new Vector3(0.06, 2.1, -0.04),
    new Vector3(0.14, 3.1, 0.05),
  ]);
  const trunkGeometry = new TubeGeometry(trunkCurve, 12, 0.34, 8, false);
  const posAttr = trunkGeometry.attributes["position"];
  if (posAttr) {
    // 根粗梢细的自然收窄
    for (let i = 0; i < posAttr.count; i += 1) {
      const y = posAttr.getY(i);
      const t = Math.min(1, Math.max(0, y / 3.1));
      const factor = 1.28 - 0.52 * t;
      posAttr.setX(i, posAttr.getX(i) * factor);
      posAttr.setZ(i, posAttr.getZ(i) * factor);
    }
    posAttr.needsUpdate = true;
    trunkGeometry.computeVertexNormals();
  }
  const trunk = new Mesh(trunkGeometry, materials("treeTrunk"));
  trunk.name = "flower-tree-trunk";
  tagWorldMaterialKind(trunk, "treeTrunk");
  tree.add(trunk);

  // 7 根虬结舒展弯曲主枝（InstancedMesh 复用同一曲线分枝，保留名称与 ≥5 枝数量）
  const branchCurve = new CatmullRomCurve3([
    new Vector3(0, 0, 0),
    new Vector3(0.7, 0.65, 0.12),
    new Vector3(1.65, 1.1, -0.15),
    new Vector3(2.45, 1.38, 0.08),
  ]);
  const branchGeometry = new TubeGeometry(branchCurve, 10, 0.11, 6, false);
  const bPos = branchGeometry.attributes["position"];
  if (bPos) {
    for (let i = 0; i < bPos.count; i += 1) {
      const x = bPos.getX(i);
      const t = Math.min(1, Math.max(0, x / 2.45));
      const taper = 1.15 - 0.65 * t;
      bPos.setY(i, bPos.getY(i) * taper);
      bPos.setZ(i, bPos.getZ(i) * taper);
    }
    bPos.needsUpdate = true;
    branchGeometry.computeVertexNormals();
  }

  const BRANCH_COUNT = 7;
  const branches = new InstancedMesh(branchGeometry, materials("treeTrunk"), BRANCH_COUNT);
  branches.name = "flower-tree-branches";
  tagWorldMaterialKind(branches, "treeTrunk");
  const branchDummy = new Object3D();
  const branchTips: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < BRANCH_COUNT; i += 1) {
    const angle = (i / BRANCH_COUNT) * Math.PI * 2 + 0.3;
    const scale = 0.85 + (i % 3) * 0.18;
    const baseY = 2.45 + (i % 2) * 0.35;
    branchDummy.position.set(Math.cos(angle) * 0.15, baseY, Math.sin(angle) * 0.15);
    branchDummy.rotation.set(
      uniformRange(random, -0.14, 0.14),
      angle,
      uniformRange(random, -0.1, 0.16),
    );
    branchDummy.scale.set(scale, scale * 0.92, scale);
    branchDummy.updateMatrix();
    branches.setMatrixAt(i, branchDummy.matrix);

    const tipLocal = new Vector3(2.2, 1.25, 0).applyMatrix4(branchDummy.matrix);
    branchTips.push({ x: tipLocal.x, y: tipLocal.y, z: tipLocal.z });
  }
  branches.instanceMatrix.needsUpdate = true;
  tree.add(branches);

  // 樱花水彩花簇卡片：115 枚错落重叠花云（深玫红阴影 → 樱粉 → 浅樱白高光）
  const cardGeometry = new PlaneGeometry(1.85, 1.65);
  interface BlossomCard {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly scale: number;
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
    readonly tint: Color;
  }
  const cards: BlossomCard[] = [];
  const deepRose = new Color(0x9a3d5d);
  const midSakura = new Color(0xd96e92);
  const lightBlush = new Color(0xf5c2d3);

  const totalCards = 115;
  for (let i = 0; i < totalCards; i += 1) {
    const tip = branchTips[i % branchTips.length] ?? { x: 0, y: 4.2, z: 0 };
    const isTopCrown = i >= totalCards - 24;
    const anchorX = isTopCrown ? 0 : tip.x;
    const anchorY = isTopCrown ? 4.45 : tip.y;
    const anchorZ = isTopCrown ? 0 : tip.z;
    const spread = isTopCrown ? 2.1 : 1.55;

    const a = uniformRange(random, 0, Math.PI * 2);
    const r = Math.pow(random(), 0.65) * spread;
    const dy = uniformRange(random, -0.55, 0.78);
    const x = anchorX + Math.cos(a) * r;
    const y = anchorY + dy;
    const z = anchorZ + Math.sin(a) * r;

    const heightT = Math.min(1, Math.max(0, (y - 3.1) / 2.1));
    const tint =
      heightT > 0.62
        ? midSakura.clone().lerp(lightBlush, (heightT - 0.62) / 0.38)
        : deepRose.clone().lerp(midSakura, heightT / 0.62);
    tint.offsetHSL(uniformRange(random, -0.015, 0.015), 0, uniformRange(random, -0.04, 0.04));

    cards.push({
      x,
      y,
      z,
      scale: uniformRange(random, 0.88, 1.38),
      pitch: uniformRange(random, -0.4, 0.4),
      yaw: uniformRange(random, 0, Math.PI * 2),
      roll: uniformRange(random, -0.35, 0.35),
      tint,
    });
  }

  const canopy = new InstancedMesh(cardGeometry, materials("treeCanopy"), cards.length);
  canopy.name = "flower-tree-canopy";
  tagWorldMaterialKind(canopy, "treeCanopy");
  const canopyDummy = new Object3D();
  cards.forEach((card, i) => {
    canopyDummy.position.set(card.x, card.y, card.z);
    canopyDummy.scale.setScalar(card.scale);
    canopyDummy.rotation.set(card.pitch, card.yaw, card.roll);
    canopyDummy.updateMatrix();
    canopy.setMatrixAt(i, canopyDummy.matrix);
    canopy.setColorAt(i, card.tint);
  });
  canopy.instanceMatrix.needsUpdate = true;
  if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
  canopy.computeBoundingSphere();
  tree.add(canopy);

  triangleCount +=
    geometryTriangleCount(trunkGeometry) +
    geometryTriangleCount(branchGeometry) * BRANCH_COUNT +
    geometryTriangleCount(cardGeometry) * cards.length;
  colliders.push({ x: treeX, z: treeZ, radius: TREE_TRUNK_COLLIDER_RADIUS });
  group.add(tree);

  // ---- 2. 路侧自然岩块 ----
  ROCK_OFFSETS.forEach((offset, index) => {
    const landmark = LANDMARKS[offset.anchor];
    const x = landmark.x + offset.dx;
    const z = landmark.z + offset.dz;
    const y = sampleTerrainHeight(x, z);
    const rock = new Mesh(
      new SphereGeometry(uniformRange(random, 0.45, 0.68), 10, 7),
      materials("rock"),
    );
    rock.name = `rock-${index}`;
    tagWorldMaterialKind(rock, "rock");
    rock.position.set(x, y + 0.08, z);
    rock.scale.set(1.25, 0.52, 0.95);
    rock.rotation.y = uniformRange(random, 0, Math.PI * 2);
    triangleCount += geometryTriangleCount(rock.geometry);
    colliders.push({ x, z, radius: PROP_COLLIDER_RADIUS });
    group.add(rock);
  });

  // ---- 3. 溪流圆润踏石（平滑椭球鹅卵石，不设碰撞） ----
  const stones = steppingStonePositions();
  stones.forEach((stone, index) => {
    const y = sampleTerrainHeight(stone.x, stone.z);
    const slab = new Mesh(new SphereGeometry(0.66, 14, 10), materials("rock"));
    slab.name = `stepping-stone-${index}`;
    tagWorldMaterialKind(slab, "rock");
    slab.position.set(stone.x, y + 0.08, stone.z);
    slab.scale.set(1.28, 0.34, 1.08);
    slab.rotation.y = uniformRange(random, 0, Math.PI * 2);
    triangleCount += geometryTriangleCount(slab.geometry);
    group.add(slab);
  });

  return { group, triangleCount, colliders };
}
