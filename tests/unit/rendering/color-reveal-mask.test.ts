import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type {
  ColorRevealMask as ColorRevealMaskContract,
  WorldBounds,
} from "../../../src/core/contracts";
import {
  ColorRevealMask,
  DEFAULT_BRUSH_RADIUS,
  DEFAULT_FLUSH_HZ,
  DEFAULT_STAMP_STEP_METERS,
} from "../../../src/rendering/ColorRevealMask";
import { worldRadiusToMaskPixels } from "../../../src/rendering/maskMapping";
import { createFakeSurface, type FakeSurface } from "./fake-surface";

const BOUNDS: WorldBounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };
const RES = 512;
const FRAME = 1 / 60;

function setup(options: { brushRadius?: number; flushHz?: number } = {}): {
  mask: ColorRevealMask;
  surface: FakeSurface;
} {
  const surface = createFakeSurface(RES);
  const mask = new ColorRevealMask({
    bounds: BOUNDS,
    resolution: RES,
    surface,
    ...(options.brushRadius === undefined ? {} : { brushRadius: options.brushRadius }),
    ...(options.flushHz === undefined ? {} : { flushHz: options.flushHz }),
  });
  return { mask, surface };
}

function revealCalls(surface: FakeSurface) {
  return surface.calls.brushes.filter((call) => call.layer === "reveal");
}

describe("ColorRevealMask：契约与默认值", () => {
  it("满足 A0 的 ColorRevealMask 契约", () => {
    const { mask } = setup();
    const contract: ColorRevealMaskContract = mask;
    expect(typeof contract.update).toBe("function");
    expect(typeof contract.stamp).toBe("function");
    expect(typeof contract.reset).toBe("function");
    expect(typeof contract.dispose).toBe("function");
    expect(contract.texture).toBe(mask.texture);
  });

  it("默认参数落在 PRD 区间：笔刷 1.6m、步进 0.3m、30Hz", () => {
    const { mask } = setup();
    expect(DEFAULT_BRUSH_RADIUS).toBeGreaterThanOrEqual(1.4);
    expect(DEFAULT_BRUSH_RADIUS).toBeLessThanOrEqual(1.8);
    expect(DEFAULT_STAMP_STEP_METERS).toBeGreaterThanOrEqual(0.25);
    expect(DEFAULT_STAMP_STEP_METERS).toBeLessThanOrEqual(0.35);
    expect(DEFAULT_FLUSH_HZ).toBeGreaterThanOrEqual(24);
    expect(DEFAULT_FLUSH_HZ).toBeLessThanOrEqual(30);
    expect(mask.brushRadius).toBe(DEFAULT_BRUSH_RADIUS);
  });

  it("首帧在玩家位置落一笔（进场脚下就有颜色）", () => {
    const { mask, surface } = setup();
    mask.update(FRAME, new Vector3(0, 0, 32));

    const calls = revealCalls(surface);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.radiusPx).toBeCloseTo(worldRadiusToMaskPixels(1.6, BOUNDS, RES), 6);
    expect(calls[0]?.strength).toBe(1);
    // (0, 32) → u=0.5, v≈0.8333 → 像素 (256, 426)
    expect(calls[0]?.center.x).toBe(256);
    expect(calls[0]?.center.y).toBe(426);
  });
});

describe("ColorRevealMask：玩家笔刷按位移补笔", () => {
  it("原地不动不重复落笔", () => {
    const { mask, surface } = setup();
    const position = new Vector3(0, 0, 32);
    for (let i = 0; i < 30; i += 1) mask.update(FRAME, position);
    expect(revealCalls(surface)).toHaveLength(1);
  });

  it("移动不足 0.3m 不落笔，超过后落笔", () => {
    const { mask, surface } = setup();
    const position = new Vector3(0, 0, 32);
    mask.update(FRAME, position);

    position.z = 32 - 0.2;
    mask.update(FRAME, position);
    expect(revealCalls(surface)).toHaveLength(1);

    position.z = 32 - 0.31;
    mask.update(FRAME, position);
    expect(revealCalls(surface)).toHaveLength(2);
  });

  it("地图外的位置不落笔", () => {
    const { mask, surface } = setup();
    mask.update(FRAME, new Vector3(400, 0, 400));
    expect(revealCalls(surface)).toHaveLength(0);
    expect(mask.getDebugInfo().stampCount).toBe(0);
  });
});

