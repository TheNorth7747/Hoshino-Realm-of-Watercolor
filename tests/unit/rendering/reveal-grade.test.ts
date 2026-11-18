import { Color, Fog, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PlayerSource } from "../../../src/core/contracts";
import { WORLD_BOUNDS, spawnPosition } from "../../../src/config/world";
import { Atmosphere } from "../../../src/rendering/Atmosphere";
import {
  RevealSystem,
  V02_BRUSH_FORWARD_OFFSET,
  V02_BRUSH_RADIUS,
  V02_SPAWN_REVEAL_RADIUS,
} from "../../../src/rendering/RevealSystem";
import {
  WATERCOLOR_COLOR_INJECTION,
  WATERCOLOR_FRAGMENT_HEADER,
  createRevealUniforms,
} from "../../../src/rendering/WatercolorMaterial";
import { createMaskTexture } from "../../../src/rendering/MaskSurface";
import { worldRadiusToMaskPixels, worldToMaskUv } from "../../../src/rendering/maskMapping";
import { createFakeGameContext } from "../helpers/fake-game-context";
import { createFakeSurface } from "./fake-surface";

function createSystem(options: {
  readonly playerSource?: PlayerSource;
  readonly spawnRevealRadius?: number;
}): RevealSystem {
  return new RevealSystem({
    enableBench: false,
    enablePaperPass: false,
    enableSkyDome: false,
    maskSurface: createFakeSurface(512),
    ...(options.playerSource === undefined ? {} : { playerSource: options.playerSource }),
    ...(options.spawnRevealRadius === undefined
      ? {}
      : { spawnRevealRadius: options.spawnRevealRadius }),
  });
}

function fakePlayer(position: Vector3, headingRadians: number): PlayerSource {
  return {
    getPlayerSnapshot: () => ({ position, headingRadians, speed: 0, grounded: true }),
  };
}

describe("V0.2 参数预算（手册 1：开场 8～12m、笔刷 2.5～3.2m）", () => {
  it("开场预染色半径落在 8～12m", () => {
    expect(V02_SPAWN_REVEAL_RADIUS).toBeGreaterThanOrEqual(8);
    expect(V02_SPAWN_REVEAL_RADIUS).toBeLessThanOrEqual(12);
  });

  it("移动笔刷半径落在 2.5～3.2m", () => {
    expect(V02_BRUSH_RADIUS).toBeGreaterThanOrEqual(2.5);
    expect(V02_BRUSH_RADIUS).toBeLessThanOrEqual(3.2);
  });

  it("笔刷前移为正值且不超过 2m（避免颜色跑到角色前面太远）", () => {
    expect(V02_BRUSH_FORWARD_OFFSET).toBeGreaterThan(0);
    expect(V02_BRUSH_FORWARD_OFFSET).toBeLessThanOrEqual(2);
  });
});

describe("V0.2 开场预染色", () => {
  it("init 时在出生点落一笔 8～12m 的大半径印记", () => {
    const context = createFakeGameContext();
    const surface = createFakeSurface(512);
    const system = new RevealSystem({
      enableBench: false,
      enablePaperPass: false,
      enableSkyDome: false,
      maskSurface: surface,
    });
    system.init(context);

    expect(surface.calls.brushes.length).toBeGreaterThanOrEqual(1);
    const first = surface.calls.brushes[0]!;
    const expectedPx = worldRadiusToMaskPixels(V02_SPAWN_REVEAL_RADIUS, WORLD_BOUNDS, 512);
    // 半径按世界米换算成像素：10m / 96m × 512 ≈ 53px
    expect(first.radiusPx).toBeCloseTo(expectedPx, 0);
    expect(first.radiusPx).toBeGreaterThan(40);
    expect(first.layer).toBe("reveal");

    // 落点必须在出生点附近（像素坐标），而不是世界原点
    const spawnUv = worldToMaskUv(spawnPosition().x, spawnPosition().z, WORLD_BOUNDS);
    expect(Math.abs(first.center.x - spawnUv.u * 512)).toBeLessThan(6);
    expect(Math.abs(first.center.y - spawnUv.v * 512)).toBeLessThan(6);
    system.dispose();
  });

  it("预染色半径可配置为 0（关闭开场染色，用于对照）", () => {
    const context = createFakeGameContext();
    const surface = createFakeSurface(512);
    const system = new RevealSystem({
      enableBench: false,
      enablePaperPass: false,
      enableSkyDome: false,
      maskSurface: surface,
      spawnRevealRadius: 0,
    });
    system.init(context);
    const painted = surface.calls.brushes.filter((call) => call.radiusPx > 1);
    expect(painted.length).toBe(0);
    system.dispose();
  });

  it("reset 会先清空再重放同一笔开场印记", () => {
    const context = createFakeGameContext();
    const surface = createFakeSurface(512);
    const system = new RevealSystem({
      enableBench: false,
      enablePaperPass: false,
      enableSkyDome: false,
      maskSurface: surface,
    });
    system.init(context);

    const beforeReset = surface.calls.brushes.length;
    const clearsBefore = surface.calls.clear;
    context.events.emit("game:reset");

    expect(surface.calls.clear).toBeGreaterThan(clearsBefore);
    expect(surface.calls.brushes.length).toBe(beforeReset + 1);
    const replay = surface.calls.brushes.at(-1)!;
    const expectedPx = worldRadiusToMaskPixels(V02_SPAWN_REVEAL_RADIUS, WORLD_BOUNDS, 512);
    expect(replay.radiusPx).toBeCloseTo(expectedPx, 0);
    system.dispose();
  });
});

