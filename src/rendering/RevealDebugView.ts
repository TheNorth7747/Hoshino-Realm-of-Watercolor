/**
 * 遮罩调试视图（A1，PRD 11.4）。
 *
 * 在 `#debug-root`（A0 提供的调试容器）里追加一块 160×160 缩略图：
 * 遮罩本身、世界边界、三个故事节点的触发范围、玩家当前位置。
 * 缩略图坐标系与遮罩一致（v 向下 = +Z），因此屏幕上看到的形状就是世界里的形状。
 */
import type { WorldBounds } from "../core/contracts";
import { LANDMARKS, STORY_NODE_SPATIAL, STORY_NODE_ORDER } from "../config/world";
import type { ColorRevealMask } from "./ColorRevealMask";
import { maskPixelToWorldCenter, worldToMaskUv } from "./maskMapping";

export interface RevealDebugViewOptions {
  readonly mask: ColorRevealMask;
  readonly bounds: WorldBounds;
  readonly intervalMs?: number;
}

const THUMB_SIZE = 160;

export class RevealDebugView {
  private readonly mask: ColorRevealMask;
  private readonly bounds: WorldBounds;
  private readonly intervalMs: number;
  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly stats: HTMLElement;
  private timer: number | null = null;

  constructor(options: RevealDebugViewOptions) {
    this.mask = options.mask;
    this.bounds = options.bounds;
    this.intervalMs = options.intervalMs ?? 250;

    const container = document.querySelector<HTMLElement>("#debug-root");
    this.root = document.createElement("div");
    this.root.className = "reveal-debug";
    this.root.style.marginTop = "8px";
    this.root.style.paddingTop = "8px";
    this.root.style.borderTop = "1px solid rgba(255,255,255,0.16)";

    const title = document.createElement("div");
    title.textContent = "染色遮罩（世界坐标）";
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";

    this.canvas = document.createElement("canvas");
    this.canvas.width = THUMB_SIZE;
    this.canvas.height = THUMB_SIZE;
    this.canvas.style.width = `${THUMB_SIZE}px`;
    this.canvas.style.height = `${THUMB_SIZE}px`;
    this.canvas.style.display = "block";
    this.canvas.style.borderRadius = "4px";
    this.canvas.style.background = "#111";

    this.stats = document.createElement("div");
    this.stats.style.marginTop = "6px";
    this.stats.style.lineHeight = "1.5";
    this.stats.style.opacity = "0.85";

    this.root.append(title, this.canvas, this.stats);
    (container ?? document.body).append(this.root);
  }

  start(): void {
    if (this.timer !== null) return;
    this.render();
    this.timer = window.setInterval(() => this.render(), this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.root.remove();
  }

  private render(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    ctx.drawImage(this.mask.surface.canvas, 0, 0, THUMB_SIZE, THUMB_SIZE);

    // 世界边界
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, THUMB_SIZE - 1, THUMB_SIZE - 1);

    // 4m 网格
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 1; i < 4; i += 1) {
      const p = (i / 4) * THUMB_SIZE;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, THUMB_SIZE);
      ctx.moveTo(0, p);
      ctx.lineTo(THUMB_SIZE, p);
      ctx.stroke();
    }

    // 故事节点触发范围
    for (const nodeId of STORY_NODE_ORDER) {
      const spatial = STORY_NODE_SPATIAL[nodeId];
      const landmark = LANDMARKS[spatial.landmark];
      const uv = worldToMaskUv(landmark.x, landmark.z, this.bounds);
      const radiusPx =
        (spatial.interactionRadius / (this.bounds.maxX - this.bounds.minX)) * THUMB_SIZE;
      ctx.strokeStyle = "rgba(120,200,255,0.75)";
      ctx.beginPath();
      ctx.arc(uv.u * THUMB_SIZE, uv.v * THUMB_SIZE, radiusPx, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 玩家位置
    const info = this.mask.getDebugInfo();
    if (info.playerUv) {
      ctx.fillStyle = "#ff6b57";
      ctx.beginPath();
      ctx.arc(info.playerUv.u * THUMB_SIZE, info.playerUv.v * THUMB_SIZE, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    const coverage = this.mask.surface.readRevealCoverage();
    const centerWorld = maskPixelToWorldCenter(
      THUMB_SIZE / 2,
      THUMB_SIZE / 2,
      this.bounds,
      THUMB_SIZE,
    );
    this.stats.textContent =
      `笔刷 ${info.brushRadius.toFixed(2)}m · 显色 ${(coverage * 100).toFixed(1)}% · ` +
      `stamp ${info.stampCount} · flush ${info.flushCount} · bloom ${info.activeBlooms} · ` +
      `缩略图中心 (${centerWorld.x.toFixed(0)}, ${centerWorld.z.toFixed(0)})`;
  }
}
