/**
 * HUD（A4，PRD 9.6，AC-06 / 07 / 12）。
 * 只显示：当前目标、星屑 n/3、互动提示。文本全部来自 StorySystem 的故事数据，
 * 本组件不写死任何剧情文本、坐标或触发条件。
 */
import type { GameContext, GameSystem } from "../core/contracts";
import type { HudStateSource, StoryHudState } from "../narrative/StorySystem";
import { el } from "./dom";
import { ensureUiStyles, releaseUiStyles } from "./uiStyles";

export class HUD implements GameSystem {
  readonly id = "ui-hud";
  readonly phase = "story" as const;

  private readonly source: HudStateSource;
  private root: HTMLElement | null = null;
  private objectiveNode: HTMLElement | null = null;
  private shardsNode: HTMLElement | null = null;
  private promptNode: HTMLElement | null = null;
  private last: StoryHudState | null = null;

  constructor(source: HudStateSource) {
    this.source = source;
  }

  init(context: GameContext): void {
    ensureUiStyles();
    this.objectiveNode = el("div", "sw-hud__objective");
    this.objectiveNode.setAttribute("aria-live", "polite");
    this.shardsNode = el("div", "sw-hud__shards");
    this.shardsNode.setAttribute("aria-live", "polite");
    this.promptNode = el("div", "sw-prompt");
    this.promptNode.hidden = true;
    this.root = el("div", "sw-hud");
    this.root.append(this.objectiveNode, this.shardsNode, this.promptNode);
    context.uiRoot.append(this.root);
    this.last = null;
    this.render(this.source.getHudState());
  }

  update(_deltaSeconds: number, _context: GameContext): void {
    this.render(this.source.getHudState());
  }

  dispose(): void {
    this.root?.remove();
    this.root = null;
    this.objectiveNode = null;
    this.shardsNode = null;
    this.promptNode = null;
    this.last = null;
    releaseUiStyles();
  }

  private render(state: StoryHudState): void {
    if (!this.objectiveNode || !this.shardsNode || !this.promptNode) return;
    const last = this.last;
    if (!last || last.objective !== state.objective) {
      this.objectiveNode.textContent = state.objective;
      this.objectiveNode.hidden = state.objective.length === 0;
    }
    if (
      !last ||
      last.shardsCollected !== state.shardsCollected ||
      last.shardTotal !== state.shardTotal
    ) {
      this.shardsNode.textContent = `✦ ${state.shardsCollected}/${state.shardTotal}`;
    }
    if (!last || last.prompt !== state.prompt) {
      this.promptNode.textContent = state.prompt ?? "";
      this.promptNode.hidden = state.prompt === null;
    }
    this.last = state;
  }
}
