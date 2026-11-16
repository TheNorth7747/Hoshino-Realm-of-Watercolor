import type { PixelPoint } from "../../../src/rendering/maskMapping";
import type { MaskLayer, MaskSurface } from "../../../src/rendering/MaskSurface";

export interface BrushCall {
  readonly center: PixelPoint;
  readonly radiusPx: number;
  readonly strength: number;
  readonly layer: MaskLayer;
}

export interface FakeSurface extends MaskSurface {
  readonly calls: {
    clear: number;
    composite: number;
    layerClear: number;
    brushes: BrushCall[];
  };
}

/**
 * 记录型遮罩表面：在 Node 里替掉 canvas，用来测节流/步进/扩散这些纯策略。
 * canvas 只作为 CanvasTexture 的 image 占位，three 构造纹理时不会碰 DOM。
 */
export function createFakeSurface(resolution: number = 512): FakeSurface {
  const calls = {
    clear: 0,
    composite: 0,
    layerClear: 0,
    brushes: [] as BrushCall[],
  };

  const surface: FakeSurface = {
    canvas: {} as HTMLCanvasElement,
    resolution,
    clear(): void {
      calls.clear += 1;
    },
    clearLayer(): void {
      calls.layerClear += 1;
    },
    drawBrush(center: PixelPoint, radiusPx: number, strength: number, layer: MaskLayer): void {
      calls.brushes.push({ center, radiusPx, strength, layer });
    },
    composite(): void {
      calls.composite += 1;
    },
    readRevealAt(): number {
      return 0;
    },
    readRevealCoverage(): number {
      return 0;
    },
    dispose(): void {
      // no-op
    },
    calls,
  };

  return surface;
}
