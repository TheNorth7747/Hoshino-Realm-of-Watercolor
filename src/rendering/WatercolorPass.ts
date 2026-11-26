/**
 * 轻量纸张质感后期（A1 / V0.3 升级，PRD 6.2 / 9.2）。
 *
 * 定位：只做「冷压水彩纸纤维纹 + 极轻边缘渗色 + 柔和暗角」，**不承担染色**——
 * 染色完全由世界遮罩 + WatercolorMaterial 完成（AC-03/AC-05 的反例就是“只有全屏滤镜”）。
 */
import {
  DataTexture,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from "three";
import type { Camera, IUniform, Scene, Texture, WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export interface WatercolorPassOptions {
  /** 0 = 关闭（直出），1 = 全量。默认 0.42（保持绘本透亮感）。 */
  readonly strength?: number;
  /** 颗粒尺度（像素平铺尺寸）。默认 300。 */
  readonly grainScale?: number;
  readonly vignette?: number;
  readonly paperTexture?: Texture;
}

interface PaperShader {
  uniforms: {
    tDiffuse: { value: Texture | null };
    tPaper: { value: Texture | null };
    uStrength: { value: number };
    uResolution: { value: Vector2 };
    uGrainScale: { value: number };
    uVignette: { value: number };
  };
  vertexShader: string;
  fragmentShader: string;
}

let defaultPaperTex: Texture | null = null;
function getDefaultPaperTexture(): Texture {
  if (!defaultPaperTex) {
    const data = new Uint8Array([
      248, 244, 236, 255, 245, 240, 232, 255, 244, 240, 232, 255, 249, 245, 237, 255,
    ]);
    const tex = new DataTexture(data, 2, 2, RGBAFormat, UnsignedByteType);
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    tex.name = "watercolor-default-paper";
    defaultPaperTex = tex;
  }
  return defaultPaperTex;
}

const PAPER_SHADER: PaperShader = {
  uniforms: {
    tDiffuse: { value: null },
    tPaper: { value: null },
    uStrength: { value: 0.42 },
    uResolution: { value: new Vector2(1, 1) },
    uGrainScale: { value: 300 },
    uVignette: { value: 0.1 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tPaper;
uniform float uStrength;
uniform vec2 uResolution;
uniform float uGrainScale;
uniform float uVignette;
varying vec2 vUv;

vec3 linearToSrgb(vec3 color) {
	vec3 low = color * 12.92;
	vec3 high = 1.055 * pow(max(color, vec3(0.0)), vec3(0.4166667)) - 0.055;
	return mix(low, high, step(vec3(0.0031308), color));
}

void main() {
	vec4 base = texture2D(tDiffuse, vUv);
	vec2 texel = 1.0 / max(uResolution, vec2(1.0));

	// 轻微边缘渗色：邻域四采样，只混一点点，避免把线稿糊掉
	vec4 blur = texture2D(tDiffuse, vUv + texel * vec2(1.2, 1.2)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(-1.2, 1.2)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(1.2, -1.2)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(-1.2, -1.2)) * 0.25;

	vec3 color = mix(base.rgb, blur.rgb, 0.08);

	// 冷压水彩纸纤维纹叠加（替代高频白噪点，保持画面洁净温润）
	vec2 paperUv = (vUv * uResolution) / max(uGrainScale, 64.0);
	vec3 paper = texture2D(tPaper, paperUv).rgb;
	color *= mix(vec3(1.0), paper * 1.025, 0.48);

	// 极轻暗角
	vec2 centered = vUv - 0.5;
	color *= 1.0 - dot(centered, centered) * uVignette;

	vec3 mixed = mix(base.rgb, color, uStrength);
	gl_FragColor = vec4(linearToSrgb(mixed), base.a);
}
`,
};

export class WatercolorPass {
  private readonly renderer: WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly paperPass: ShaderPass;
  private readonly strengthUniform: IUniform | null;
  private readonly resolutionUniform: IUniform | null;
  private originalRender: ((scene: Scene, camera: Camera) => void) | null = null;
  private installed = false;
  private inComposer = false;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    options: WatercolorPassOptions = {},
  ) {
    this.renderer = renderer;

    const target = new WebGLRenderTarget(1, 1, { type: UnsignedByteType });
    target.texture.name = "starwater-paper-rt";
    this.composer = new EffectComposer(renderer, target);

    this.renderPass = new RenderPass(scene, camera);
    this.paperPass = new ShaderPass(PAPER_SHADER);
    this.paperPass.renderToScreen = true;

    this.strengthUniform = this.paperPass.uniforms["uStrength"] ?? null;
    this.resolutionUniform = this.paperPass.uniforms["uResolution"] ?? null;
    const grainUniform = this.paperPass.uniforms["uGrainScale"] ?? null;
    const vignetteUniform = this.paperPass.uniforms["uVignette"] ?? null;
    const paperUniform = this.paperPass.uniforms["tPaper"] ?? null;

    if (this.strengthUniform) this.strengthUniform.value = options.strength ?? 0.42;
    if (grainUniform) grainUniform.value = options.grainScale ?? 300;
    if (vignetteUniform) vignetteUniform.value = options.vignette ?? 0.1;
    if (paperUniform) paperUniform.value = options.paperTexture ?? getDefaultPaperTexture();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.paperPass);
  }

  get isInstalled(): boolean {
    return this.installed;
  }

  setStrength(strength: number): void {
    if (!this.strengthUniform) return;
    this.strengthUniform.value = Math.min(Math.max(strength, 0), 1);
  }

  setSize(width: number, height: number): void {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(safeWidth, safeHeight);
    if (this.resolutionUniform?.value instanceof Vector2) {
      this.resolutionUniform.value.set(safeWidth, safeHeight);
    }
  }

  /** 接管 renderer.render（保留向后兼容）。 */
  install(): void {
    if (this.installed) return;
    const original = this.renderer.render.bind(this.renderer) as (
      scene: Scene,
      camera: Camera,
    ) => void;
    this.originalRender = original;

    this.renderer.info.autoReset = false;

    this.renderer.render = (scene: Scene, camera: Camera): void => {
      if (this.inComposer) {
        original(scene, camera);
        return;
      }

      this.inComposer = true;
      try {
        this.renderer.info.reset();
        this.renderPass.scene = scene;
        this.renderPass.camera = camera;
        this.composer.render(0);
      } finally {
        this.inComposer = false;
      }
    };
    this.installed = true;
  }

  uninstall(): void {
    if (!this.installed) return;
    if (this.originalRender) this.renderer.render = this.originalRender;
    this.originalRender = null;
    this.renderer.info.autoReset = true;
    this.installed = false;
  }

  render(deltaSeconds: number = 0): void {
    this.composer.render(deltaSeconds);
  }

  /** 通过 GameSystem.renderFrame() 正式钩子执行后期渲染，无需包装 renderer.render。 */
  renderWithComposer(scene: Scene, camera: Camera): void {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render(0);
  }

  dispose(): void {
    this.uninstall();
    this.renderer.info.autoReset = true;
    this.paperPass.dispose();
    this.renderPass.dispose();
    this.composer.dispose();
  }
}
