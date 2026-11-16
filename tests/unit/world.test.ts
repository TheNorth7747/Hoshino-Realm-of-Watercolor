import { describe, expect, it } from "vitest";
import {
  LANDMARKS,
  STAR_SHARD_TOTAL,
  STORY_NODE_ORDER,
  STORY_NODE_SPATIAL,
  STREAM,
  WORLD_BOUNDS,
  WORLD_SIZE_X,
  WORLD_SIZE_Z,
  clampToWorldBounds,
  distanceXZ,
  isInsideWorldBounds,
  isWithinLandmark,
  landmarkPosition,
  sampleTerrainHeight,
  spawnPosition,
} from "../../src/config/world";

describe("世界边界", () => {
  it("可玩范围 96m × 96m，X/Z ∈ [-48, 48]", () => {
    expect(WORLD_BOUNDS).toEqual({ minX: -48, maxX: 48, minZ: -48, maxZ: 48 });
    expect(WORLD_SIZE_X).toBe(96);
    expect(WORLD_SIZE_Z).toBe(96);
  });

  it("边界上视为界内，越界为界外", () => {
    expect(isInsideWorldBounds(48, 48)).toBe(true);
    expect(isInsideWorldBounds(-48, -48)).toBe(true);
    expect(isInsideWorldBounds(0, 0)).toBe(true);
    expect(isInsideWorldBounds(48.001, 0)).toBe(false);
    expect(isInsideWorldBounds(0, -48.5)).toBe(false);
  });

  it("越界坐标被夹回边界", () => {
    expect(clampToWorldBounds(100, -100)).toEqual({ x: 48, z: -48 });
    expect(clampToWorldBounds(-100, 100)).toEqual({ x: -48, z: 48 });
    expect(clampToWorldBounds(3, 4)).toEqual({ x: 3, z: 4 });
  });
});

describe("地形高度采样", () => {
  it("A0 占位地形在地图内任意位置返回有限数值", () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [-48, -48],
      [48, 48],
      [-48, 48],
      [48, -48],
      [12.5, -7.25],
    ];
    for (const [x, z] of samples) {
      const height = sampleTerrainHeight(x, z);
      expect(Number.isFinite(height)).toBe(true);
    }
  });
});

describe("地标坐标（PRD 5.3）", () => {
  it("五个地标坐标与 PRD 表格一致", () => {
    expect(LANDMARKS.spawn).toMatchObject({ x: 0, z: 32 });
    expect(LANDMARKS.flower).toMatchObject({ x: -8, z: 20 });
    expect(LANDMARKS.stream).toMatchObject({ x: 0, z: 8 });
    expect(LANDMARKS.tree).toMatchObject({ x: 0, z: -22 });
    expect(LANDMARKS.lookout).toMatchObject({ x: 0, z: -36 });
  });

  it("地标都在可玩范围内", () => {
    for (const landmark of Object.values(LANDMARKS)) {
      expect(isInsideWorldBounds(landmark.x, landmark.z)).toBe(true);
    }
  });

  it("landmarkPosition 的 Y 来自地形采样", () => {
    const position = landmarkPosition("tree");
    expect(position.x).toBe(0);
    expect(position.z).toBe(-22);
    expect(position.y).toBe(sampleTerrainHeight(0, -22));
  });

  it("出生点就是 spawn 地标", () => {
    const spawn = spawnPosition();
    expect(spawn.x).toBe(LANDMARKS.spawn.x);
    expect(spawn.z).toBe(LANDMARKS.spawn.z);
  });

  it("主路线沿负 Z 推进：花坡 → 溪流 → 花树", () => {
    expect(LANDMARKS.flower.z).toBeGreaterThan(LANDMARKS.stream.z);
    expect(LANDMARKS.stream.z).toBeGreaterThan(LANDMARKS.tree.z);
    expect(LANDMARKS.tree.z).toBeGreaterThan(LANDMARKS.lookout.z);
  });

  it("触发半径判定使用水平距离", () => {
    expect(isWithinLandmark("flower", { x: -8, z: 20 })).toBe(true);
    expect(isWithinLandmark("flower", { x: -8, z: 24 })).toBe(true);
    expect(isWithinLandmark("flower", { x: -8, z: 24.5 })).toBe(false);
    expect(distanceXZ({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo(5, 6);
  });
});

describe("故事节点空间参数（PRD 5.4）", () => {
  it("顺序为 flower → stream → tree", () => {
    expect([...STORY_NODE_ORDER]).toEqual(["flower", "stream", "tree"]);
    expect(STAR_SHARD_TOTAL).toBe(3);
  });

  it("每个节点引用地标，不重复写坐标", () => {
    for (const id of STORY_NODE_ORDER) {
      const spatial = STORY_NODE_SPATIAL[id];
      expect(spatial.id).toBe(id);
      expect(spatial.landmark).toBe(id);
      expect(LANDMARKS[spatial.landmark]).toBeDefined();
    }
  });

  it("交互半径与 PRD 一致（花坡 4m、溪流 4m、花树 5m）", () => {
    expect(STORY_NODE_SPATIAL.flower.interactionRadius).toBe(4);
    expect(STORY_NODE_SPATIAL.stream.interactionRadius).toBe(4);
    expect(STORY_NODE_SPATIAL.tree.interactionRadius).toBe(5);
  });

  it("染色半径落在 PRD 区间内（花坡 4～6m、花树 10～14m）", () => {
    expect(STORY_NODE_SPATIAL.flower.bloomRadius).toBeGreaterThanOrEqual(4);
    expect(STORY_NODE_SPATIAL.flower.bloomRadius).toBeLessThanOrEqual(6);
    expect(STORY_NODE_SPATIAL.tree.bloomRadius).toBeGreaterThanOrEqual(10);
    expect(STORY_NODE_SPATIAL.tree.bloomRadius).toBeLessThanOrEqual(14);
  });
});

describe("溪流基线", () => {
  it("Z = 8 附近横跨 X 轴，踏石 3～5 块", () => {
    expect(STREAM.centerZ).toBe(8);
    expect(STREAM.steppingStoneCount).toBeGreaterThanOrEqual(3);
    expect(STREAM.steppingStoneCount).toBeLessThanOrEqual(5);
    expect(STREAM.widthMeters).toBeGreaterThan(0);
  });
});
