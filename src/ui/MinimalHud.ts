/**
 * 极简自由探索 HUD（V0.3）。
 *
 * 贴合参考视频的克制界面：
 * - 底部一条半透明轻提示条：`Click to lock · WASD move · Shift sprint · Space jump · Scroll zoom · R reset · M music`
 * - 右上角两枚小型玻璃按钮：音乐开关（♫）与重置绘本（↻），绝不遮挡 3D 水彩世界。
 */
import type { GameContext, GameSystem, Unsubscribe } from "../core/contracts";
import { el } from "../ui/dom";
import { ensureUiStyles, releaseUiStyles } from "../ui/uiStyles";

export interface MinimalHudOptions {
  readonly onToggleAudio?: () => boolean;
  readonly isAudioMuted?: () => boolean;
}

export const CONTROLS_HINT_TEXT =
  "Click to lock · WASD move · Shift sprint · Space jump · Scroll zoom · R reset · M music";

export class MinimalHud implements GameSystem {
  readonly id = "ui-hud";
  readonly phase = "story" as const;

  private readonly options: MinimalHudOptions;
  private root: HTMLElement | null = null;
  private hintNode: HTMLElement | null = null;
  private audioButton: HTMLButtonElement | null = null;
  private resetButton: HTMLButtonElement | null = null;
  private context: GameContext | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private muted = false;

  private readonly handleAudioClick = (): void => {
    if (this.options.onToggleAudio) {
      this.muted = this.options.onToggleAudio();
    } else {
      this.muted = !this.muted;
    }
    this.syncAudioLabel();
  };

  private readonly handleResetClick = (): void => {
    this.context?.events.emit("game:reset");
  };

  constructor(options: MinimalHudOptions = {}) {
    this.options = options;
  }

  init(context: GameContext): void {
    this.context = context;
    ensureUiStyles();

    this.root = el("div", "sw-minimal-hud");

    const actions = el("div", "sw-minimal-actions");
    this.audioButton = el("button", "sw-minimal-btn");
    this.audioButton.type = "button";
    this.audioButton.dataset["action"] = "toggle-audio";
    this.audioButton.addEventListener("click", this.handleAudioClick);

    this.resetButton = el("button", "sw-minimal-btn", "↻ 重置");
    this.resetButton.type = "button";
    this.resetButton.dataset["action"] = "reset";
    this.resetButton.addEventListener("click", this.handleResetClick);

    actions.append(this.audioButton, this.resetButton);

    this.hintNode = el("div", "sw-controls-hint", CONTROLS_HINT_TEXT);

    this.root.append(actions, this.hintNode);
    context.uiRoot.append(this.root);

    this.muted = this.options.isAudioMuted?.() ?? false;
    this.syncAudioLabel();
  }

  update(): void {
    if (this.options.isAudioMuted) {
      const next = this.options.isAudioMuted();
      if (next !== this.muted) {
        this.muted = next;
        this.syncAudioLabel();
      }
    }
  }

  dispose(): void {
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.audioButton?.removeEventListener("click", this.handleAudioClick);
    this.resetButton?.removeEventListener("click", this.handleResetClick);
    this.root?.remove();
    this.root = null;
    this.hintNode = null;
    this.audioButton = null;
    this.resetButton = null;
    this.context = null;
    releaseUiStyles();
  }

  private syncAudioLabel(): void {
    if (!this.audioButton) return;
    this.audioButton.textContent = this.muted ? "♪ 静音" : "♫ 乐曲";
  }
}
