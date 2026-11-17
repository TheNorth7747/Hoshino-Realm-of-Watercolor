/**
 * 世界坐标基线（A0 独占，PRD 5.3 / 8.3）。
 *
 * 唯一权威：
 * - 所有 Agent 必须从这里读取坐标、边界、触发半径和地形高度，禁止复制另一套数字。
 * - `sampleTerrainHeight` 在 A0 是平坦占位；A3 用真实高度函数替换实现，
 *   但导出名、签名与“1 单位 = 1 米、Y 向上”的语义不得改变。
 */
import { Vector3 } from "three";
import type {
  LandmarkDefinition,
  LandmarkId,
  StoryNodeId,
  WorldBounds,
} from "../core/contracts";
import { sampleTerrainHeight } from "../world/terrainHeight";

/** 1 单位 = 1 米（PRD 5.3）。 */
export const WORLD_UNIT_METERS = 1;

/** 可玩范围 X/Z ∈ [-48, 48]，即 96m × 96m（PRD 4.1 / 5.3）。 */
export const WORLD_BOUNDS: WorldBounds = Object.freeze({
  minX: -48,
  maxX: 48,
  minZ: -48,
  maxZ: 48,
});

export const WORLD_SIZE_X = WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX;
export const WORLD_SIZE_Z = WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ;

/**
 * 地形高度：唯一实现。
 * A0 的平坦占位已被 A3 的 `src/world/terrainHeight.ts` 取代（缓起伏 + 蓝花坡 + 溪流河槽 + 踏石）。
 * 用 re-export 而不是复制：全项目只有一套高度函数，玩家贴地 / 镜头避让 / 出生点 / 触发判定
 * 都读同一个采样器（PRD 5.3 / 7.2）。
 *
 * 循环引用安全：terrainHeight 只在函数体内读取本文件的 LANDMARKS / STREAM，
 * 不在模块顶层取值，因此 config → world → config 的环不会触发 TDZ。
 */
export { sampleTerrainHeight };

/** 主路线沿负 Z 推进（PRD 5.3）。 */
export const MAIN_ROUTE_DIRECTION = new Vector3(0, 0, -1);

export const LANDMARKS: Readonly<Record<LandmarkId, LandmarkDefinition>> = Object.freeze({
  spawn: { id: "spawn", label: "出生草地", x: 0, z: 32, triggerRadius: 0 },
  flower: { id: "flower", label: "蓝花坡", x: -8, z: 20, triggerRadius: 4 },
  stream: { id: "stream", label: "溪流转折", x: 0, z: 8, triggerRadius: 4 },
  tree: { id: "tree", label: "花树根下", x: 0, z: -22, triggerRadius: 5 },
  lookout: { id: "lookout", label: "结局瞭望点", x: 0, z: -36, triggerRadius: 5 },
});

export const SPAWN_LANDMARK_ID: LandmarkId = "spawn";

/** 溪流基线：横跨 X 轴，Z ≈ 8，3～5 块踏石（PRD 5.3）。A3 据此建几何体。 */
export const STREAM = Object.freeze({
  centerZ: 8,
  widthMeters: 4,
  steppingStoneCount: 4,
  /** 踏石沿 X 轴分布，允许偏出主线，保证可通行。 */
  steppingStoneSpacing: 3,
});

/** 故事节点空间参数：坐标引用地标，不重复写数字（PRD 5.4 / 8.3）。 */
export interface StoryNodeSpatial {
  readonly id: StoryNodeId;
  readonly landmark: LandmarkId;
  readonly interactionRadius: number;
  /** 触发后大范围染色的半径；PRD 5.4：flower 4～6m，tree 10～14m。 */
  readonly bloomRadius: number;
}

export const STORY_NODE_SPATIAL: Readonly<Record<StoryNodeId, StoryNodeSpatial>> = Object.freeze({
  flower: { id: "flower", landmark: "flower", interactionRadius: 4, bloomRadius: 5 },
  stream: { id: "stream", landmark: "stream", interactionRadius: 4, bloomRadius: 4 },
  tree: { id: "tree", landmark: "tree", interactionRadius: 5, bloomRadius: 12 },
});

/** 单向推进顺序（PRD 9.6）。 */
export const STORY_NODE_ORDER: readonly StoryNodeId[] = Object.freeze([
  "flower",
  "stream",
  "tree",
] as const);

/** 3 枚星屑，每个节点一枚（PRD 5.4 / 9.5）。 */
export const STAR_SHARD_TOTAL = 3;

export function landmarkPosition(id: LandmarkId): Vector3 {
  const landmark = LANDMARKS[id];
  return new Vector3(landmark.x, sampleTerrainHeight(landmark.x, landmark.z), landmark.z);
}

export function spawnPosition(): Vector3 {
  return landmarkPosition(SPAWN_LANDMARK_ID);
}

export function isInsideWorldBounds(x: number, z: number): boolean {
  return (
    x >= WORLD_BOUNDS.minX &&
    x <= WORLD_BOUNDS.maxX &&
    z >= WORLD_BOUNDS.minZ &&
    z <= WORLD_BOUNDS.maxZ
  );
}

export interface PlanarPoint {
  readonly x: number;
  readonly z: number;
}

export function clampToWorldBounds(x: number, z: number): PlanarPoint {
  return {
    x: Math.min(Math.max(x, WORLD_BOUNDS.minX), WORLD_BOUNDS.maxX),
    z: Math.min(Math.max(z, WORLD_BOUNDS.minZ), WORLD_BOUNDS.maxZ),
  };
}

/** 水平面距离（Y 不参与），供触发半径与伙伴距离判定使用。 */
export function distanceXZ(a: PlanarPoint, b: PlanarPoint): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function isWithinLandmark(landmarkId: LandmarkId, point: PlanarPoint): boolean {
  const landmark = LANDMARKS[landmarkId];
  return distanceXZ(landmark, point) <= landmark.triggerRadius;
}
