/**
 * 世界坐标染色遮罩（A1 核心，PRD 8.1 / 9.1）。
 *
 * 行为要点：
 * - 512² RGBA：R = 永久显色，G = 短暂扩散脉冲。
 * - 世界 XZ → UV 映射由 maskMapping.ts 唯一定义，材质侧复用同一规则。
 * - 玩家笔刷按**位移步进**补笔（默认 0.3m），不是每帧无条件重绘。
 * - 纹理上传有脏标记 + 30Hz 上限，`needsUpdate` 只在真正变化后设置。
 * - 故事 bloom 在 duration 内扩张，最终结果写回永久 R 通道。
 * - reset 立即清空并上传，不等下一帧。
 */
import { Vector2 } from "three";
import type { Texture, Vector3 } from "three";
import type { ColorRevealMask as ColorRevealMaskContract, WorldBounds } from "../core/contracts";
import { createCanvasMaskSurface, createMaskTexture, type MaskSurface } from "./MaskSurface";
import {
  clamp01,
  isInsideMaskBounds,
  uvToMaskPixel,
  worldRadiusToMaskPixels,
  worldToMaskUv,
} from "./maskMapping";

export const DEFAULT_MASK_RESOLUTION = 512;
/** 玩家笔刷半径 1.4～1.8m 的中间值（PRD 9.1）。 */
export const DEFAULT_BRUSH_RADIUS = 1.6;
/** 移动超过 0.25～0.35m 再补笔（PRD 9.1）。 */
export const DEFAULT_STAMP_STEP_METERS = 0.3;
/** 遮罩更新上限 24～30Hz（PRD 9.1）。 */
export const DEFAULT_FLUSH_HZ = 30;
/** 故事扩散默认时长 0.8～1.5s（PRD 9.1）。 */
export const DEFAULT_BLOOM_SECONDS = 1.1;

export interface ColorRevealMaskOptions {
  readonly bounds: WorldBounds;
  readonly resolution?: number;
  readonly brushRadius?: number;
  readonly stampStepMeters?: number;
  readonly flushHz?: number;
  readonly surface?: MaskSurface;
}

export interface RevealMaskDebugInfo {
  readonly stampCount: number;
  readonly flushCount: number;
  readonly activeBlooms: number;
  readonly brushRadius: number;
  readonly playerUv: { readonly u: number; readonly v: number } | null;
}

interface BloomState {
  readonly center: Vector3;
  readonly targetRadius: number;
  readonly duration: number;
  elapsed: number;
  paintedRadius: number;
}

export class ColorRevealMask implements ColorRevealMaskContract {
  readonly texture: Texture;
  readonly surface: MaskSurface;
  readonly brushRadius: number;

  private readonly bounds: WorldBounds;
  private readonly resolution: number;
  private readonly stampStepMeters: number;
  private readonly flushInterval: number;
  private readonly blooms: BloomState[] = [];
  private readonly lastStampPosition = new Vector2(Number.NaN, Number.NaN);

  private accumulator = 0;
  private dirty = false;
  private stampCount = 0;
  private flushCount = 0;
  private lastUv: { u: number; v: number } | null = null;

  constructor(options: ColorRevealMaskOptions) {
    this.bounds = options.bounds;
    this.resolution = options.resolution ?? DEFAULT_MASK_RESOLUTION;
    this.brushRadius = options.brushRadius ?? DEFAULT_BRUSH_RADIUS;
    this.stampStepMeters = options.stampStepMeters ?? DEFAULT_STAMP_STEP_METERS;
    const flushHz = options.flushHz ?? DEFAULT_FLUSH_HZ;
    this.flushInterval = 1 / Math.max(1, flushHz);
    this.surface = options.surface ?? createCanvasMaskSurface(this.resolution);
    this.texture = createMaskTexture(this.surface);
  }

  /** 每帧调用：推进玩家笔刷 + bloom 动画 + 按频率上限上传纹理。 */
  update(deltaSeconds: number, playerPosition: Vector3): void {
    this.advance(deltaSeconds);
    this.updatePlayerBrush(playerPosition);
    this.flushIfDue();
  }

  /** 没有玩家来源时（例如 A2 尚未集成）仍要推进 bloom 与上传。 */
  advance(deltaSeconds: number): void {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.accumulator += dt;
    this.advanceBlooms(dt);
    this.flushIfDue();
  }

  /** 永久写一笔（世界坐标，米）。 */
  stamp(worldPosition: Vector3, radius: number, strength: number = 1): void {
    if (this.paintReveal(worldPosition, radius, strength)) {
      this.lastStampPosition.set(worldPosition.x, worldPosition.z);
      this.lastUv = worldToMaskUv(worldPosition.x, worldPosition.z, this.bounds);
    }
  }

