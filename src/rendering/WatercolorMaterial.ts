/**
 * 水彩 / 线稿共享材质工厂（A1 / V0.3 视觉重构）。
 *
 * 设计约束：
 * - 所有可染色材质**共享同一份 uniforms 对象**（`uRevealMask` + `uBoundsMin/uBoundsSize` + `uTime` + `uGlobalReveal`），
 *   保证地面、草、花、水、普通树、花树、远山读取同一世界遮罩（AC-05）。
 * - 采样用世界坐标（`modelMatrix * wcLocalPosition`），模型缩放/实例化/相机移动都不会让纹理漂移。
 * - shader 注入只出现在本模块，three 版本锁定 0.187.0；所有材质共用同一 `WATERCOLOR_PROGRAM_KEY`。
 * - V0.3 新增模式（通过 per-material uniform `uWcMode` 切换，不分裂 shader 程序）：
 *   - `0 standard`：暖纸 + 柔和铅笔排线 ↔ 水彩本色 + 颜料晕边 + 可选桦树皮贴图
 *   - `1 foliage`：通透铅笔卷曲线稿 ↔ 柔边水彩笔触叶簇（明暗渐变 + 颜料斑驳）
 *   - `2 grass`：淡墨点描草 ↔ 顶点风摆 + 根部融地 + 远山坡暖金草海渐变
 *   - `3 water`：浅岸线淡墨波纹 ↔ 水平流动钴蓝/留白水彩笔触 + 岸缘柔化
 *   - `4 mountain`：斜向山脊铅笔排线 ↔ 多层空气透视水彩山峦
 *   - `5 willow`：铅笔垂丝 ↔ 随风轻摆的水彩垂柳长帘
 */
import {
  Color,
  DataTexture,
  FrontSide,
  LinearFilter,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
} from "three";
import type { ColorRepresentation, Side, Texture } from "three";
import type { WorldBounds } from "../core/contracts";
import { worldBoundsSize } from "./maskMapping";

export const WATERCOLOR_PROGRAM_KEY = "starwater-watercolor-v1";

/** three 内部传给 onBeforeCompile 的参数类型，避免依赖具体导出名。 */
type ShaderCompileParameters = Parameters<NonNullable<MeshStandardMaterial["onBeforeCompile"]>>[0];

export type WatercolorMode = "standard" | "foliage" | "grass" | "water" | "mountain" | "willow";

const MODE_INDEX: Readonly<Record<WatercolorMode, number>> = {
  standard: 0,
  foliage: 1,
  grass: 2,
  water: 3,
  mountain: 4,
  willow: 5,
};

let fallbackWhiteTex: Texture | null = null;
function getFallbackWhiteTexture(): Texture {
  if (!fallbackWhiteTex) {
    const data = new Uint8Array([
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
    ]);
    const tex = new DataTexture(data, 2, 2, RGBAFormat, UnsignedByteType);
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    tex.name = "watercolor-fallback-white";
    fallbackWhiteTex = tex;
  }
  return fallbackWhiteTex;
}

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
  /** 遮罩 UV 的域扭曲幅度（世界米），用来打散规则圆形边界（V0.2）。 */
  readonly uWarpAmount: { value: number };
  /** 远景线稿对比衰减下限：越远越淡，避免远处排线糊成灰网（V0.2）。 */
  readonly uInkDistanceFade: { value: number };
  /**
   * 最终章远景显色 0..1（A1 / PRD 5.4「远景染色」）。
   * 只作用于世界边界之外的片段（远山环带），界内遮罩本身不受影响。
   */
  readonly uFinaleReveal: { value: number };
  /** 远景显色的噪声尺度（世界米），越大斑块越细。 */
  readonly uFinaleNoiseScale: { value: number };
  /** 远景显色时的饱和度倍率（远山本色与纸色接近，需要提饱和才看得出来）。 */
  readonly uFinaleSaturation: { value: number };
  /** V0.3 全局时间（秒），驱动风摆与流动水彩水纹。 */
  readonly uTime: { value: number };
  /** V0.3 结局全域水彩漫延波 0..1（平时为 0，花树绽放后从树根向整片花野漫开）。 */
  readonly uGlobalReveal: { value: number };
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
  /** 遮罩 UV 域扭曲幅度（世界米）。0 = 关闭，恢复规则圆形边界。 */
  readonly warpAmount?: number;
  /** 远景线稿对比衰减下限（0～1），越小远处线稿越淡。 */
  readonly inkDistanceFade?: number;
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
    uPaperColor: { value: new Color(options.paperColor ?? 0xf4efe5) },
    uInkColor: { value: new Color(options.inkColor ?? 0x565047) },
    uPulseColor: { value: new Color(options.pulseColor ?? 0xffe9a8) },
    uInkStrength: { value: options.inkStrength ?? 0.34 },
    uPaperScale: { value: options.paperScale ?? 4.2 },
    uHatchScale: { value: options.hatchScale ?? 13 },
    uEdgeJitter: { value: options.edgeJitter ?? 0.36 },
    uPulseStrength: { value: options.pulseStrength ?? 0.16 },
    uWarpAmount: { value: options.warpAmount ?? 2.6 },
    uInkDistanceFade: { value: options.inkDistanceFade ?? 0.3 },
    uFinaleReveal: { value: 0 },
    uFinaleNoiseScale: { value: options.finaleNoiseScale ?? 0.07 },
    uFinaleSaturation: { value: options.finaleSaturation ?? 2.0 },
    uTime: { value: 0 },
    uGlobalReveal: { value: 0 },
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
  readonly mode?: WatercolorMode;
  readonly paintMap?: Texture;
  readonly sketchMap?: Texture;
  readonly waterMap?: Texture;
  readonly barkMap?: Texture;
  readonly windStrength?: number;
  readonly topColor?: ColorRepresentation;
  readonly bottomColor?: ColorRepresentation;
  readonly alphaCutoff?: number;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly depthWrite?: boolean;
}

