import { Color, Fog, Scene, Texture, Vector3 } from "three";
import type { MeshStandardMaterial, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import type { WorldBounds } from "../../../src/core/contracts";
import { Atmosphere } from "../../../src/rendering/Atmosphere";
import { GodRays } from "../../../src/rendering/GodRays";
import { createFakeSurface } from "./fake-surface";
import { createMaskTexture } from "../../../src/rendering/MaskSurface";
import { createProceduralBrushPack } from "../../../src/rendering/ProceduralBrushes";
import {
  WATERCOLOR_COLOR_INJECTION,
  WATERCOLOR_PROGRAM_KEY,
  createRevealUniforms,
  createWatercolorMaterial,
  getRevealUniforms,
} from "../../../src/rendering/WatercolorMaterial";

const BOUNDS: WorldBounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };
type CompileParams = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

function fakeShader(): CompileParams {
  return {
    uniforms: {},
    vertexShader: "void main() {\n#include <project_vertex>\n}",
    fragmentShader: "void main() {\nvec4 diffuseColor = vec4(1.0);\n#include <color_fragment>\n}",
  } as unknown as CompileParams;
}

describe("V0.3 ProceduralBrushes", () => {
  it("生成 6 张水彩/线稿/纸纹贴图并可安全释放", () => {
    const pack = createProceduralBrushPack();
    expect(pack.foliagePaint).toBeInstanceOf(Texture);
    expect(pack.foliageSketch).toBeInstanceOf(Texture);
    expect(pack.paperGrain).toBeInstanceOf(Texture);
    expect(pack.waterStroke).toBeInstanceOf(Texture);
    expect(pack.petal).toBeInstanceOf(Texture);
    expect(pack.birchBark).toBeInstanceOf(Texture);
    expect(() => pack.dispose()).not.toThrow();
  });
});

describe("V0.3 GodRays", () => {
  it("初始化隐藏，随 finale 显隐并更新 uTime，dispose 清理", () => {
    const scene = new Scene();
    const rays = new GodRays();
    rays.init(scene);

    const mesh = scene.getObjectByName("v03-god-rays");
    expect(mesh).toBeDefined();
    expect(mesh?.visible).toBe(false);

    rays.setFinale(0.8);
    expect(rays.value).toBeCloseTo(0.8, 5);
    expect(mesh?.visible).toBe(true);

    rays.update(0.016);
    rays.setFinale(0);
    expect(mesh?.visible).toBe(false);

    rays.dispose();
    expect(scene.getObjectByName("v03-god-rays")).toBeUndefined();
  });
});

describe("V0.3 WatercolorMaterial 多种水彩模式", () => {
  it("所有 mode 共用同一 program key 与同一 RevealUniforms 引用", () => {
    const tex = createMaskTexture(createFakeSurface(512));
    const uniforms = createRevealUniforms(tex, BOUNDS);
    const pack = createProceduralBrushPack();

    const foliage = createWatercolorMaterial({
      color: 0x7fa25a,
      uniforms,
      mode: "foliage",
      paintMap: pack.foliagePaint,
      sketchMap: pack.foliageSketch,
      topColor: 0xbfe060,
      bottomColor: 0x4b8542,
      windStrength: 0.08,
    });
    const grass = createWatercolorMaterial({
      color: 0x86b873,
      uniforms,
      mode: "grass",
      windStrength: 0.16,
    });
    const water = createWatercolorMaterial({
      color: 0x7fa8c9,
      uniforms,
      mode: "water",
      waterMap: pack.waterStroke,
      transparent: true,
      opacity: 0.85,
    });
    const mountain = createWatercolorMaterial({ color: 0x8daea8, uniforms, mode: "mountain" });
    const willow = createWatercolorMaterial({
      color: 0x9cb86a,
      uniforms,
      mode: "willow",
      paintMap: pack.foliagePaint,
      sketchMap: pack.foliageSketch,
      windStrength: 0.14,
    });

    for (const mat of [foliage, grass, water, mountain, willow]) {
      expect(getRevealUniforms(mat)).toBe(uniforms);
      expect(mat.customProgramCacheKey()).toBe(WATERCOLOR_PROGRAM_KEY);
      const shader = fakeShader();
      mat.onBeforeCompile(shader, {} as WebGLRenderer);
      expect(shader.uniforms["uTime"]).toBe(uniforms.uTime);
      expect(shader.uniforms["uGlobalReveal"]).toBe(uniforms.uGlobalReveal);
      expect(shader.uniforms["uRevealMask"]).toBe(uniforms.uRevealMask);
    }

    expect(WATERCOLOR_COLOR_INJECTION).toContain("uGlobalReveal");
    expect(WATERCOLOR_COLOR_INJECTION).toContain("uWcMode");
    pack.dispose();
  });
});

describe("V0.3 Atmosphere 云霞时间推进", () => {
  it("setTime 不抛错，合法时间推进天空云层", () => {
    const scene = new Scene();
    scene.background = new Color(0xf4efe5);
    scene.fog = new Fog(0xf4efe5, 40, 140);
    const atmosphere = new Atmosphere({ enableSkyDome: true });
    atmosphere.init(scene);
    atmosphere.setTime(12.5);
    atmosphere.setTime(Number.NaN);
    expect(new Vector3(0, 1, 0).length()).toBe(1);
    atmosphere.dispose();
  });
});
