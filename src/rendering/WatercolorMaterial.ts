/**
 * 水彩 / 线稿共享材质工厂（A1，PRD 9.2）。
 *
 * 设计约束：
 * - 所有可染色材质**共享同一份 uniforms 对象**（`uRevealMask` + `uBoundsMin/uBoundsSize`），
 *   这是 AC-05「地面、草、水、花树读取同一张世界遮罩」的实现方式：
 *   不是每个材质各传一份纹理，而是同一个 uniform 对象引用。
 * - 采样用世界坐标（`modelMatrix * position`），因此模型缩放/实例化/相机移动都不会让纹理漂移。
 * - shader 注入只出现在本模块（PRD 9.2 要求），three 版本锁定在 0.187.0。
 * - 未显色：纸色 + 铅笔排线（不是简单降饱和）；已显色：材质本色 + 纸纹不均。
 */
import { Color, FrontSide, MeshStandardMaterial, Vector2, Vector3 } from "three";
import type { ColorRepresentation, Side, Texture } from "three";
import type { WorldBounds } from "../core/contracts";
import { worldBoundsSize } from "./maskMapping";

export const WATERCOLOR_PROGRAM_KEY = "starwater-watercolor-v1";

/** three 内部传给 onBeforeCompile 的参数类型，避免依赖具体导出名。 */
type ShaderCompileParameters = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

export interface RevealUniforms {
  readonly uRevealMask: { value: Texture };
  readonly uBoundsMin: { value: Vector2 };
  readonly uBoundsSize: { value: Vector2 };
  /** 每帧由 RevealSystem 更新，用于按距离加粗排线、抑制摩尔纹。 */
  readonly uCameraPosition: { value: Vector3 };
  readonly uPaperColor: { value: Color };
  readonly uInkColor: { value: Color };
  readonly uPulseColor: { value: Color };
  readonly uInkStrength: { value: number };
  readonly uPaperScale: { value: number };
  readonly uHatchScale: { value: number };
  readonly uEdgeJitter: { value: number };
  readonly uPulseStrength: { value: number };
  /**
   * 最终章远景显色 0..1（A1 / PRD 5.4「远景染色」）。
   * 只作用于世界边界之外的片段（远山环带），界内染色完全不受影响。
   */
  readonly uFinaleReveal: { value: number };
  /** 远景显色的噪声尺度（世界米），越大斑块越细。 */
  readonly uFinaleNoiseScale: { value: number };
  /** 远景显色时的饱和度倍率（远山本色与纸色接近，需要提饱和才看得出来）。 */
  readonly uFinaleSaturation: { value: number };
}

export interface RevealUniformOptions {
  /** 未显色区域的纸张底色。 */
  readonly paperColor?: ColorRepresentation;
  /** 铅笔线颜色。 */
  readonly inkColor?: ColorRepresentation;
  /** 扩散脉冲叠加色。 */
  readonly pulseColor?: ColorRepresentation;
  readonly inkStrength?: number;
  readonly paperScale?: number;
  readonly hatchScale?: number;
  readonly edgeJitter?: number;
  readonly pulseStrength?: number;
  readonly finaleNoiseScale?: number;
  /** 远景显色的饱和度倍率；远山本色与纸色接近，需要提饱和才看得出来。 */
  readonly finaleSaturation?: number;
}

/** 创建**一份**共享 uniforms；所有材质传入同一个对象。 */
export function createRevealUniforms(
  maskTexture: Texture,
  bounds: WorldBounds,
  options: RevealUniformOptions = {},
): RevealUniforms {
  const size = worldBoundsSize(bounds);
  return {
    uRevealMask: { value: maskTexture },
    uBoundsMin: { value: new Vector2(bounds.minX, bounds.minZ) },
    uBoundsSize: { value: new Vector2(size.width, size.height) },
    uCameraPosition: { value: new Vector3() },
    uPaperColor: { value: new Color(options.paperColor ?? 0xf2ede4) },
    uInkColor: { value: new Color(options.inkColor ?? 0x4a453d) },
    uPulseColor: { value: new Color(options.pulseColor ?? 0xffe9a8) },
    uInkStrength: { value: options.inkStrength ?? 0.42 },
    uPaperScale: { value: options.paperScale ?? 4.5 },
    uHatchScale: { value: options.hatchScale ?? 14 },
    uEdgeJitter: { value: options.edgeJitter ?? 0.28 },
    uPulseStrength: { value: options.pulseStrength ?? 0.18 },
    uFinaleReveal: { value: 0 },
    uFinaleNoiseScale: { value: options.finaleNoiseScale ?? 0.07 },
    uFinaleSaturation: { value: options.finaleSaturation ?? 2.4 },
  };
}

