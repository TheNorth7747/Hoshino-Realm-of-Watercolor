/**
 * 轻量纸张质感后期（A1，PRD 6.2 / 9.2）。
 *
 * 定位：只做「统一纸张颗粒 + 极轻边缘渗色 + 暗角」，**不承担染色**——
 * 染色完全由世界遮罩 + WatercolorMaterial 完成（AC-03/AC-05 的反例就是“只有全屏滤镜”）。
 *
 * 为什么自己包装 renderer.render：
 * A0 的 Game 直接调用 `renderer.render(scene, camera)`，而 core/** 属于共享文件，
 * A1 不能改。这里用可逆的 render 包装接入后期，dispose 时恢复原方法。
 * 已向集成者提出接口变更请求：给 GameSystem 增加可选的 `renderFrame?()` 钩子后即可去掉包装。
 */
import { UnsignedByteType, Vector2, WebGLRenderTarget } from "three";
import type { Camera, IUniform, Scene, Texture, WebGLRenderer } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export interface WatercolorPassOptions {
  /** 0 = 关闭（直出），1 = 全量。默认 0.55。 */
  readonly strength?: number;
  /** 颗粒尺度，越小颗粒越粗。默认 1.6。 */
  readonly grainScale?: number;
  readonly vignette?: number;
}

interface PaperShader {
  uniforms: {
    tDiffuse: { value: Texture | null };
    uStrength: { value: number };
    uResolution: { value: Vector2 };
    uGrainScale: { value: number };
    uVignette: { value: number };
  };
  vertexShader: string;
  fragmentShader: string;
}

const PAPER_SHADER: PaperShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.55 },
    uResolution: { value: new Vector2(1, 1) },
    uGrainScale: { value: 1.6 },
    uVignette: { value: 0.16 },
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
uniform float uStrength;
uniform vec2 uResolution;
uniform float uGrainScale;
uniform float uVignette;
varying vec2 vUv;

float paperHash(vec2 p) {
	return fract(sin(dot(p, vec2(41.7, 289.1))) * 45758.5453);
}

vec3 linearToSrgb(vec3 color) {
	vec3 low = color * 12.92;
	vec3 high = 1.055 * pow(max(color, vec3(0.0)), vec3(0.4166667)) - 0.055;
	return mix(low, high, step(vec3(0.0031308), color));
}

void main() {
	vec4 base = texture2D(tDiffuse, vUv);
	vec2 texel = 1.0 / max(uResolution, vec2(1.0));

	// 轻微边缘渗色：邻域四采样，只混一点点，避免把线稿糊掉
	vec4 blur = texture2D(tDiffuse, vUv + texel * vec2(1.5, 1.5)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(-1.5, 1.5)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(1.5, -1.5)) * 0.25
		+ texture2D(tDiffuse, vUv + texel * vec2(-1.5, -1.5)) * 0.25;

	vec3 color = mix(base.rgb, blur.rgb, 0.12);

	// 纸张颗粒 + 极轻暖色偏置
	float grain = paperHash(floor(vUv * uResolution / uGrainScale));
	color *= 0.95 + 0.10 * grain;
	color = mix(color, color * vec3(1.02, 1.0, 0.975), 0.6);

	// 暗角
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
  /**
   * 递归保护：RenderPass 内部会再调一次 renderer.render(scene, camera)，
   * 若不拦截就会“wrapper → composer → RenderPass → wrapper …”栈溢出。
   */
  private inComposer = false;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    options: WatercolorPassOptions = {},
  ) {
    this.renderer = renderer;

    // 显式用 8bit RT：LDR 场景不需要半浮点，兼容性更好（无头 SwiftShader 也能跑）
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

    if (this.strengthUniform) this.strengthUniform.value = options.strength ?? 0.55;
    if (grainUniform) grainUniform.value = options.grainScale ?? 1.6;
    if (vignetteUniform) vignetteUniform.value = options.vignette ?? 0.16;

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

  /** 接管 renderer.render（可逆）。 */
  install(): void {
    if (this.installed) return;
    const original = this.renderer.render.bind(this.renderer) as (
      scene: Scene,
      camera: Camera,
    ) => void;
    this.originalRender = original;

    // 关掉自动重置，让 info 累计“场景 pass + 后期 pass”，调试面板才反映真实开销
    this.renderer.info.autoReset = false;

    this.renderer.render = (scene: Scene, camera: Camera): void => {
      if (this.inComposer) {
        // RenderPass 内部调用：直出到当前 render target
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
