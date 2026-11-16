import { Color, Vector2 } from "three";
import type { MeshStandardMaterial, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";
import type { WorldBounds } from "../../../src/core/contracts";
import {
  WATERCOLOR_COLOR_INJECTION,
  WATERCOLOR_PROGRAM_KEY,
  createRevealUniforms,
  createWatercolorMaterial,
  getRevealUniforms,
  injectWatercolorFragment,
  injectWatercolorVertex,
} from "../../../src/rendering/WatercolorMaterial";
import { createMaskTexture } from "../../../src/rendering/MaskSurface";
import { createFakeSurface } from "./fake-surface";

const BOUNDS: WorldBounds = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };

type CompileParams = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

function fakeShader(): CompileParams {
  return {
    uniforms: {},
    vertexShader: "void main() {\n#include <project_vertex>\n}",
    fragmentShader: "void main() {\nvec4 diffuseColor = vec4(1.0);\n#include <color_fragment>\n}",
  } as unknown as CompileParams;
}

function makeUniforms() {
  const texture = createMaskTexture(createFakeSurface(512));
  return createRevealUniforms(texture, BOUNDS);
}

describe("createRevealUniforms", () => {
  it("世界边界写进 uniforms，与 maskMapping 一致", () => {
    const uniforms = makeUniforms();
    expect(uniforms.uBoundsMin.value).toBeInstanceOf(Vector2);
    expect(uniforms.uBoundsMin.value.x).toBe(-48);
    expect(uniforms.uBoundsMin.value.y).toBe(-48);
    expect(uniforms.uBoundsSize.value.x).toBe(96);
    expect(uniforms.uBoundsSize.value.y).toBe(96);
  });

  it("默认纸色/线稿色存在且为 Color 实例", () => {
    const uniforms = makeUniforms();
    expect(uniforms.uPaperColor.value).toBeInstanceOf(Color);
    expect(uniforms.uInkColor.value).toBeInstanceOf(Color);
    expect(uniforms.uEdgeJitter.value).toBeGreaterThan(0);
  });
});

describe("createWatercolorMaterial：跨材质共享同一遮罩", () => {
  it("多个材质持有同一个 uniforms 对象引用（AC-05 的实现基础）", () => {
    const uniforms = makeUniforms();
    const ground = createWatercolorMaterial({ color: 0x9ec98a, uniforms, name: "ground" });
    const sphere = createWatercolorMaterial({ color: 0x6f8fd6, uniforms, name: "sphere" });
    const tree = createWatercolorMaterial({ color: 0xd98fb0, uniforms, name: "tree" });

    expect(getRevealUniforms(ground)).toBe(uniforms);
    expect(getRevealUniforms(sphere)).toBe(uniforms);
    expect(getRevealUniforms(tree)).toBe(uniforms);
    expect(getRevealUniforms(ground)?.uRevealMask).toBe(getRevealUniforms(tree)?.uRevealMask);
  });

  it("改一次 uniforms 就作用于所有材质", () => {
    const uniforms = makeUniforms();
    const a = createWatercolorMaterial({ color: 0xffffff, uniforms });
    const b = createWatercolorMaterial({ color: 0xffffff, uniforms });

    uniforms.uBoundsMin.value.set(-10, -10);
    expect(getRevealUniforms(a)?.uBoundsMin.value.x).toBe(-10);
    expect(getRevealUniforms(b)?.uBoundsMin.value.x).toBe(-10);
  });

  it("同一程序缓存键，避免每种颜色各编译一套 shader", () => {
    const uniforms = makeUniforms();
    const a = createWatercolorMaterial({ color: 0x112233, uniforms });
    const b = createWatercolorMaterial({ color: 0x445566, uniforms });
    expect(a.customProgramCacheKey()).toBe(WATERCOLOR_PROGRAM_KEY);
    expect(b.customProgramCacheKey()).toBe(WATERCOLOR_PROGRAM_KEY);
  });

  it("onBeforeCompile 注入世界坐标采样，而不是屏幕坐标", () => {
    const uniforms = makeUniforms();
    const material = createWatercolorMaterial({ color: 0x9ec98a, uniforms });
    const shader = fakeShader();

    material.onBeforeCompile(shader, {} as WebGLRenderer);

    expect(shader.vertexShader).toContain("vWatercolorWorldPosition");
    expect(shader.vertexShader).toContain("modelMatrix");
    // 世界坐标必须在 modelViewMatrix 之前取，否则拿到的是相机空间
    expect(shader.vertexShader.indexOf("modelMatrix")).toBeLessThan(
      shader.vertexShader.indexOf("modelViewMatrix"),
    );

    expect(shader.fragmentShader).toContain("uRevealMask");
    expect(shader.fragmentShader).toContain("vWatercolorWorldPosition.xz");
    expect(shader.fragmentShader).toContain("smoothstep");
    // 注入片段本身不许依赖屏幕坐标或 uv 通道
    expect(WATERCOLOR_COLOR_INJECTION).not.toContain("gl_FragCoord");
    expect(WATERCOLOR_COLOR_INJECTION).not.toContain("vUv");
  });

  it("注入后 uniforms 与共享对象是同一引用", () => {
    const uniforms = makeUniforms();
    const material = createWatercolorMaterial({ color: 0xffffff, uniforms });
    const shader = fakeShader();
    material.onBeforeCompile(shader, {} as WebGLRenderer);

    expect(shader.uniforms["uRevealMask"]).toBe(uniforms.uRevealMask);
    expect(shader.uniforms["uBoundsSize"]).toBe(uniforms.uBoundsSize);
  });
});

describe("shader 注入健壮性", () => {
  it("找不到 project_vertex 时抛错（three 版本漂移要立刻发现）", () => {
    expect(() => injectWatercolorVertex("void main() {}")).toThrowError(/project_vertex/);
  });

  it("找不到 color_fragment 时抛错", () => {
    expect(() => injectWatercolorFragment("void main() {}")).toThrowError(/color_fragment/);
  });

  it("重复注入完全幂等", () => {
    const once = injectWatercolorFragment("void main() {\n#include <color_fragment>\n}");
    const twice = injectWatercolorFragment(once);
    expect(twice).toBe(once);
    expect(twice.split("uniform sampler2D uRevealMask;").length - 1).toBe(1);
  });
});