describe("V0.2 笔刷前移（前方先亮）", () => {
  it("朝向 -Z（heading=π）时落笔点比角色更靠前", () => {
    const context = createFakeGameContext();
    const spawn = spawnPosition();
    const player = fakePlayer(new Vector3(spawn.x, spawn.y, spawn.z), Math.PI);
    const system = createSystem({ playerSource: player, spawnRevealRadius: 0 });
    system.init(context);
    system.update(0.016, context);

    const info = system.colorRevealMask!.getDebugInfo();
    const spawnUv = worldToMaskUv(spawn.x, spawn.z, WORLD_BOUNDS);
    expect(info.playerUv).not.toBeNull();
    // v 随 z 增大而增大：朝 -Z 前进 ⇒ 落笔点 v 更小
    expect(info.playerUv!.v).toBeLessThan(spawnUv.v);
    system.dispose();
  });

  it("角色停在原地时，笔刷落在朝向前方而不是脚下", () => {
    const context = createFakeGameContext();
    const spawn = spawnPosition();
    const player = fakePlayer(new Vector3(spawn.x, spawn.y, spawn.z), Math.PI);
    const system = createSystem({ playerSource: player, spawnRevealRadius: 0 });
    system.init(context);
    system.update(0.016, context);

    const uv = system.colorRevealMask!.getDebugInfo().playerUv!;
    const aheadZ = spawn.z - V02_BRUSH_FORWARD_OFFSET;
    const aheadUv = worldToMaskUv(spawn.x, aheadZ, WORLD_BOUNDS);
    expect(Math.abs(uv.v - aheadUv.v)).toBeLessThan(0.01);
    system.dispose();
  });
});

describe("V0.2 材质：域扭曲边界与线稿距离衰减", () => {
  it("shader 注入包含域扭曲与距离衰减", () => {
    expect(WATERCOLOR_FRAGMENT_HEADER).toContain("uniform float uWarpAmount;");
    expect(WATERCOLOR_FRAGMENT_HEADER).toContain("uniform float uInkDistanceFade;");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcWarpDir");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("uWarpAmount");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("uInkDistanceFade");
    // 两级边缘噪声：粗 + 细
    expect(WATERCOLOR_COLOR_INJECTION).toContain("wcWorld * 2.3");
  });

  it("默认参数：扭曲 2.6m、远景线稿保留 30% 对比", () => {
    const uniforms = createRevealUniforms(createMaskTexture(createFakeSurface(512)), WORLD_BOUNDS);
    expect(uniforms.uWarpAmount.value).toBeCloseTo(2.6, 5);
    expect(uniforms.uInkDistanceFade.value).toBeCloseTo(0.3, 5);
    expect(uniforms.uEdgeJitter.value).toBeGreaterThan(0.28);
  });

  it("排线不再是轴对齐的两组交叉线（有低频角度扰动与第二层疏线）", () => {
    const body = WATERCOLOR_COLOR_INJECTION + WATERCOLOR_FRAGMENT_HEADER;
    expect(body).toContain("wcPencilHatch");
    expect(body).toContain("wcRot");
    expect(body).toContain("lines2");
  });
});

describe("V0.2 结局氛围（天空与雾渐变）", () => {
  it("开场保持暖纸色，结局转向淡桃暖橙，复位回原值", () => {
    const scene = new Scene();
    scene.background = new Color(0xf2ede4);
    scene.fog = new Fog(0xf2ede4, 40, 120);

    const atmosphere = new Atmosphere({ enableSkyDome: true });
    atmosphere.init(scene);
    const openingBackground = atmosphere.backgroundHex;
    const openingFog = atmosphere.fogHex;

    atmosphere.setFinale(1);
    expect(atmosphere.value).toBe(1);
    const sunsetBackground = scene.background as Color;
    // 暖桃/暖橙：红分量高于蓝分量
    expect(sunsetBackground.r).toBeGreaterThan(sunsetBackground.b);
    expect(atmosphere.backgroundHex).not.toBe(openingBackground);
    expect(atmosphere.fogHex).not.toBe(openingFog);

    atmosphere.setFinale(0);
    expect(atmosphere.backgroundHex).toBe(openingBackground);
    expect(atmosphere.fogHex).toBe(openingFog);
    atmosphere.dispose();
  });

  it("超范围与非法输入被钳制，不产生 NaN 颜色", () => {
    const scene = new Scene();
    scene.background = new Color(0xf2ede4);
    scene.fog = new Fog(0xf2ede4, 40, 120);
    const atmosphere = new Atmosphere({ enableSkyDome: false });
    atmosphere.init(scene);

    atmosphere.setFinale(2);
    expect(atmosphere.value).toBe(1);
    atmosphere.setFinale(Number.NaN);
    expect(atmosphere.value).toBe(0);
    const background = scene.background as Color;
    expect(Number.isFinite(background.r)).toBe(true);
    atmosphere.dispose();
  });

  it("只影响开场/结局两态，中途是单调过渡（不会跳变）", () => {
    const scene = new Scene();
    scene.background = new Color(0xf2ede4);
    scene.fog = new Fog(0xf2ede4, 40, 120);
    const atmosphere = new Atmosphere({ enableSkyDome: false });
    atmosphere.init(scene);

    let previous = (scene.background as Color).b;
    for (let i = 1; i <= 10; i += 1) {
      atmosphere.setFinale(i / 10);
      const current = (scene.background as Color).b;
      expect(current).toBeLessThanOrEqual(previous + 1e-6);
      previous = current;
    }
    atmosphere.dispose();
  });
});
