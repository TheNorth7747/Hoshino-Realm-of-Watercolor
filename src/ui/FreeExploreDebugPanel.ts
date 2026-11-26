/**
 * 极简自由探索调试面板（仅 `?debug=1` 下挂载）。
 * 保持 `.sw-debug` 与 `.sw-debug__button[data-node]` 选择器，便于自动化回归与视觉截图。
 */
import type { GameContext, GameSystem, StoryNodeId } from "../core/contracts";
import { LANDMARKS, STORY_NODE_ORDER } from "../config/world";
import type { FreeExploreSystem } from "../narrative/FreeExploreSystem";
import { el } from "./dom";
import { ensureUiStyles, releaseUiStyles } from "./uiStyles";

export class FreeExploreDebugPanel implements GameSystem {
  readonly id = "ui-debug";
  readonly phase = "story" as const;

  private readonly explore: FreeExploreSystem;
  private root: HTMLElement | null = null;
  private statsNode: HTMLElement | null = null;
  private context: GameContext | null = null;
  private readonly buttonCleanups: Array<() => void> = [];

  constructor(explore: FreeExploreSystem) {
    this.explore = explore;
  }

  init(context: GameContext): void {
    if (!context.settings.debugEnabled) return;
    this.context = context;
    ensureUiStyles();

    this.statsNode = el("div", "sw-debug__stats");
    const buttons = el("div", "sw-debug__buttons");

    for (const id of STORY_NODE_ORDER) {
      const btn = el("button", "sw-debug__button", LANDMARKS[id].label);
      btn.type = "button";
      btn.dataset["node"] = id;
      const onClick = (): void => {
        this.explore.debugCompleteNode(id as StoryNodeId);
      };
      btn.addEventListener("click", onClick);
      this.buttonCleanups.push(() => btn.removeEventListener("click", onClick));
      buttons.append(btn);
    }

    const resetBtn = el("button", "sw-debug__button", "重置");
    resetBtn.type = "button";
    resetBtn.dataset["action"] = "reset";
    const onReset = (): void => {
      this.context?.events.emit("game:reset");
    };
    resetBtn.addEventListener("click", onReset);
    this.buttonCleanups.push(() => resetBtn.removeEventListener("click", onReset));
    buttons.append(resetBtn);

    this.root = el("div", "sw-debug");
    this.root.append(this.statsNode, buttons);
    context.uiRoot.append(this.root);
    this.update();
  }

  update(): void {
    if (!this.statsNode) return;
    const state = this.explore.getState();
    this.statsNode.textContent = `mode=free-explore step=${state.step} visited=${state.visited.length}/3`;
  }

  dispose(): void {
    for (const cleanup of this.buttonCleanups) cleanup();
    this.buttonCleanups.length = 0;
    this.root?.remove();
    this.root = null;
    this.statsNode = null;
    this.context = null;
    releaseUiStyles();
  }
}
