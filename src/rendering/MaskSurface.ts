/**
 * 遮罩绘制表面（A1）。
 *
 * 为什么要拆出接口：`ColorRevealMask` 的节流、笔刷步进、扩散动画都是纯策略，
 * 应当能在 Node（无 DOM）里单测；canvas 绘制则单独实现，浏览器里跑。
 *
 * 通道约定（PRD 9.1）：
 * - R：永久显色（0 = 线稿，255 = 完全水彩）
 * - G：短暂扩散脉冲（bloom 期间出现，之后衰减为 0）
 * - B：未使用
 * 三层 canvas：reveal 层（黑底 + 白笔刷）、pulse 层（黑底 + 绿笔刷）、合成输出层。
 * 关键点：所有绘制都用**不透明颜色 + 通道差异**，而不是 alpha 渐变——
 * 否则 canvas 的预乘 alpha 会在上传纹理时把软边压成硬边。
 */
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, NoColorSpace } from "three";
import type { Texture } from "three";
import { AppError } from "../core/errors";
import { clamp01, type PixelPoint } from "./maskMapping";

export type MaskLayer = "reveal" | "pulse";

export interface MaskSurface {
  /** 合成输出 canvas，供 CanvasTexture 与调试缩略图使用。 */
  readonly canvas: HTMLCanvasElement;
  readonly resolution: number;
  clear(): void;
  clearLayer(layer: MaskLayer): void;
  /** center 为像素坐标；radiusPx 为像素半径；strength ∈ [0,1]。 */
  drawBrush(center: PixelPoint, radiusPx: number, strength: number, layer: MaskLayer): void;
  /** reveal 层 + pulse 层 → 输出层。 */
  composite(): void;
  /** 单点显色值 0..1（R 通道），越界返回 0。 */
  readRevealAt(u: number, v: number): number;
  /** 显色面积占比 0..1（在 64×64 探针上统计，避免全画布回读造成 GPU stall）。 */
  readRevealCoverage(sampleStep?: number): number;
  dispose(): void;
}

const BRUSH_SIZE = 128;

/** 值噪声：稳定、无依赖，用于笔刷边缘扰动。 */
function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const hash = (ix: number, iy: number): number => {
    const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * (3 - 2 * t);
}

interface BrushSet {
  readonly reveal: HTMLCanvasElement;
  readonly pulse: HTMLCanvasElement;
}

function createBrushSet(): BrushSet {
  const reveal = document.createElement("canvas");
  const pulse = document.createElement("canvas");
  reveal.width = BRUSH_SIZE;
  reveal.height = BRUSH_SIZE;
  pulse.width = BRUSH_SIZE;
  pulse.height = BRUSH_SIZE;

  const revealCtx = reveal.getContext("2d");
  const pulseCtx = pulse.getContext("2d");
  if (!revealCtx || !pulseCtx) {
    throw new AppError("renderer-failed", "无法创建遮罩笔刷的 2D 上下文。");
  }

  const revealImage = revealCtx.createImageData(BRUSH_SIZE, BRUSH_SIZE);
  const pulseImage = pulseCtx.createImageData(BRUSH_SIZE, BRUSH_SIZE);
  const center = BRUSH_SIZE / 2;
  const radius = BRUSH_SIZE / 2 - 1;

  for (let y = 0; y < BRUSH_SIZE; y += 1) {
    for (let x = 0; x < BRUSH_SIZE; x += 1) {
      const dx = (x - center) / radius;
      const dy = (y - center) / radius;
      const distance = Math.hypot(dx, dy);
      // 边缘噪声扰动：让吸色边界不是完美圆形
      const jitter = (valueNoise(x * 0.09, y * 0.09) - 0.5) * 0.3;
      const warped = distance + jitter;
      const falloff = 1 - smoothstep(0.45, 1.0, warped);
      const value = Math.round(clamp01(falloff) * 255);
      const index = (y * BRUSH_SIZE + x) * 4;
      // reveal：灰阶（R 通道承载强度）
      revealImage.data[index] = value;
      revealImage.data[index + 1] = value;
      revealImage.data[index + 2] = value;
      revealImage.data[index + 3] = 255;
      // pulse：只写 G，避免污染 R
      pulseImage.data[index] = 0;
      pulseImage.data[index + 1] = value;
      pulseImage.data[index + 2] = 0;
      pulseImage.data[index + 3] = 255;
    }
  }

  revealCtx.putImageData(revealImage, 0, 0);
  pulseCtx.putImageData(pulseImage, 0, 0);
  return { reveal, pulse };
}

