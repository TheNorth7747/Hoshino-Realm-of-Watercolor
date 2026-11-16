/**
 * 基础渲染器（A0 建立，A1 在此基础上扩展后期与材质，但不得删除本文件导出的 API）。
 * 固定 WebGL2 路径（PRD 6.2），DPR 上限 1.5，尺寸变化只改绘制缓冲不改 CSS 布局。
 */
import { NoToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import type { EngineSettings } from "../core/contracts";
import { applyDprCap } from "../core/config";
import { AppError } from "../core/errors";

export interface RendererBundle {
  readonly renderer: WebGLRenderer;
  resize(width: number, height: number, devicePixelRatio: number): void;
  dispose(): void;
}

function assertWebGl2Support(): void {
  const probe = document.createElement("canvas");
  const context = probe.getContext("webgl2");
  if (!context) {
    throw new AppError(
      "webgl-unavailable",
      "当前浏览器没有可用的 WebGL2 上下文。请使用最新版 Chrome/Edge，并确认已开启硬件加速。",
    );
  }
  const loseContext = context.getExtension("WEBGL_lose_context");
  loseContext?.loseContext();
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  settings: EngineSettings,
): RendererBundle {
  assertWebGl2Support();

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      depth: true,
      stencil: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    throw new AppError("renderer-failed", "WebGL2 渲染器创建失败。", { cause: error });
  }

  renderer.outputColorSpace = SRGBColorSpace;
  // 水彩方向要的是平涂可预测的颜色，暂不套电影级 tone mapping；A1 需要时在这里改。
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(applyDprCap(window.devicePixelRatio, settings.dprCap));
  renderer.setClearColor(settings.clearColor, 1);

  const bundle: RendererBundle = {
    renderer,
    resize(width: number, height: number, devicePixelRatio: number): void {
      const dpr = applyDprCap(devicePixelRatio, settings.dprCap);
      renderer.setPixelRatio(dpr);
      // false：canvas 的显示尺寸由 CSS 控制，这里只改绘制缓冲。
      renderer.setSize(width, height, false);
    },
    dispose(): void {
      renderer.dispose();
    },
  };

  return bundle;
}
