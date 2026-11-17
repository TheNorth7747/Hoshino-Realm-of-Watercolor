import { describe, expect, it } from "vitest";
import { LANDMARKS, STREAM, WORLD_BOUNDS } from "../../../src/config/world";
import {
  STREAM_WATER_LEVEL,
  sampleTerrainHeight,
  steppingStonePositions,
} from "../../../src/world/terrainHeight";

describe("地形高度采样 · 基础契约", () => {
  it("界内与界外（镜头跟随范围）都返回有限数值", () => {
    const samples: Array<[number, number]> = [
      [0, 0],
      [0, 32],
      [-8, 20],
      [0, -22],
      [0, -36],
      [48, 48],
      [-48, 48],
      [62, -62], // 镜头在边界玩家身后 14m 的极限位置
      [-70, 90],
      [1e4, -1e4],
    ];
    for (const [x, z] of samples) {
      const height = sampleTerrainHeight(x, z);
      expect(Number.isFinite(height)).toBe(true);
    }
  });

  it("确定性：同一坐标重复采样结果一致", () => {
    expect(sampleTerrainHeight(3.7, -12.3)).toBe(sampleTerrainHeight(3.7, -12.3));
  });
});

describe("地形高度采样 · 坡度可通行（PRD 9.4 缓起伏）", () => {
  it("全图 1m 网格的每米高差不超过 0.6m（约 31°，实际远低于此）", () => {
    let maxSlope = 0;
    for (let x = -47; x <= 47; x += 1) {
      for (let z = -47; z <= 47; z += 1) {
        const h = sampleTerrainHeight(x, z);
        const hx = sampleTerrainHeight(x + 1, z);
        const hz = sampleTerrainHeight(x, z + 1);
        maxSlope = Math.max(maxSlope, Math.abs(hx - h), Math.abs(hz - h));
        expect(Number.isFinite(h)).toBe(true);
      }
    }
    expect(maxSlope).toBeLessThan(0.6);
  });
});

describe("地形高度采样 · 地标特征", () => {
  it("蓝花坡隆起：花丛中心高于周边基底", () => {
    const { x, z } = LANDMARKS.flower;
    const center = sampleTerrainHeight(x, z);
    const outside = sampleTerrainHeight(x + 20, z + 20);
    expect(center - outside).toBeGreaterThan(0.5);
  });

  it("瞭望点缓台：结局回望点高于周边", () => {
    const { x, z } = LANDMARKS.lookout;
    const center = sampleTerrainHeight(x, z);
    const outside = sampleTerrainHeight(x + 18, z + 18);
    expect(center - outside).toBeGreaterThan(0.4);
  });

  it("出生草地平缓：出生点高度接近水平面（|h| < 0.6）", () => {
    const spawn = LANDMARKS.spawn;
    expect(Math.abs(sampleTerrainHeight(spawn.x, spawn.z))).toBeLessThan(0.6);
  });

  it("花树位置在界内且高度有限", () => {
    const tree = LANDMARKS.tree;
    expect(Number.isFinite(sampleTerrainHeight(tree.x, tree.z))).toBe(true);
    expect(tree.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
  });
});

describe("地形高度采样 · 溪流与踏石（PRD 5.3，无软锁）", () => {
  it("河槽中心低于水面，水面低于两岸（全 X 跨度）", () => {
    const bedCenter = sampleTerrainHeight(0, STREAM.centerZ);
    expect(bedCenter).toBeLessThan(STREAM_WATER_LEVEL);

    // 沿整条 X 轴抽查两岸（水面边缘 ±2m 之外）——水面永不悬空。
    for (let x = -48; x <= 48; x += 4) {
      const bank = sampleTerrainHeight(x, STREAM.centerZ + STREAM.widthMeters / 2 + 0.4);
      expect(bank).toBeGreaterThan(STREAM_WATER_LEVEL);
    }
  });

  it("河槽可步行通过：中心断面的坡度平缓", () => {
    let maxSlope = 0;
    for (let z = STREAM.centerZ - 4; z <= STREAM.centerZ + 4; z += 0.25) {
      const h = sampleTerrainHeight(0, z);
      const hNext = sampleTerrainHeight(0, z + 0.25);
      maxSlope = Math.max(maxSlope, Math.abs(hNext - h));
    }
    expect(maxSlope).toBeLessThan(0.6);
  });

  it("踏石位置由 config 数量与间距推导，且顶面高于水面", () => {
    const stones = steppingStonePositions();
    expect(stones.length).toBe(STREAM.steppingStoneCount);

    // 对称跨在主路线 x=0 上，间距 = config.steppingStoneSpacing
    for (let i = 1; i < stones.length; i += 1) {
      const prev = stones[i - 1];
      const curr = stones[i];
      if (!prev || !curr) continue;
      expect(curr.x - prev.x).toBeCloseTo(STREAM.steppingStoneSpacing, 6);
      expect(curr.z).toBe(STREAM.centerZ);
    }
    // x=0 附近有踏石覆盖（主路线过溪点）
    const nearest = Math.min(...stones.map((s) => Math.abs(s.x)));
    expect(nearest).toBeLessThanOrEqual(STREAM.steppingStoneSpacing / 2);

    for (const stone of stones) {
      const top = sampleTerrainHeight(stone.x, stone.z);
      expect(top).toBeGreaterThan(STREAM_WATER_LEVEL);
    }
  });

  it("河槽混合区外混回基底地形（花树不在水槽断面上）", () => {
    const tree = LANDMARKS.tree;
    const nearTree = sampleTerrainHeight(tree.x, tree.z);
    // 花树距离溪流 30m，不受断面影响；高度应高于水面
    expect(nearTree).toBeGreaterThan(STREAM_WATER_LEVEL);
  });
});
