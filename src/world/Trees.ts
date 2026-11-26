/**
 * 普通树森林（V0.3 水彩笔触叶簇版）。
 *
 * - 三类：深干绿树（含溪边斜干树）、白桦树（白干黑斑）、垂柳（溪畔摇曳长帘）。
 * - 树冠摒弃多面体球体，改用多角度交叉倾斜的水彩笔触卡片簇（`foliage` 双态着色器 + `instanceColor` 明暗层次）：
 *   未显色态呈现通透铅笔卷曲线稿，显色后呈现柔边点染水彩叶团。
 * - 垂柳帘倒置 UV.y（顶部固定于枝头、底端随风摇曳），使用 `willow` 模式。
 * - 全部 InstancedMesh 共享几何（4 draw calls 承载全部 36 棵树），避让小径/溪流/花树净空。
 */
import { Color, CylinderGeometry, Group, InstancedMesh, Object3D, PlaneGeometry } from "three";
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

/** 普通树总数（契约 25～40）。 */
export const ORDINARY_TREE_COUNT = 36;
export const TREE_TYPE_COUNTS = {
  darkGreen: 13,
  birch: 15,
  weeping: 8,
} as const;

const TREE_SEED = 20261120;
const TREE_PATH_CLEARANCE = 3.5;
const TREE_STREAM_CLEARANCE = 3.05;
const TREE_FLOWER_TREE_CLEARANCE = 6.2;
const TREE_EXTENT = 44;

interface TreeSpot {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly height: number;
  readonly yaw: number;
  readonly leanX: number;
  readonly leanZ: number;
}

function isTreeSpotSafe(x: number, z: number): boolean {
  if (Math.abs(x) > WORLD_BOUNDS.maxX - 2 || Math.abs(z) > WORLD_BOUNDS.maxZ - 2) return false;
  if (distanceToPath(x, z) < TREE_PATH_CLEARANCE) return false;
  if (Math.abs(z - STREAM.centerZ) < TREE_STREAM_CLEARANCE) return false;
  if (Math.hypot(x - LANDMARKS.tree.x, z - LANDMARKS.tree.z) < TREE_FLOWER_TREE_CLEARANCE) {
    return false;
  }
  return true;
}

function makeSpot(
  x: number,
  z: number,
  height: number,
  yaw: number,
  leanX: number,
  leanZ: number,
): TreeSpot {
  return { x, z, y: sampleTerrainHeight(x, z), height, yaw, leanX, leanZ };
}

function placeTrees(
  random: () => number,
  count: number,
  fixedSpots: readonly TreeSpot[] = [],
  zRange: readonly [number, number] = [-TREE_EXTENT, TREE_EXTENT],
  xRange: readonly [number, number] = [4.5, 22],
): TreeSpot[] {
  const spots: TreeSpot[] = [...fixedSpots];
  let guard = 0;
  while (spots.length < count && guard < count * 50) {
    guard += 1;
    const side = random() < 0.5 ? -1 : 1;
    const x = side * uniformRange(random, xRange[0], xRange[1]);
    const z = uniformRange(random, zRange[0], zRange[1]);
    if (!isTreeSpotSafe(x, z)) continue;
    spots.push(
      makeSpot(
        x,
        z,
        uniformRange(random, 3.2, 5.2),
        uniformRange(random, 0, Math.PI * 2),
        uniformRange(random, -0.08, 0.08),
        uniformRange(random, -0.08, 0.08),
      ),
    );
  }
  return spots;
}

/** 构造垂枝面片几何：顶部 (y=0) uv.y=0 固定，底端 (y=-1) uv.y=1 随风摇曳。 */
function makeWillowStrandGeometry(): PlaneGeometry {
  const geo = new PlaneGeometry(0.92, 1.0, 1, 4);
  geo.translate(0, -0.5, 0);
  const uv = geo.attributes["uv"];
  if (uv) {
    for (let i = 0; i < uv.count; i += 1) {
      uv.setY(i, 1 - uv.getY(i));
    }
    uv.needsUpdate = true;
  }
  return geo;
}