function createLayer(resolution: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new AppError("renderer-failed", "无法创建遮罩绘制层。");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, resolution, resolution);
  return { canvas, ctx };
}

export function createCanvasMaskSurface(resolution: number): MaskSurface {
  const size = Math.max(16, Math.floor(resolution));
  const revealLayer = createLayer(size);
  const pulseLayer = createLayer(size);
  const output = createLayer(size);
  const brushes = createBrushSet();
  // 覆盖率探针：先把 512² 缩到 64²，再回读，避免每次 getImageData(0,0,512,512)
  const PROBE_SIZE = 64;
  const probe = document.createElement("canvas");
  probe.width = PROBE_SIZE;
  probe.height = PROBE_SIZE;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });
  let disposed = false;

  const surface: MaskSurface = {
    canvas: output.canvas,
    resolution: size,

    clear(): void {
      revealLayer.ctx.fillStyle = "#000";
      revealLayer.ctx.fillRect(0, 0, size, size);
      pulseLayer.ctx.fillStyle = "#000";
      pulseLayer.ctx.fillRect(0, 0, size, size);
      output.ctx.fillStyle = "#000";
      output.ctx.fillRect(0, 0, size, size);
    },

    clearLayer(layer: MaskLayer): void {
      const target = layer === "reveal" ? revealLayer : pulseLayer;
      target.ctx.fillStyle = "#000";
      target.ctx.fillRect(0, 0, size, size);
    },

    drawBrush(center: PixelPoint, radiusPx: number, strength: number, layer: MaskLayer): void {
      if (disposed || radiusPx <= 0) return;
      const target = layer === "reveal" ? revealLayer : pulseLayer;
      const brush = layer === "reveal" ? brushes.reveal : brushes.pulse;
      target.ctx.globalCompositeOperation = layer === "reveal" ? "lighten" : "lighter";
      target.ctx.globalAlpha = clamp01(strength);
      target.ctx.drawImage(
        brush,
        center.x - radiusPx,
        center.y - radiusPx,
        radiusPx * 2,
        radiusPx * 2,
      );
      target.ctx.globalAlpha = 1;
      target.ctx.globalCompositeOperation = "source-over";
    },

    composite(): void {
      if (disposed) return;
      const ctx = output.ctx;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(revealLayer.canvas, 0, 0);
      // pulse 的 R/B 为 0，用 lighter 只叠加到 G 通道
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(pulseLayer.canvas, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    },

    readRevealAt(u: number, v: number): number {
      if (disposed) return 0;
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
      const px = Math.min(size - 1, Math.max(0, Math.floor(u * size)));
      const py = Math.min(size - 1, Math.max(0, Math.floor(v * size)));
      const data = output.ctx.getImageData(px, py, 1, 1).data;
      return (data[0] ?? 0) / 255;
    },

    readRevealCoverage(sampleStep: number = 1): number {
      if (disposed || !probeCtx) return 0;
      const step = Math.max(1, Math.floor(sampleStep));
      probeCtx.drawImage(output.canvas, 0, 0, PROBE_SIZE, PROBE_SIZE);
      const data = probeCtx.getImageData(0, 0, PROBE_SIZE, PROBE_SIZE).data;
      let total = 0;
      let lit = 0;
      for (let y = 0; y < PROBE_SIZE; y += step) {
        for (let x = 0; x < PROBE_SIZE; x += step) {
          const index = (y * PROBE_SIZE + x) * 4;
          total += 1;
          if ((data[index] ?? 0) > 96) lit += 1;
        }
      }
      return total === 0 ? 0 : lit / total;
    },

    dispose(): void {
      disposed = true;
      for (const layer of [revealLayer, pulseLayer, output]) {
        layer.canvas.width = 1;
        layer.canvas.height = 1;
      }
    },
  };

  return surface;
}

/** 遮罩纹理：线性数据、不翻转、不生成 mipmap。 */
export function createMaskTexture(surface: MaskSurface): Texture {
  const texture = new CanvasTexture(surface.canvas);
  texture.flipY = false;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.name = "color-reveal-mask";
  return texture;
}
