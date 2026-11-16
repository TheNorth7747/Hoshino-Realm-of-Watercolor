import { describe, expect, it } from "vitest";
import type { WorldBounds } from "../../../src/core/contracts";
import {
  isInsideMaskBounds,
  maskPixelToWorldCenter,
  maskPixelsToWorldRadius,
  maskUvToWorld,
  uvToMaskPixel,
  worldBoundsSize,
  worldRadiusToMaskPixels,
  worldToMaskPixel,
  worldToMaskUv,
} from "../../../src/rendering/maskMapping";

const BOUNDS: WorldBounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };
const RES = 512;

describe("世界 XZ → 遮罩 UV", () => {
  it("四个角与中心映射到 0/0.5/1", () => {
    expect(worldToMaskUv(-48, -48, BOUNDS)).toEqual({ u: 0, v: 0 });
    expect(worldToMaskUv(48, 48, BOUNDS)).toEqual({ u: 1, v: 1 });
    expect(worldToMaskUv(-48, 48, BOUNDS)).toEqual({ u: 0, v: 1 });
    expect(worldToMaskUv(48, -48, BOUNDS)).toEqual({ u: 1, v: 0 });
    expect(worldToMaskUv(0, 0, BOUNDS)).toEqual({ u: 0.5, v: 0.5 });
  });

  it("u 只随 X 变化，v 只随 Z 变化（不是屏幕坐标）", () => {
    const a = worldToMaskUv(-8, 20, BOUNDS);
    const b = worldToMaskUv(-8, -20, BOUNDS);
    const c = worldToMaskUv(8, 20, BOUNDS);
    expect(a.u).toBeCloseTo(b.u, 10);
    expect(a.v).not.toBeCloseTo(b.v, 3);
    expect(a.v).toBeCloseTo(c.v, 10);
    expect(a.u).not.toBeCloseTo(c.u, 3);
  });

  it("越界坐标保持越界值，不静默夹紧", () => {
    const out = worldToMaskUv(-100, 100, BOUNDS);
    expect(out.u).toBeLessThan(0);
    expect(out.v).toBeGreaterThan(1);
  });

  it("地图尺寸为 96×96", () => {
    expect(worldBoundsSize(BOUNDS)).toEqual({ width: 96, height: 96 });
  });
});

describe("UV / 像素映射", () => {
  it("边界像素夹在 [0, 511]", () => {
    expect(uvToMaskPixel(0, 0, RES)).toEqual({ x: 0, y: 0 });
    expect(uvToMaskPixel(1, 1, RES)).toEqual({ x: RES - 1, y: RES - 1 });
    expect(uvToMaskPixel(-0.2, 1.2, RES)).toEqual({ x: 0, y: RES - 1 });
  });

  it("世界坐标 → 像素：角点与中心", () => {
    expect(worldToMaskPixel(-48, -48, BOUNDS, RES)).toEqual({ x: 0, y: 0 });
    expect(worldToMaskPixel(48, 48, BOUNDS, RES)).toEqual({ x: RES - 1, y: RES - 1 });
    expect(worldToMaskPixel(0, 0, BOUNDS, RES)).toEqual({ x: 256, y: 256 });
  });

  it("像素中心 → 世界 → 像素 往返稳定", () => {
    for (const [px, py] of [
      [0, 0],
      [1, 1],
      [128, 384],
      [255, 256],
      [511, 511],
    ] as const) {
      const world = maskPixelToWorldCenter(px, py, BOUNDS, RES);
      const back = worldToMaskPixel(world.x, world.z, BOUNDS, RES);
      expect(back).toEqual({ x: px, y: py });
    }
  });

  it("UV → 世界与像素中心一致", () => {
    const world = maskUvToWorld(0.5, 0.25, BOUNDS);
    expect(world.x).toBeCloseTo(0, 10);
    expect(world.z).toBeCloseTo(-24, 10);
  });
});

describe("半径换算", () => {
  it("1.6m 笔刷在 512 遮罩上是 8.53px", () => {
    expect(worldRadiusToMaskPixels(1.6, BOUNDS, RES)).toBeCloseTo((1.6 / 96) * 512, 6);
  });

  it("像素半径能换回世界半径", () => {
    const px = worldRadiusToMaskPixels(12, BOUNDS, RES);
    expect(maskPixelsToWorldRadius(px, BOUNDS, RES)).toBeCloseTo(12, 6);
  });
});

describe("范围判定", () => {
  it("边界内为 true，越界为 false", () => {
    expect(isInsideMaskBounds(0, 0, BOUNDS)).toBe(true);
    expect(isInsideMaskBounds(-48, 48, BOUNDS)).toBe(true);
    expect(isInsideMaskBounds(49, 0, BOUNDS)).toBe(false);
  });

  it("margin 让贴边的笔刷仍能落笔", () => {
    expect(isInsideMaskBounds(49, 0, BOUNDS, 1.6)).toBe(true);
    expect(isInsideMaskBounds(50, 0, BOUNDS, 1.6)).toBe(false);
  });
});
