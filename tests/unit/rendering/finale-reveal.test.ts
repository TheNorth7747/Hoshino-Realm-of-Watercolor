import { describe, expect, it } from "vitest";
import type { WorldBounds } from "../../../src/core/contracts";
import { FINALE_REVEAL_SECONDS, FinaleReveal } from "../../../src/rendering/FinaleReveal";
import {
  WATERCOLOR_COLOR_INJECTION,
  WATERCOLOR_FRAGMENT_HEADER,
  createRevealUniforms,
  createWatercolorMaterial,
  getRevealUniforms,
} from "../../../src/rendering/WatercolorMaterial";
import { createMaskTexture } from "../../../src/rendering/MaskSurface";
import { isInsideMaskBounds, worldToMaskUv } from "../../../src/rendering/maskMapping";
import { createFakeSurface } from "./fake-surface";

const BOUNDS: WorldBounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };
const FRAME = 1 / 60;

function makeUniforms() {
  return createRevealUniforms(createMaskTexture(createFakeSurface(512)), BOUNDS);
}

describe("FinaleReveal：触发", () => {
  it("初始为 0，未触发时 update 不推进", () => {
    const finale = new FinaleReveal();
    expect(finale.value).toBe(0);
    expect(finale.isPlaying).toBe(false);
    for (let i = 0; i < 60; i += 1) finale.update(FRAME);
    expect(finale.value).toBe(0);
  });

  it("trigger 后开始播放并单调增长", () => {
    const finale = new FinaleReveal({ durationSeconds: 1 });
    finale.trigger();
    expect(finale.isPlaying).toBe(true);

    let previous = 0;
    for (let i = 0; i < 30; i += 1) {
      const value = finale.update(FRAME);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
    expect(finale.value).toBeGreaterThan(0.2);
    expect(finale.value).toBeLessThan(1);
  });

  it("幂等：播放中重复触发不重置进度", () => {
    const finale = new FinaleReveal({ durationSeconds: 1 });
    finale.trigger();
    for (let i = 0; i < 30; i += 1) finale.update(FRAME);
    const midway = finale.value;

    finale.trigger();
    expect(finale.value).toBe(midway);
  });

  it("幂等：完成后重复触发不回到 0", () => {
    const finale = new FinaleReveal({ durationSeconds: 0.5 });
    finale.trigger();
    for (let i = 0; i < 60; i += 1) finale.update(FRAME);
    expect(finale.value).toBe(1);
    expect(finale.isPlaying).toBe(false);

    finale.trigger();
    expect(finale.value).toBe(1);
    expect(finale.update(FRAME)).toBe(1);
  });
});

describe("FinaleReveal：渐进", () => {
  it("默认时长在 2～4 秒之间（与花树 bloom 同步但不抢戏）", () => {
    expect(FINALE_REVEAL_SECONDS).toBeGreaterThanOrEqual(2);
    expect(FINALE_REVEAL_SECONDS).toBeLessThanOrEqual(4);
  });

  it("duration 结束时恰好到 1，不早到也不越界", () => {
    const duration = 1.2;
    const finale = new FinaleReveal({ durationSeconds: duration });
    finale.trigger();

    // 半程：明显已经开始，但还没结束
    for (let i = 0; i < Math.round(duration * 30); i += 1) finale.update(FRAME);
    expect(finale.value).toBeGreaterThan(0.5);
    expect(finale.value).toBeLessThan(1);

    // 走满时长
    for (let i = 0; i < Math.round(duration * 30); i += 1) finale.update(FRAME);
    expect(finale.value).toBe(1);
    expect(finale.isPlaying).toBe(false);
  });

  it("ease-out：前段增速快于后段（不是线性也不是瞬间）", () => {
    const finale = new FinaleReveal({ durationSeconds: 1 });
    finale.trigger();
    for (let i = 0; i < 15; i += 1) finale.update(FRAME); // 前 1/4
    const quarter = finale.value;
    for (let i = 0; i < 15; i += 1) finale.update(FRAME); // 到 1/2
    const half = finale.value;

    expect(quarter).toBeGreaterThan(0.45); // 线性只有 0.25
    expect(half - quarter).toBeLessThan(quarter);
  });

  it("非法或负 delta 不推进", () => {
    const finale = new FinaleReveal({ durationSeconds: 1 });
    finale.trigger();
    finale.update(Number.NaN);
    finale.update(-1);
    expect(finale.value).toBe(0);
  });
});

describe("FinaleReveal：重置", () => {
  it("reset 归零并允许重新触发", () => {
    const finale = new FinaleReveal({ durationSeconds: 0.5 });
    finale.trigger();
    for (let i = 0; i < 60; i += 1) finale.update(FRAME);
    expect(finale.value).toBe(1);

    finale.reset();
    expect(finale.value).toBe(0);
    expect(finale.isPlaying).toBe(false);

    finale.trigger();
    finale.update(0.25);
    expect(finale.value).toBeGreaterThan(0);
  });

  it("播放中 reset 立刻停止", () => {
    const finale = new FinaleReveal({ durationSeconds: 1 });
    finale.trigger();
    finale.update(0.3);
    finale.reset();
    finale.update(FRAME);
    expect(finale.value).toBe(0);
  });
});

describe("边界外采样：远山落在遮罩之外", () => {
  // 远山环带半径 74～94（src/world/Terrain.ts），全部在 ±48 的可玩边界外
  const mountainSamples: ReadonlyArray<readonly [number, number]> = [
    [0, 80],
    [80, 0],
    [-74, 0],
    [0, -94],
  ];

  it("远山位置判定为界外", () => {
    for (const [x, z] of mountainSamples) {
      expect(isInsideMaskBounds(x, z, BOUNDS)).toBe(false);
    }
  });

  it("远山的遮罩 UV 越界（不能靠 clamp 采样，必须走 finale 项）", () => {
    for (const [x, z] of mountainSamples) {
      const uv = worldToMaskUv(x, z, BOUNDS);
      const outside = uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1;
      expect(outside).toBe(true);
    }
  });

  it("界内点不受影响（脚下染色与普通节点 bloom 仍走遮罩）", () => {
    for (const [x, z] of [
      [0, 32],
      [-8, 20],
      [0, 8],
      [0, -22],
      [47, -47],
    ] as const) {
      expect(isInsideMaskBounds(x, z, BOUNDS)).toBe(true);
      const uv = worldToMaskUv(x, z, BOUNDS);
      expect(uv.u).toBeGreaterThanOrEqual(0);
      expect(uv.u).toBeLessThanOrEqual(1);
      expect(uv.v).toBeGreaterThanOrEqual(0);
      expect(uv.v).toBeLessThanOrEqual(1);
    }
  });
});

describe("共享 uniforms 与 shader 注入", () => {
  it("uFinaleReveal 默认 0（开局远山保持线稿）", () => {
    const uniforms = makeUniforms();
    expect(uniforms.uFinaleReveal.value).toBe(0);
    expect(uniforms.uFinaleNoiseScale.value).toBeGreaterThan(0);
  });

  it("远山材质与地面共享同一份 uniforms，finale 一次更新两边都见效", () => {
    const uniforms = makeUniforms();
    const ground = createWatercolorMaterial({ color: 0x9ec98a, uniforms });
    const mountain = createWatercolorMaterial({ color: 0xa9b8c6, uniforms, flatShading: true });

    uniforms.uFinaleReveal.value = 0.8;
    expect(getRevealUniforms(ground)?.uFinaleReveal.value).toBe(0.8);
    expect(getRevealUniforms(mountain)?.uFinaleReveal.value).toBe(0.8);
    expect(getRevealUniforms(mountain)).toBe(uniforms);
  });

  it("shader 只在界外叠加 finale，界内仍走 wcReveal", () => {
    expect(WATERCOLOR_FRAGMENT_HEADER).toContain("uniform float uFinaleReveal;");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcDistant");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcFinale");
    // 界内 wcDistant = 0 → 叠加项为 0，脚下一笔都不会多
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcRevealTotal = wcReveal + wcFinale * wcDistant");
    // 远景仍用世界坐标采样噪声，不受屏幕位置影响
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcWorld * uFinaleNoiseScale");
    // 最终章远景叠暖光，让显色在雾里也能被看出来
    expect(WATERCOLOR_COLOR_INJECTION).toContain("uFinaleReveal * wcDistant * 0.1");
    // 远山本色与纸色接近：远景显色靠提饱和，而不是换色相
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcPaintDistant");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("uFinaleSaturation");
    // 提饱和只作用于「界外 × 显色程度」，界内仍是原色
    expect(WATERCOLOR_COLOR_INJECTION).toContain(
      "mix(wcPaint, wcPaintDistant, wcDistant * uFinaleReveal)",
    );
  });
});