/** 材质工厂：地面、草、花、水、普通树、花树、远山都从这里拿材质。 */
export function createWatercolorMaterial(options: WatercolorMaterialOptions): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: options.color,
    roughness: options.roughness ?? 0.94,
    metalness: options.metalness ?? 0,
    flatShading: options.flatShading ?? false,
    side: options.side ?? FrontSide,
  });

  if (options.transparent) {
    material.transparent = true;
    material.opacity = options.opacity ?? 1;
    material.depthWrite = options.depthWrite ?? false;
  }

  if (options.name !== undefined) material.name = options.name;
  material.userData["watercolor"] = { uniforms: options.uniforms };

  const uniforms = options.uniforms;
  const fallback = getFallbackWhiteTexture();
  const modeIndex = MODE_INDEX[options.mode ?? "standard"];
  const localUniforms = {
    uWcMode: { value: modeIndex },
    uPaintMap: { value: options.paintMap ?? fallback },
    uSketchMap: { value: options.sketchMap ?? fallback },
    uWaterMap: { value: options.waterMap ?? fallback },
    uBarkMap: { value: options.barkMap ?? fallback },
    uUseBarkMap: { value: options.barkMap ? 1 : 0 },
    uWindStrength: { value: options.windStrength ?? 0 },
    uTopColor: { value: new Color(options.topColor ?? options.color) },
    uBottomColor: { value: new Color(options.bottomColor ?? options.color) },
    uHasGradient: {
      value: options.topColor !== undefined || options.bottomColor !== undefined ? 1 : 0,
    },
    uAlphaCutoff: { value: options.alphaCutoff ?? 0.22 },
  };

  material.onBeforeCompile = (shader: ShaderCompileParameters): void => {
    // 共享引用：更新一次 uniforms 就作用于所有材质；材质局部参数仅补充贴图/模式标量
    Object.assign(shader.uniforms, uniforms, localUniforms);
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

export const WATERCOLOR_VERTEX_DECLARATION = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
varying vec3 vWatercolorWorldPosition;
varying vec2 vWatercolorUv;
varying vec3 vWatercolorNormal;
`;

export const WATERCOLOR_PROJECT_VERTEX = /* glsl */ `
vec4 wcLocalPosition = vec4( transformed, 1.0 );

#ifdef USE_BATCHING
	wcLocalPosition = batchingMatrix * wcLocalPosition;
#endif

#ifdef USE_INSTANCING
	wcLocalPosition = instanceMatrix * wcLocalPosition;
#endif

vec4 wcWorldPosition = modelMatrix * wcLocalPosition;

// 顶点微风摆动（按 UV.y 加权，草根/枝干顶部锚点保持不动）
if (uWindStrength > 0.0001) {
	float wcSwayWeight = clamp(uv.y, 0.0, 1.0);
	float wcWindPhase = wcWorldPosition.x * 0.42 + wcWorldPosition.z * 0.36 + uTime * 1.85;
	float wcWindGust = sin(wcWindPhase) * 0.68 + sin(wcWindPhase * 1.9 + 1.3) * 0.32;
	float wcWindDelta = wcWindGust * uWindStrength * wcSwayWeight * wcSwayWeight;
	wcLocalPosition.x += wcWindDelta;
	wcLocalPosition.z += wcWindDelta * 0.45;
	wcWorldPosition = modelMatrix * wcLocalPosition;
}

vWatercolorWorldPosition = wcWorldPosition.xyz;
vWatercolorUv = uv;
vWatercolorNormal = normalize(mat3(modelMatrix) * objectNormal);

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
uniform float uWarpAmount;
uniform float uInkDistanceFade;
uniform float uFinaleReveal;
uniform float uFinaleNoiseScale;
uniform float uFinaleSaturation;
uniform float uTime;
uniform float uGlobalReveal;

uniform float uWcMode;
uniform sampler2D uPaintMap;
uniform sampler2D uSketchMap;
uniform sampler2D uWaterMap;
uniform sampler2D uBarkMap;
uniform float uUseBarkMap;
uniform vec3 uTopColor;
uniform vec3 uBottomColor;
uniform float uHasGradient;
uniform float uAlphaCutoff;

varying vec3 vWatercolorWorldPosition;
varying vec2 vWatercolorUv;
varying vec3 vWatercolorNormal;

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

// 铅笔排线：两层不同疏密/角度的细线 + 低频角度扰动，
// 避免轴对齐交叉网格那种「工程图」观感（V0.2/V0.3）。
float wcPencilHatch(vec2 p, float lineWidth) {
	float wcRot = (wcNoise(p * 0.035) - 0.5) * 2.2;
	float cs = cos(wcRot);
	float sn = sin(wcRot);
	vec2 q = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y) * uHatchScale;

	float a = abs(fract(q.x + q.y) - 0.5);
	float b = abs(fract(q.x - q.y + 0.37) - 0.5);
	float lines = 1.0 - smoothstep(0.0, lineWidth, min(a, b));

	// 第二层：更疏、更斜，模拟换手/换笔方向的叠加线
	vec2 q2 = vec2(cs * p.x + sn * p.y, -sn * p.x + cs * p.y) * uHatchScale * 0.42;
	float a2 = abs(fract(q2.x * 0.73 + q2.y * 1.31) - 0.5);
	float lines2 = 1.0 - smoothstep(0.0, lineWidth * 0.8, a2);

	float density = (0.48 + 0.52 * wcNoise(p * 4.5)) * (0.68 + 0.32 * wcNoise(p * 1.4));
	return clamp(lines * 0.72 + lines2 * 0.32, 0.0, 1.0) * density;
}
`;

export const WATERCOLOR_COLOR_INJECTION = /* glsl */ `
vec2 wcWorld = vWatercolorWorldPosition.xz;
float wcDist = distance(vWatercolorWorldPosition, uCameraPosition);
float wcLineWidth = 0.045 + clamp(wcDist * 0.0022, 0.0, 0.42);

