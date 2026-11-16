/**
 * 对话框（A4，PRD 9.6，AC-06）。
 * 底部卡片，不遮挡玩家；E 由 StorySystem 统一仲裁后调用 advance()，点击直接推进。
 * 文本来自 `dialogue:requested` 事件；提示语来自 story.json。
 */
import type {
  DialogueRequestedPayload,
  GameContext,
  GameSystem,
  Unsubscribe,
} from "../core/contracts";
import type { DialogueController } from "../narrative/StorySystem";
import { STORY } from "../narrative/storyData";
import { el } from "./dom";
import { ensureUiStyles, releaseUiStyles } from "./uiStyles";

export class DialogueBox implements GameSystem, DialogueController {
  readonly id = "ui-dialogue";
  readonly phase = "story" as const;

  private root: HTMLElement | null = null;
  private speakerNode: HTMLElement | null = null;
  private lineNode: HTMLElement | null = null;
  private progressNode: HTMLElement | null = null;
  private readonly unsubs: Unsubscribe[] = [];

  private lines: readonly string[] = [];
  private speaker = "";
  private index = 0;
  private open = false;

  private readonly handleClick = (): void => {
    this.advance();
  };

  private readonly handleRequested = (payload: DialogueRequestedPayload): void => {
    this.show(payload);
  };

  private readonly handleClose = (): void => {
    this.close();
  };

  get isOpen(): boolean {
    return this.open;
  }

  init(context: GameContext): void {
    ensureUiStyles();
    this.speakerNode = el("div", "sw-dialogue__speaker");
    this.lineNode = el("div", "sw-dialogue__line");
    this.progressNode = el("span", "sw-dialogue__progress");
    const hint = el("span", "sw-dialogue__hint", STORY.prompts.continueHint);
    const footer = el("div", "sw-dialogue__footer");
    footer.append(this.progressNode, hint);
    this.root = el("div", "sw-dialogue");
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-live", "polite");
    this.root.hidden = true;
    this.root.append(this.speakerNode, this.lineNode, footer);
    this.root.addEventListener("click", this.handleClick);
    context.uiRoot.append(this.root);

    this.unsubs.push(context.events.on("dialogue:requested", this.handleRequested));
    this.unsubs.push(context.events.on("game:reset", this.handleClose));
    this.unsubs.push(context.events.on("game:finished", this.handleClose));
  }

  advance(): void {
    if (!this.open) return;
    this.index += 1;
    if (this.index >= this.lines.length) {
      this.close();
      return;
    }
    this.renderLine();
  }

  close(): void {
    this.open = false;
    this.lines = [];
    this.index = 0;
    if (this.root) this.root.hidden = true;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.root?.removeEventListener("click", this.handleClick);
    this.root?.remove();
    this.root = null;
    this.speakerNode = null;
    this.lineNode = null;
    this.progressNode = null;
    this.open = false;
    releaseUiStyles();
  }

  private show(payload: DialogueRequestedPayload): void {
    this.lines = payload.lines;
    this.speaker = payload.speaker;
    this.index = 0;
    this.open = this.lines.length > 0;
    if (this.root) this.root.hidden = !this.open;
    if (this.open) this.renderLine();
  }

  private renderLine(): void {
    if (!this.speakerNode || !this.lineNode || !this.progressNode) return;
    this.speakerNode.textContent = this.speaker;
    this.lineNode.textContent = this.lines[this.index] ?? "";
    this.progressNode.textContent = `${this.index + 1}/${this.lines.length}`;
  }
}