describe("ColorRevealMask：脏更新与频率上限", () => {
  it("60 帧移动只上传约 2 次，而不是 60 次", () => {
    const { mask, surface } = setup();
    const position = new Vector3(-48, 0, 32);
    for (let i = 0; i < 60; i += 1) {
      position.x += 0.05;
      mask.update(FRAME, position);
    }
    // 30Hz 上限 → 1 秒内最多 30 次；这里只断言远小于帧数
    expect(surface.calls.composite).toBeGreaterThan(0);
    expect(surface.calls.composite).toBeLessThanOrEqual(DEFAULT_FLUSH_HZ);
    expect(surface.calls.composite).toBeLessThan(60);
    expect(revealCalls(surface).length).toBeGreaterThan(1);
  });

  it("没有位移时纹理版本号不再增长（不做无变化上传）", () => {
    const { mask } = setup();
    const position = new Vector3(0, 0, 32);
    mask.update(FRAME, position);
    mask.update(FRAME, position);

    const version = mask.texture.version;
    for (let i = 0; i < 30; i += 1) mask.update(FRAME, position);
    expect(mask.texture.version).toBe(version);
  });

  it("位移后纹理版本号增长", () => {
    const { mask } = setup();
    const position = new Vector3(0, 0, 32);
    mask.update(FRAME, position);
    const version = mask.texture.version;

    position.z -= 1;
    mask.update(FRAME, position);
    mask.update(FRAME, position);
    expect(mask.texture.version).toBeGreaterThan(version);
  });
});

describe("ColorRevealMask：故事扩散", () => {
  it("bloom 在 duration 内逐步扩张，最终覆盖目标半径", () => {
    const { mask, surface } = setup();
    const center = new Vector3(0, 0, 8);
    mask.bloom(center, 5, 1);

    const targetPx = worldRadiusToMaskPixels(5, BOUNDS, RES);
    let lastRadius = 0;
    for (let i = 0; i < 70; i += 1) {
      mask.advance(FRAME);
      const calls = revealCalls(surface);
      const last = calls[calls.length - 1];
      if (last) lastRadius = last.radiusPx;
    }

    expect(lastRadius).toBeCloseTo(targetPx, 4);
    expect(mask.getDebugInfo().activeBlooms).toBe(0);
  });

  it("扩散期间写入 pulse 层，结束后 pulse 不再更新", () => {
    const { mask, surface } = setup();
    mask.bloom(new Vector3(0, 0, 8), 5, 0.4);
    mask.advance(FRAME);
    mask.advance(FRAME);
    expect(surface.calls.layerClear).toBeGreaterThan(0);

    const pulseCalls = surface.calls.brushes.filter((call) => call.layer === "pulse");
    expect(pulseCalls.length).toBeGreaterThan(0);

    for (let i = 0; i < 40; i += 1) mask.advance(FRAME);
    expect(mask.getDebugInfo().activeBlooms).toBe(0);
  });
});

describe("ColorRevealMask：reset / dispose", () => {
  it("reset 清空并立即上传，计数归零", () => {
    const { mask, surface } = setup();
    const position = new Vector3(0, 0, 32);
    for (let i = 0; i < 10; i += 1) {
      position.z -= 0.5;
      mask.update(FRAME, position);
    }
    expect(mask.getDebugInfo().stampCount).toBeGreaterThan(0);

    const compositesBefore = surface.calls.composite;
    const versionBefore = mask.texture.version;
    mask.reset();

    expect(surface.calls.clear).toBe(1);
    expect(surface.calls.composite).toBe(compositesBefore + 1);
    expect(mask.texture.version).toBeGreaterThan(versionBefore);
    expect(mask.getDebugInfo()).toMatchObject({ stampCount: 0, flushCount: 0, activeBlooms: 0 });
  });

  it("reset 后首帧会在新位置重新落笔", () => {
    const { mask, surface } = setup();
    mask.update(FRAME, new Vector3(0, 0, 32));
    mask.reset();
    const before = revealCalls(surface).length;
    mask.update(FRAME, new Vector3(-8, 0, 20));
    expect(revealCalls(surface).length).toBe(before + 1);
  });

  it("dispose 释放纹理与表面", () => {
    const { mask, surface } = setup();
    let textureDisposed = false;
    mask.texture.addEventListener("dispose", () => {
      textureDisposed = true;
    });
    let surfaceDisposed = false;
    surface.dispose = (): void => {
      surfaceDisposed = true;
    };

    mask.dispose();
    expect(textureDisposed).toBe(true);
    expect(surfaceDisposed).toBe(true);
  });
});