// 域扭曲：遮罩 UV 沿多尺度噪声推开，边界从「规则圆」变成晕开的水彩前沿
vec2 wcWarpDir = vec2(wcNoise(wcWorld * 0.09), wcNoise(wcWorld * 0.09 + 19.73)) - 0.5;
vec2 wcMaskUv = (wcWorld + wcWarpDir * uWarpAmount - uBoundsMin) / uBoundsSize;
float wcInBounds = step(0.0, wcMaskUv.x) * step(wcMaskUv.x, 1.0) * step(0.0, wcMaskUv.y) * step(wcMaskUv.y, 1.0);
vec4 wcMask = texture2D(uRevealMask, clamp(wcMaskUv, 0.0, 1.0));
float wcReveal = wcMask.r * wcInBounds;
float wcPulse = wcMask.g * wcInBounds;

float wcGrain = wcPaperGrain(wcWorld * uPaperScale);
// 两级边缘噪声：粗颗粒给毛边，细颗粒打散规则圆弧
float wcEdgeNoise = (wcNoise(wcWorld * uPaperScale * 0.5) - 0.5) * 0.45
	+ (wcNoise(wcWorld * 2.3) - 0.5) * 0.55;

// 远景（世界边界之外）：遮罩 UV 覆盖不到，最终章用整片显色补上。
// wcDistant 在界内恒为 0，因此不会改变脚下染色与普通节点 bloom（AC-03～05）。
float wcDistant = 1.0 - wcInBounds;
float wcFinale = 0.0;
if (wcDistant > 0.0) {
	float wcFinaleNoise = wcPaperGrain(wcWorld * uFinaleNoiseScale);
	float wcFinalePatch = 0.55 + 0.45 * smoothstep(0.15, 0.9, wcFinaleNoise);
	float wcFinaleHeight = mix(0.65, 1.0, smoothstep(-4.0, 26.0, vWatercolorWorldPosition.y));
	wcFinale = uFinaleReveal * wcFinalePatch * wcFinaleHeight;
}
float wcRevealTotal = wcReveal + wcFinale * wcDistant;

