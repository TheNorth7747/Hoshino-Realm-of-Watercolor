/**
 * 结局氛围（V0.2 / Agent 1）：天空渐变与雾色随 finale 值渐变。
 *
 * 设计约束：
 * - 复用既有最终章状态（`RevealSystem` 的 `FinaleReveal`），不新建故事状态。
 * - 不引入重度后处理：天空是 1 个 BackSide 球体 + 渐变 shader（1 draw call），
 *   雾只是改 `scene.fog.color`，背景只是改 `scene.background`。
 * - 开场保持暖纸色（取自 SceneScaffold 设定的背景），复位时逐值回到初始。
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
  /** 结局天空主色（淡桃）。 */
  readonly sunsetColor?: ColorRepresentation;
  /** 结局地平线色（暖橙）。 */
  readonly sunsetHorizon?: ColorRepresentation;
  /** 天空球半径（米）。默认 420，需大于场景包围盒。 */
  readonly skyRadius?: number;
  /** 是否挂载天空球；false 时只做背景/雾渐变。 */
  readonly enableSkyDome?: boolean;
}

const DEFAULT_SUNSET = 0xf3cfb6;
const DEFAULT_SUNSET_HORIZON = 0xf7e0c4;

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
uniform vec3 uSunsetZenith;
uniform vec3 uSunsetHorizon;
varying vec3 vSkyDirection;

void main() {
  float height = clamp(vSkyDirection.y * 0.5 + 0.5, 0.0, 1.0);
  float blend = smoothstep(0.46, 0.82, height);

  vec3 zenith = mix(uZenithColor, uSunsetZenith, uFinale);
  vec3 horizon = mix(uHorizonColor, uSunsetHorizon, uFinale);
  vec3 color = mix(horizon, zenith, blend);

  // 地平线附近再压一层暖光，让结局的「天边发亮」可读
  float glow = pow(clamp(1.0 - abs(vSkyDirection.y), 0.0, 1.0), 6.0);
  color = mix(color, uSunsetHorizon, glow * uFinale * 0.55);

  gl_FragColor = vec4(color, 1.0);
}
`;

export class Atmosphere {
  private readonly options: AtmosphereOptions;
  private scene: Scene | null = null;
  private sky: Mesh<SphereGeometry, ShaderMaterial> | null = null;

  private readonly baseBackground = new Color(0xf2ede4);
  private readonly baseFog = new Color(0xf2ede4);
  private readonly baseZenith = new Color(0xd8d2c6);
  private readonly baseHorizon = new Color(0xf6f1e8);

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

    // 开场天空：接近纸色的冷白，向上略偏灰蓝，保持「暖纸 + 淡天空」
    this.baseHorizon.copy(this.baseBackground);
    this.baseZenith.copy(this.baseBackground).offsetHSL(0.02, 0.02, -0.06);

    if (this.options.enableSkyDome === false) return;

    const material = new ShaderMaterial({
      uniforms: {
        uZenithColor: { value: this.baseZenith.clone() },
        uHorizonColor: { value: this.baseHorizon.clone() },
        uFinale: { value: 0 },
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

  /** 结局程度 0..1：0 = 开场暖纸，1 = 淡桃暖橙。 */
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
      fog.color.copy(this.baseFog).lerp(this.sunsetHorizon, this.finale * 0.72);
    }

    if (this.sky) {
      this.sky.material.uniforms["uFinale"]!.value = this.finale;
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