export function buildOrdinaryTreeGroup(materials: MaterialAccessor): WorldMeshBuild {
  const group = new Group();
  group.name = "world-ordinary-tree-group";
  const random = mulberry32(TREE_SEED);
  const dummy = new Object3D();
  let triangleCount = 0;

  // 构图引导关键树：开场两侧白桦 + 溪边左岸斜干深色树 + 溪畔垂柳
  const fixedBirch: TreeSpot[] = [
    makeSpot(-4.8, 25.5, 4.4, 0.4, 0.04, -0.03),
    makeSpot(4.6, 26.2, 4.7, 1.2, -0.03, 0.02),
    makeSpot(6.5, 19.5, 4.3, 2.4, 0.03, 0.04),
  ].filter((s) => isTreeSpotSafe(s.x, s.z));

  const fixedDark: TreeSpot[] = [
    // 视频 00:03 溪流左侧优雅倾斜的深干树
    makeSpot(-4.9, 11.4, 4.5, 0.3, -0.18, 0.24),
    makeSpot(-6.8, 28.0, 4.6, 1.8, 0.05, -0.04),
  ].filter((s) => isTreeSpotSafe(s.x, s.z));

  const fixedWillow: TreeSpot[] = [
    // 视频 00:04 / 00:17 溪流两岸的垂柳
    makeSpot(-5.6, 4.5, 4.4, 0.7, -0.05, 0.04),
    makeSpot(5.8, 11.4, 4.6, 2.1, 0.06, -0.04),
    makeSpot(6.4, 4.4, 4.3, 1.4, -0.04, -0.05),
  ].filter((s) => isTreeSpotSafe(s.x, s.z));

  const darkGreen = placeTrees(random, TREE_TYPE_COUNTS.darkGreen, fixedDark);
  const birch = placeTrees(random, TREE_TYPE_COUNTS.birch, fixedBirch);
  const weeping = placeTrees(random, TREE_TYPE_COUNTS.weeping, fixedWillow, [-16, 18], [5.2, 18]);

  // ---- 树干：棕色与白桦各一个 InstancedMesh ----
  const trunkGeometry = new CylinderGeometry(0.11, 0.23, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
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
  const setTrunk = (
    mesh: InstancedMesh,
    index: number,
    spot: TreeSpot,
    thickness: number,
  ): void => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(thickness, spot.height, thickness);
    dummy.rotation.set(spot.leanX, spot.yaw, spot.leanZ);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  for (const spot of darkGreen) setTrunk(brownTrunks, brownIndex++, spot, 1.05);
  for (const spot of weeping) setTrunk(brownTrunks, brownIndex++, spot, 1.15);
  birch.forEach((spot, i) => setTrunk(whiteTrunks, i, spot, 0.68));
  brownTrunks.instanceMatrix.needsUpdate = true;
  whiteTrunks.instanceMatrix.needsUpdate = true;
  triangleCount += geometryTriangleCount(trunkGeometry) * (brownIndex + birch.length);
  group.add(brownTrunks, whiteTrunks);

  // ---- 水彩叶簇卡片树冠：1 个 InstancedMesh + 分层 instanceColor ----
  const cardGeometry = new PlaneGeometry(1.75, 1.65);
  interface CrownCard {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly scale: number;
    readonly pitch: number;
    readonly yaw: number;
    readonly roll: number;
    readonly tint: Color;
  }
  const crownCards: CrownCard[] = [];

  const topPalette = [new Color(0xc9e068), new Color(0xaed35e), new Color(0x98ca58)];
  const midPalette = [new Color(0x7eb650), new Color(0x6da848), new Color(0x88bf52)];
  const shadePalette = [new Color(0x528840), new Color(0x477b3b)];

  const addCanopyCards = (
    spot: TreeSpot,
    cardCount: number,
    spreadXZ: number,
    spreadY: number,
    cardScale: number,
  ): void => {
    const topX = spot.x + Math.sin(spot.leanZ) * spot.height * 0.6;
    const topY = spot.y + spot.height * 0.96;
    const topZ = spot.z + Math.sin(spot.leanX) * spot.height * 0.6;

    for (let i = 0; i < cardCount; i += 1) {
      const layerT = i / Math.max(1, cardCount - 1);
      const angle = i * 2.39996 + spot.yaw;
      const radial = Math.sqrt(layerT) * spreadXZ * uniformRange(random, 0.55, 1.05);
      const dy = (1 - layerT * 1.15) * spreadY + uniformRange(random, -0.25, 0.28);

      const palette = dy > 0.3 ? topPalette : dy < -0.25 ? shadePalette : midPalette;
      const baseColor = palette[Math.floor(random() * palette.length)] ?? midPalette[0]!;
      const tint = baseColor
        .clone()
        .offsetHSL(
          uniformRange(random, -0.02, 0.02),
          uniformRange(random, -0.05, 0.05),
          uniformRange(random, -0.04, 0.05),
        );

      crownCards.push({
        x: topX + Math.cos(angle) * radial,
        y: topY + dy,
        z: topZ + Math.sin(angle) * radial,
        scale: cardScale * uniformRange(random, 0.78, 1.24),
        pitch: uniformRange(random, -0.35, 0.35),
        yaw: angle + uniformRange(random, -0.5, 0.5),
        roll: uniformRange(random, -0.28, 0.28),
        tint,
      });
    }
  };

  for (const spot of darkGreen) addCanopyCards(spot, 20, 1.45, 0.85, 1.18);
  for (const spot of birch) addCanopyCards(spot, 16, 1.15, 0.95, 1.02);
  for (const spot of weeping) addCanopyCards(spot, 10, 1.1, 0.55, 0.95);

  const crowns = new InstancedMesh(cardGeometry, materials("treeCanopyGreen"), crownCards.length);
  crowns.name = "ordinary-tree-canopy-green";
  tagWorldMaterialKind(crowns, "treeCanopyGreen");
  crownCards.forEach((card, i) => {
    dummy.position.set(card.x, card.y, card.z);
    dummy.scale.setScalar(card.scale);
    dummy.rotation.set(card.pitch, card.yaw, card.roll);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, card.tint);
  });
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  crowns.computeBoundingSphere();
  triangleCount += geometryTriangleCount(cardGeometry) * crownCards.length;
  group.add(crowns);

  // ---- 垂柳摇曳长帘（1 InstancedMesh） ----
  const strandGeometry = makeWillowStrandGeometry();
  const strandsPerTree = 16;
  const strands = new InstancedMesh(
    strandGeometry,
    materials("treeWillow"),
    weeping.length * strandsPerTree,
  );
  strands.name = "ordinary-tree-willow-strands";
  tagWorldMaterialKind(strands, "treeWillow");

  let strandIndex = 0;
  const willowLight = new Color(0xb5d664);
  const willowDeep = new Color(0x6e9d48);
  for (const spot of weeping) {
    for (let i = 0; i < strandsPerTree; i += 1) {
      const angle = (i / strandsPerTree) * Math.PI * 2 + spot.yaw;
      const ring = uniformRange(random, 0.55, 1.45);
      dummy.position.set(
        spot.x + Math.cos(angle) * ring,
        spot.y + spot.height * uniformRange(random, 0.88, 1.04),
        spot.z + Math.sin(angle) * ring,
      );
      dummy.scale.set(uniformRange(random, 0.85, 1.25), uniformRange(random, 2.3, 3.4), 1);
      dummy.rotation.set(
        uniformRange(random, -0.06, 0.06),
        angle + (i % 2 === 0 ? 0 : Math.PI * 0.5),
        uniformRange(random, -0.06, 0.06),
      );
      dummy.updateMatrix();
      strands.setMatrixAt(strandIndex, dummy.matrix);
      strands.setColorAt(
        strandIndex,
        willowDeep.clone().lerp(willowLight, uniformRange(random, 0.15, 0.95)),
      );
      strandIndex += 1;
    }
  }
  strands.instanceMatrix.needsUpdate = true;
  if (strands.instanceColor) strands.instanceColor.needsUpdate = true;
  strands.computeBoundingSphere();
  triangleCount += geometryTriangleCount(strandGeometry) * strandIndex;
  group.add(strands);

  return { group, triangleCount };
}