export interface WatercolorMaterialOptions {
  readonly color: ColorRepresentation;
  readonly uniforms: RevealUniforms;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly flatShading?: boolean;
  readonly side?: Side;
  readonly name?: string;
}

/** 材质工厂：测试地面、草、水、花树都从这里拿材质。 */
export function createWatercolorMaterial(options: WatercolorMaterialOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.94,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    side: options.side ?? FrontSide,
  });

  if (options.name !== undefined) material.name = options.name;
  material.userData["watercolor"] = { uniforms: options.uniforms };

  const uniforms = options.uniforms;
  material.onBeforeCompile = (shader: ShaderCompileParameters): void => {
    // 共享引用：更新一次 uniforms 就作用于所有材质
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = injectWatercolorVertex(shader.vertexShader);
    shader.fragmentShader = injectWatercolorFragment(shader.fragmentShader);
  };
  material.customProgramCacheKey = (): string => WATERCOLOR_PROGRAM_KEY;

  return material;
}

/** 取回材质挂的共享 uniforms（调试与测试用）。 */
export function getRevealUniforms(material: MeshStandardMaterial): RevealUniforms | null {
  const record = material.userData["watercolor"] as { uniforms?: RevealUniforms } | undefined;
  return record?.uniforms ?? null;
}

export const WATERCOLOR_VERTEX_DECLARATION = "varying vec3 vWatercolorWorldPosition;\n";

export const WATERCOLOR_PROJECT_VERTEX = /* glsl */ `
vec4 wcLocalPosition = vec4( transformed, 1.0 );

#ifdef USE_BATCHING
	wcLocalPosition = batchingMatrix * wcLocalPosition;
#endif

#ifdef USE_INSTANCING
	wcLocalPosition = instanceMatrix * wcLocalPosition;
#endif

vec4 wcWorldPosition = modelMatrix * wcLocalPosition;
vWatercolorWorldPosition = wcWorldPosition.xyz;

vec4 mvPosition = modelViewMatrix * wcLocalPosition;
gl_Position = projectionMatrix * mvPosition;
`;

export const WATERCOLOR_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D uRevealMask;
uniform vec2 uBoundsMin;
uniform vec2 uBoundsSize;
uniform vec3 uCameraPosition;
uniform vec3 uPaperColor;
uniform vec3 uInkColor;
uniform vec3 uPulseColor;
uniform float uInkStrength;
uniform float uPaperScale;
uniform float uHatchScale;
uniform float uEdgeJitter;
uniform float uPulseStrength;
uniform float uFinaleReveal;
uniform float uFinaleNoiseScale;
uniform float uFinaleSaturation;

varying vec3 vWatercolorWorldPosition;

float wcHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float wcNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = wcHash(i);
	float b = wcHash(i + vec2(1.0, 0.0));
	float c = wcHash(i + vec2(0.0, 1.0));
	float d = wcHash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 纸张颗粒：两个不同频率的噪声叠加，尺度由 uPaperScale 控制（世界米）
float wcPaperGrain(vec2 p) {
	return wcNoise(p) * 0.55 + wcNoise(p * 2.7) * 0.45;
}

// 铅笔排线：两组交叉细线 + 噪声断续；线宽随相机距离放大以抑制摩尔纹
float wcPencilHatch(vec2 p, float lineWidth) {
	vec2 q = p * uHatchScale;
	float a = abs(fract(q.x + q.y) - 0.5);
	float b = abs(fract(q.x - q.y + 0.37) - 0.5);
	float lines = 1.0 - smoothstep(0.0, lineWidth, min(a, b));
	return lines * (0.55 + 0.45 * wcNoise(p * 6.0));
}
`;

export const WATERCOLOR_COLOR_INJECTION = /* glsl */ `
vec2 wcWorld = vWatercolorWorldPosition.xz;
float wcLineWidth = 0.05 + clamp(distance(vWatercolorWorldPosition, uCameraPosition) * 0.0022, 0.0, 0.42);

