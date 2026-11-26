/**
 * 结局氛围（V0.2 / V0.3 水彩云霞升级）：天空水彩云层渐变与雾色随 finale 值渐变。
 *
 * 设计约束：
 * - 复用既有最终章状态（`RevealSystem` 的 `FinaleReveal`），不新建故事状态。
 * - 不引入重度后处理：天空是 1 个 BackSide 球体 + FBM 水彩云渐变 shader（1 draw call），
 *   雾只是改 `scene.fog.color`，背景只是改 `scene.background`。
 * - 开场保持暖纸色，复位时逐值回到初始。
 */
import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  type ColorRepresentation,
  type Fog,
  type Scene,
} from "three";

export interface AtmosphereOptions {
  /** 结局天空上层淡桃/藕荷色。 */
  readonly sunsetColor?: ColorRepresentation;
  /** 结局地平线暖金色。 */
  readonly sunsetHorizon?: ColorRepresentation;
  /** 天空球半径（米）。默认 420，需大于场景包围盒。 */
  readonly skyRadius?: number;
  /** 是否挂载天空球；false 时只做背景/雾渐变。 */
  readonly enableSkyDome?: boolean;
}

const DEFAULT_SUNSET = 0xd6b8c4;
const DEFAULT_SUNSET_HORIZON = 0xf7dfc0;

const SKY_VERTEX = /* glsl */ `
varying vec3 vSkyDirection;
void main() {
  vSkyDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uFinale;
uniform float uTime;
uniform vec3 uSunsetZenith;
uniform vec3 uSunsetHorizon;
varying vec3 vSkyDirection;

float skyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float skyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
    mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float skyFbm(vec2 p) {
  float v = 0.0;
  v += skyNoise(p) * 0.55;
  v += skyNoise(p * 2.13 + 3.7) * 0.30;
  v += skyNoise(p * 4.41 + 9.2) * 0.15;
  return v;
}

void main() {
  float height = clamp(vSkyDirection.y * 0.5 + 0.5, 0.0, 1.0);
  float blend = smoothstep(0.47, 0.82, height);

  vec3 zenith = mix(uZenithColor, uSunsetZenith, uFinale);
  vec3 horizon = mix(uHorizonColor, uSunsetHorizon, uFinale);
  vec3 color = mix(horizon, zenith, blend);

  // V0.3 水彩云雾晕染：地平线上方带微动云团层次
  vec2 skyUv = vSkyDirection.xz / (abs(vSkyDirection.y) + 0.22);
  float cloud = skyFbm(skyUv * 0.85 + vec2(uTime * 0.008, uTime * 0.004));
  float cloudBand = smoothstep(0.46, 0.72, height) * smoothstep(0.95, 0.58, height);
  vec3 openCloud = vec3(0.975, 0.96, 0.93);
  vec3 sunsetCloud = mix(vec3(0.98, 0.84, 0.74), vec3(0.76, 0.71, 0.82), smoothstep(0.54, 0.76, height));
  vec3 cloudTint = mix(openCloud, sunsetCloud, uFinale);
  color = mix(color, cloudTint, smoothstep(0.42, 0.76, cloud) * cloudBand * mix(0.24, 0.58, uFinale));

  // 地平线附近再压一层暖金晕染，让结局的「天边发亮」可读
  float glow = pow(clamp(1.0 - abs(vSkyDirection.y), 0.0, 1.0), 5.0);
  color = mix(color, uSunsetHorizon, glow * uFinale * 0.62);

  gl_FragColor = vec4(color, 1.0);
}
`;

export class Atmosphere {
  private readonly options: AtmosphereOptions;
  private scene: Scene | null = null;
  private sky: Mesh<SphereGeometry, ShaderMaterial> | null = null;

  private readonly baseBackground = new Color(0xf4efe5);
  private readonly baseFog = new Color(0xf4efe5);
  private readonly baseZenith = new Color(0xe2dbd0);
  private readonly baseHorizon = new Color(0xf7f2e8);

  private readonly sunsetColor: Color;
  private readonly sunsetHorizon: Color;
  private finale = 0;

  private readonly scratch = new Color();

  constructor(options: AtmosphereOptions = {}) {
    this.options = options;
    this.sunsetColor = new Color(options.sunsetColor ?? DEFAULT_SUNSET);
    this.sunsetHorizon = new Color(options.sunsetHorizon ?? DEFAULT_SUNSET_HORIZON);
  }

  /** 挂载：记录初始色，按需建天空球。幂等。 */
  init(scene: Scene): void {
    if (this.scene) return;
    this.scene = scene;

    const background = scene.background;
    if (background instanceof Color) this.baseBackground.copy(background);

    const fog = scene.fog as Fog | null;
    if (fog) this.baseFog.copy(fog.color);

    // 开场天空：接近暖纸色的柔米白，向上略偏淡暖灰
    this.baseHorizon.copy(this.baseBackground);
    this.baseZenith.copy(this.baseBackground).offsetHSL(0.02, 0.01, -0.05);

    if (this.options.enableSkyDome === false) return;

    const material = new ShaderMaterial({
      uniforms: {
        uZenithColor: { value: this.baseZenith.clone() },
        uHorizonColor: { value: this.baseHorizon.clone() },
        uFinale: { value: 0 },
        uTime: { value: 0 },
        uSunsetZenith: { value: this.sunsetColor.clone() },
        uSunsetHorizon: { value: this.sunsetHorizon.clone() },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });

    const sky = new Mesh(new SphereGeometry(this.options.skyRadius ?? 420, 24, 16), material);
    sky.name = "atmosphere-sky";
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    scene.add(sky);
    this.sky = sky;
  }

  /** 结局程度 0..1：0 = 开场暖纸，1 = 淡桃暖橙云霞。 */
  setFinale(value: number): void {
    const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    if (Math.abs(next - this.finale) < 0.002) return;
    this.finale = next;

    const scene = this.scene;
    if (!scene) return;

    if (scene.background instanceof Color) {
      scene.background.copy(this.baseBackground).lerp(this.sunsetColor, this.finale * 0.55);
    }

    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(this.baseFog).lerp(this.sunsetHorizon, this.finale * 0.65);
    }

    if (this.sky) {
      this.sky.material.uniforms["uFinale"]!.value = this.finale;
    }
  }

  setTime(seconds: number): void {
    if (this.sky && Number.isFinite(seconds)) {
      this.sky.material.uniforms["uTime"]!.value = seconds;
    }
  }

  get value(): number {
    return this.finale;
  }

  /** 测试与调试用：当前背景色（hex）。 */
  get backgroundHex(): string {
    const scene = this.scene;
    if (scene && scene.background instanceof Color) return `#${scene.background.getHexString()}`;
    return `#${this.scratch.copy(this.baseBackground).getHexString()}`;
  }

  get fogHex(): string {
    const scene = this.scene;
    const fog = scene?.fog as Fog | null;
    if (fog) return `#${fog.color.getHexString()}`;
    return `#${this.baseFog.getHexString()}`;
  }

  dispose(): void {
    const sky = this.sky;
    if (sky) {
      sky.geometry.dispose();
      sky.material.dispose();
      this.scene?.remove(sky);
      this.sky = null;
    }
    this.scene = null;
  }
}
