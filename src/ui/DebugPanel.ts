/**
 * 故事调试面板（A4，PRD 11.4）。
 * 仅 ?debug=1 挂载：当前步骤/星屑统计 + 节点触发按钮 + 重置按钮，
 * 供 A6 的 Playwright smoke 在不跑图的情况下触发三节点并到达结局。
 * 与 A0 的 DebugOverlay（debug-root）并存，本面板挂在 uiRoot 左下角。
 */
import type { GameContext, GameSystem } from "../core/contracts";
import { STORY_NODE_ORDER } from "../config/world";
import type { StorySystem } from "../narrative/StorySystem";
import { nodeData } from "../narrative/storyData";
import { el } from "./dom";
import { ensureUiStyles, releaseUiStyles } from "./uiStyles";

export class DebugPanel implements GameSystem {
  readonly id = "ui-debug";
  readonly phase = "story" as const;

  private readonly story: StorySystem;
  private root: HTMLElement | null = null;
  private statsNode: HTMLElement | null = null;
  private mounted = false;
  private lastStats = "";
  private readonly buttonCleanups: (() => void)[] = [];

  constructor(story: StorySystem) {
    this.story = story;
  }

  init(context: GameContext): void {
    if (!context.settings.debugEnabled) return;
    ensureUiStyles();
    this.mounted = true;

    this.statsNode = el("div", "sw-debug__stats");
    const buttons = el("div", "sw-debug__buttons");
    for (const id of STORY_NODE_ORDER) {
      this.addButton(buttons, id, nodeData(id).title, () => {
        this.story.debugCompleteNode(id);
      });
    }
    this.addButton(buttons, "reset", "重置", () => {
      context.events.emit("game:reset");
    });

    this.root = el("div", "sw-debug");
    this.root.append(el("div", "sw-debug__title", "Story Debug"), this.statsNode, buttons);
    context.uiRoot.append(this.root);
    this.renderStats();
  }

  update(_deltaSeconds: number, _context: GameContext): void {
    if (this.mounted) this.renderStats();
  }

  dispose(): void {
    if (!this.mounted) return;
    for (const cleanup of this.buttonCleanups) cleanup();
    this.buttonCleanups.length = 0;
    this.root?.remove();
    this.root = null;
    this.statsNode = null;
    this.mounted = false;
    this.lastStats = "";
    releaseUiStyles();
  }

  private addButton(parent: HTMLElement, nodeId: string, label: string, onClick: () => void): void {
    const button = el("button", "sw-debug__button", label);
    button.type = "button";
    button.dataset["node"] = nodeId;
    button.addEventListener("click", onClick);
    this.buttonCleanups.push(() => {
      button.removeEventListener("click", onClick);
    });
    parent.append(button);
  }

  private renderStats(): void {
    if (!this.statsNode) return;
    const state = this.story.getHudState();
    const text = `step=${state.step} shards=${state.shardsCollected}/${state.shardTotal}`;
    if (text !== this.lastStats) {
      this.statsNode.textContent = text;
      this.lastStats = text;
    }
  }
}
