/**
 * 世界坐标 ↔ 遮罩坐标映射（A1）。
 *
 * 唯一映射规则（所有材质与 CPU 绘制必须共用，AC-05 的前提）：
 *   u = (x - minX) / (maxX - minX)   → 0 在 -48，1 在 +48
 *   v = (z - minZ) / (maxZ - minZ)   → 0 在 -48，1 在 +48
 * 遮罩纹理 `flipY = false`，因此 v 与 canvas 行号同向（v=0 是第 0 行），
 * 不存在“图像上下翻转”的隐式约定。
 */
import type { WorldBounds } from "../core/contracts";

export interface UvPoint {
  readonly u: number;
  readonly v: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface PlanarPoint {
  readonly x: number;
  readonly z: number;
}

export interface BoundsSize {
  readonly width: number;
  readonly height: number;
}

export function worldBoundsSize(bounds: WorldBounds): BoundsSize {
  return { width: bounds.maxX - bounds.minX, height: bounds.maxZ - bounds.minZ };
}

/** 世界 XZ → 遮罩 UV（不做 clamp，越界值保持 <0 / >1，便于调用方判断）。 */
export function worldToMaskUv(x: number, z: number, bounds: WorldBounds): UvPoint {
  const { width, height } = worldBoundsSize(bounds);
  if (width <= 0 || height <= 0) return { u: 0, v: 0 };
  return { u: (x - bounds.minX) / width, v: (z - bounds.minZ) / height };
}

/** UV → 遮罩像素索引，夹在 [0, resolution-1]。 */
export function uvToMaskPixel(u: number, v: number, resolution: number): PixelPoint {
  return {
    x: clampIndex(Math.floor(u * resolution), resolution),
    y: clampIndex(Math.floor(v * resolution), resolution),
  };
}

/** 世界 XZ → 遮罩像素索引。 */
export function worldToMaskPixel(
  x: number,
  z: number,
  bounds: WorldBounds,
  resolution: number,
): PixelPoint {
  const uv = worldToMaskUv(x, z, bounds);
  return uvToMaskPixel(uv.u, uv.v, resolution);
}

/** 像素中心反算世界 XZ（用于调试视图与往返测试）。 */
export function maskPixelToWorldCenter(
  px: number,
  py: number,
  bounds: WorldBounds,
  resolution: number,
): PlanarPoint {
  const { width, height } = worldBoundsSize(bounds);
  const safeResolution = Math.max(1, resolution);
  return {
    x: bounds.minX + ((px + 0.5) / safeResolution) * width,
    z: bounds.minZ + ((py + 0.5) / safeResolution) * height,
  };
}

/** UV 反算世界 XZ。 */
export function maskUvToWorld(u: number, v: number, bounds: WorldBounds): PlanarPoint {
  const { width, height } = worldBoundsSize(bounds);
  return { x: bounds.minX + u * width, z: bounds.minZ + v * height };
}

/** 世界半径（米）→ 遮罩像素半径。地图为正方形时 X/Z 同比例。 */
export function worldRadiusToMaskPixels(
  radiusMeters: number,
  bounds: WorldBounds,
  resolution: number,
): number {
  const { width } = worldBoundsSize(bounds);
  if (width <= 0) return 0;
  return (radiusMeters / width) * resolution;
}

/** 像素半径 → 世界半径（米）。 */
export function maskPixelsToWorldRadius(
  radiusPixels: number,
  bounds: WorldBounds,
  resolution: number,
): number {
  const { width } = worldBoundsSize(bounds);
  if (resolution <= 0) return 0;
  return (radiusPixels / resolution) * width;
}

/**
 * 是否落在遮罩范围内（可带 margin）。
 * margin 用世界米，用于“笔刷边缘仍可能压到地图内”的判断。
 */
export function isInsideMaskBounds(
  x: number,
  z: number,
  bounds: WorldBounds,
  marginMeters: number = 0,
): boolean {
  return (
    x >= bounds.minX - marginMeters &&
    x <= bounds.maxX + marginMeters &&
    z >= bounds.minZ - marginMeters &&
    z <= bounds.maxZ + marginMeters
  );
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function clampIndex(value: number, resolution: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(0, resolution - 1));
}