// V0.3 结局全域水彩漫延波：花树绽放后从花树向整片林间草野平缓推进，平时 uGlobalReveal=0
if (uGlobalReveal > 0.001 && wcInBounds > 0.5) {
	float wcTreeDist = distance(wcWorld, vec2(0.0, -22.0));
	float wcWaveRadius = mix(0.0, 108.0, uGlobalReveal);
	float wcWave = 1.0 - smoothstep(wcWaveRadius - 16.0, wcWaveRadius + 2.0, wcTreeDist + wcEdgeNoise * 7.0);
	wcRevealTotal = max(wcRevealTotal, wcWave * uGlobalReveal);
}

vec3 wcPaper = uPaperColor * (0.97 + 0.05 * wcGrain);
// 线稿对比随距离衰减：近景铅笔实、远景只剩淡淡轮廓（V0.2/V0.3）
float wcInkFade = mix(1.0, uInkDistanceFade, smoothstep(10.0, 62.0, wcDist));
vec3 wcInk = mix(wcPaper, uInkColor, wcPencilHatch(wcWorld, wcLineWidth) * uInkStrength * wcInkFade);
vec3 wcPaint = diffuseColor.rgb * (0.88 + 0.14 * wcGrain);

// 白桦树皮横向纹路叠加
if (uUseBarkMap > 0.5) {
	vec3 wcBarkSample = texture2D(uBarkMap, vec2(vWatercolorUv.x * 1.4, vWatercolorUv.y * 2.6)).rgb;
	wcPaint *= mix(vec3(1.0), wcBarkSample, 0.85);
}

// 远山本色（#a9b8c6）与纸色太接近，雾一压就分不出来；
// 「恢复色彩」的实质是把本色饱和度提上来，而不是另造一个色相。
float wcLuma = dot(wcPaint, vec3(0.299, 0.587, 0.114));
vec3 wcPaintDistant = clamp(vec3(wcLuma) + (wcPaint - vec3(wcLuma)) * uFinaleSaturation, 0.0, 1.0);
vec3 wcPaintUsed = mix(wcPaint, wcPaintDistant, wcDistant * uFinaleReveal);

float wcMasked = smoothstep(0.10, 0.62, wcRevealTotal + wcEdgeNoise * uEdgeJitter);

// 颜料晕染前沿微暗环（模拟水彩纸边缘颜料汇聚）
float wcFrontier = 4.0 * wcMasked * (1.0 - wcMasked);
wcPaintUsed *= 1.0 - wcFrontier * 0.07;

vec3 wcFinal = mix(wcInk, wcPaintUsed, wcMasked);