vec2 wcMaskUv = (wcWorld - uBoundsMin) / uBoundsSize;
float wcInBounds = step(0.0, wcMaskUv.x) * step(wcMaskUv.x, 1.0) * step(0.0, wcMaskUv.y) * step(wcMaskUv.y, 1.0);
vec4 wcMask = texture2D(uRevealMask, clamp(wcMaskUv, 0.0, 1.0));
float wcReveal = wcMask.r * wcInBounds;
float wcPulse = wcMask.g * wcInBounds;

float wcGrain = wcPaperGrain(wcWorld * uPaperScale);
float wcEdgeNoise = wcNoise(wcWorld * uPaperScale * 0.5) - 0.5;

// 远景（世界边界之外）：遮罩 UV 覆盖不到，最终章用整片显色补上。
// wcDistant 在界内恒为 0，因此不会改变脚下染色与普通节点 bloom（AC-03～05）。
float wcDistant = 1.0 - wcInBounds;
float wcFinale = 0.0;
if (wcDistant > 0.0) {
	float wcFinaleNoise = wcPaperGrain(wcWorld * uFinaleNoiseScale);
	float wcFinalePatch = 0.5 + 0.5 * smoothstep(0.15, 0.9, wcFinaleNoise);
	float wcFinaleHeight = mix(0.55, 1.0, smoothstep(-4.0, 26.0, vWatercolorWorldPosition.y));
	wcFinale = uFinaleReveal * wcFinalePatch * wcFinaleHeight;
}
float wcRevealTotal = wcReveal + wcFinale * wcDistant;

vec3 wcPaper = uPaperColor * (0.96 + 0.06 * wcGrain);
vec3 wcInk = mix(wcPaper, uInkColor, wcPencilHatch(wcWorld, wcLineWidth) * uInkStrength);
vec3 wcPaint = diffuseColor.rgb * (0.86 + 0.14 * wcGrain);

// 远山本色（#a9b8c6）与纸色太接近，雾一压就分不出来；
// 「恢复色彩」的实质是把本色饱和度提上来，而不是另造一个色相。
float wcLuma = dot(wcPaint, vec3(0.299, 0.587, 0.114));
vec3 wcPaintDistant = clamp(vec3(wcLuma) + (wcPaint - vec3(wcLuma)) * uFinaleSaturation, 0.0, 1.0);
vec3 wcPaintUsed = mix(wcPaint, wcPaintDistant, wcDistant * uFinaleReveal);

float wcMasked = smoothstep(0.06, 0.72, wcRevealTotal + wcEdgeNoise * uEdgeJitter);

vec3 wcFinal = mix(wcInk, wcPaintUsed, wcMasked);
wcFinal += uPulseColor * wcPulse * uPulseStrength;
// 最终章的远景再被花树的光晕染暖一点，让「天边也活了」看得出来
wcFinal += uPulseColor * (uFinaleReveal * wcDistant * 0.1);

diffuseColor.rgb = wcFinal;
`;

function replaceOnce(source: string, token: string, replacement: string, label: string): string {
  if (!source.includes(token)) {
    throw new Error(
      `[starwater] 水彩 shader 注入失败：找不到 "${token}"（${label}）。` +
        "three 版本可能已变更，请核对锁定的 0.187.0 与 ShaderChunk。",
    );
  }
  return source.replace(token, replacement);
}

export function injectWatercolorVertex(source: string): string {
  // 幂等：注入完成后用 wcWorldPosition 作为标记，避免重复声明 varying
  if (source.includes("wcWorldPosition")) return source;
  const output = WATERCOLOR_VERTEX_DECLARATION + source;
  return replaceOnce(
    output,
    "#include <project_vertex>",
    WATERCOLOR_PROJECT_VERTEX,
    "project_vertex",
  );
}

export function injectWatercolorFragment(source: string): string {
  // 幂等：注入完成后用 wcMaskUv 作为标记
  if (source.includes("wcMaskUv")) return source;
  const output = WATERCOLOR_FRAGMENT_HEADER + source;
  return replaceOnce(
    output,
    "#include <color_fragment>",
    `#include <color_fragment>\n${WATERCOLOR_COLOR_INJECTION}`,
    "color_fragment",
  );
}