  /** 故事节点大范围扩散：duration 内扩张，结束时写满永久遮罩。 */
  bloom(worldPosition: Vector3, radius: number, duration: number = DEFAULT_BLOOM_SECONDS): void {
    if (!Number.isFinite(radius) || radius <= 0) return;
    this.blooms.push({
      center: worldPosition.clone(),
      targetRadius: radius,
      duration: Math.min(Math.max(duration, 0.2), 3),
      elapsed: 0,
      paintedRadius: 0,
    });
    this.dirty = true;
  }

  reset(): void {
    this.surface.clear();
    this.blooms.length = 0;
    this.lastStampPosition.set(Number.NaN, Number.NaN);
    this.lastUv = null;
    this.stampCount = 0;
    this.flushCount = 0;
    this.accumulator = 0;
    this.surface.composite();
    this.texture.needsUpdate = true;
    this.dirty = false;
  }

  dispose(): void {
    this.blooms.length = 0;
    this.texture.dispose();
    this.surface.dispose();
  }

  getDebugInfo(): RevealMaskDebugInfo {
    return {
      stampCount: this.stampCount,
      flushCount: this.flushCount,
      activeBlooms: this.blooms.length,
      brushRadius: this.brushRadius,
      playerUv: this.lastUv ? { u: this.lastUv.u, v: this.lastUv.v } : null,
    };
  }

  private updatePlayerBrush(playerPosition: Vector3): void {
    if (!Number.isFinite(playerPosition.x) || !Number.isFinite(playerPosition.z)) return;

    if (Number.isNaN(this.lastStampPosition.x)) {
      // 首帧（或 reset 后）：在当前位置落一笔，玩家一进场脚下就有颜色
      this.stamp(playerPosition, this.brushRadius, 1);
      return;
    }

    const dx = playerPosition.x - this.lastStampPosition.x;
    const dz = playerPosition.z - this.lastStampPosition.y;
    if (Math.hypot(dx, dz) >= this.stampStepMeters) {
      this.stamp(playerPosition, this.brushRadius, 1);
    }
  }

  private advanceBlooms(deltaSeconds: number): void {
    if (this.blooms.length === 0) return;

    for (const bloom of this.blooms) {
      bloom.elapsed += deltaSeconds;
      const t = Math.min(1, bloom.elapsed / bloom.duration);
      // ease-out cubic：先快后慢，像纸吸色
      const eased = 1 - Math.pow(1 - t, 3);
      const radius = bloom.targetRadius * eased;
      if (radius - bloom.paintedRadius >= 0.2 || t >= 1) {
        this.paintReveal(bloom.center, Math.max(radius, 0.05), 1);
        bloom.paintedRadius = radius;
      }
      this.dirty = true;
    }

    for (let index = this.blooms.length - 1; index >= 0; index -= 1) {
      const bloom = this.blooms[index];
      if (bloom && bloom.elapsed >= bloom.duration) this.blooms.splice(index, 1);
    }
  }

  private flushIfDue(): void {
    if (!this.dirty) return;
    if (this.accumulator < this.flushInterval) return;

    if (this.blooms.length > 0) {
      // pulse 层每帧重算，但只在 flush 时做，保证绘制开销同样受 30Hz 限制
      this.surface.clearLayer("pulse");
      for (const bloom of this.blooms) {
        const t = Math.min(1, bloom.elapsed / bloom.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const strength = clamp01(1 - t) * 0.85;
        if (strength > 0.02) {
          this.paintPulse(bloom.center, Math.max(bloom.targetRadius * eased, 0.05), strength);
        }
      }
    }

    this.surface.composite();
    this.texture.needsUpdate = true;
    this.dirty = false;
    this.accumulator = 0;
    this.flushCount += 1;
  }

  private paintReveal(worldPosition: Vector3, radius: number, strength: number): boolean {
    if (!Number.isFinite(radius) || radius <= 0) return false;
    if (!isInsideMaskBounds(worldPosition.x, worldPosition.z, this.bounds, radius)) return false;

    const uv = worldToMaskUv(worldPosition.x, worldPosition.z, this.bounds);
    const pixel = uvToMaskPixel(uv.u, uv.v, this.resolution);
    const radiusPx = Math.max(1, worldRadiusToMaskPixels(radius, this.bounds, this.resolution));
    this.surface.drawBrush(pixel, radiusPx, clamp01(strength), "reveal");
    this.stampCount += 1;
    this.dirty = true;
    return true;
  }

  private paintPulse(worldPosition: Vector3, radius: number, strength: number): void {
    const uv = worldToMaskUv(worldPosition.x, worldPosition.z, this.bounds);
    const pixel = uvToMaskPixel(uv.u, uv.v, this.resolution);
    const radiusPx = Math.max(1, worldRadiusToMaskPixels(radius, this.bounds, this.resolution));
    this.surface.drawBrush(pixel, radiusPx, clamp01(strength), "pulse");
  }
}