// ---- V0.3 材质专用水彩与线稿模式 ----
if ((uWcMode > 0.5 && uWcMode < 1.5) || uWcMode > 4.5) {
	// foliage (1) & willow (5)：未显色为通透卷曲铅笔线稿，显色为柔边水彩笔触叶簇
	vec4 wcPaintCard = texture2D(uPaintMap, vWatercolorUv);
	vec4 wcSketchCard = texture2D(uSketchMap, vWatercolorUv);
	float wcCardAlpha = mix(wcSketchCard.a, wcPaintCard.a, smoothstep(0.14, 0.82, wcMasked));
	if (wcCardAlpha < uAlphaCutoff) discard;

	float wcShadeFactor = clamp(vWatercolorUv.y * 0.7 + max(vWatercolorNormal.y, 0.0) * 0.3, 0.0, 1.0);
	vec3 wcFoliageColor = diffuseColor.rgb;
	if (uHasGradient > 0.5) {
		vec3 wcGrad = mix(uBottomColor, uTopColor, wcShadeFactor);
		wcFoliageColor = mix(wcFoliageColor, wcFoliageColor * wcGrad * 1.45, 0.58);
	}
	wcFoliageColor *= 0.86 + 0.24 * wcPaintCard.r;
	wcFoliageColor *= 1.0 - wcFrontier * 0.06;

	vec3 wcSketchInk = mix(uPaperColor, uInkColor * 0.92, clamp(wcSketchCard.a * 1.15 * wcInkFade, 0.0, 1.0));
	wcFinal = mix(wcSketchInk, wcFoliageColor, wcMasked);
} else if (uWcMode > 1.5 && uWcMode < 2.5) {
	// grass (2)：草根融于地表，草尖向暖金草坡过渡；未显色轻淡不刺眼
	float wcTip = clamp(vWatercolorUv.y, 0.0, 1.0);
	float wcGoldenHill = smoothstep(4.0, -14.0, vWatercolorWorldPosition.z);
	vec3 wcGrassBase = mix(uBottomColor, vec3(0.68, 0.65, 0.34), wcGoldenHill * 0.72);
	vec3 wcGrassTip = mix(uTopColor, vec3(0.89, 0.77, 0.35), wcGoldenHill * 0.85);
	vec3 wcGrassPaint = mix(wcGrassBase, wcGrassTip, wcTip) * (0.86 + 0.22 * wcGrain);
	vec3 wcGrassInk = mix(wcPaper, uInkColor, 0.24 * wcTip * wcInkFade);
	wcFinal = mix(wcGrassInk, wcGrassPaint, wcMasked);
} else if (uWcMode > 2.5 && uWcMode < 3.5) {
	// water (3)：流动水彩笔触条纹 + 岸缘柔和淡出
	vec2 wcFlowUv1 = vec2(vWatercolorUv.x * 5.5 - uTime * 0.042, vWatercolorUv.y * 1.3);
	vec2 wcFlowUv2 = vec2(vWatercolorUv.x * 3.1 - uTime * 0.024 + 0.37, vWatercolorUv.y * 1.7 + 0.2);
	vec3 wcWaterA = texture2D(uWaterMap, wcFlowUv1).rgb;
	vec3 wcWaterB = texture2D(uWaterMap, wcFlowUv2).rgb;
	vec3 wcWaterColor = mix(wcWaterA, wcWaterB, 0.45) * (0.92 + 0.1 * wcGrain);
	vec3 wcWaterInk = mix(wcPaper, uInkColor, 0.18 * (0.5 + 0.5 * sin(wcFlowUv1.x * 10.0)) * wcInkFade);
	wcFinal = mix(wcWaterInk, wcWaterColor, wcMasked);
	float wcBankFade = smoothstep(0.0, 0.16, vWatercolorUv.y) * smoothstep(1.0, 0.84, vWatercolorUv.y);
	diffuseColor.a *= wcBankFade * mix(0.32, 0.84, wcMasked);
} else if (uWcMode > 3.5 && uWcMode < 4.5) {
	// mountain (4)：未显色为方向性山坡铅笔斜排线，显色为柔和层叠水彩山色
	float wcRidgeHeight = clamp(vWatercolorUv.y, 0.0, 1.0);
	float wcSlopeHatch = 1.0 - smoothstep(0.0, 0.22, abs(fract(wcWorld.x * 0.24 + vWatercolorWorldPosition.y * 0.42) - 0.5));
	float wcRidgeLine = smoothstep(0.92, 0.99, wcRidgeHeight);
	vec3 wcMtnInk = mix(wcPaper, uInkColor, clamp((wcSlopeHatch * 0.26 + wcRidgeLine * 0.45) * mix(0.25, 1.0, wcRidgeHeight), 0.0, 0.75));
	vec3 wcMtnPaint = mix(wcPaper, wcPaintUsed, smoothstep(0.04, 0.48, wcRidgeHeight));
	wcFinal = mix(wcMtnInk, wcMtnPaint, wcMasked);
}

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
