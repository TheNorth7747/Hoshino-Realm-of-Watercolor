/**
 * 结局页（A4，PRD 9.6 / 5.5，AC-08）。
 * `game:finished` 后出现（延迟由 StorySystem 控制，让环境变化先被看见）；
 * 小卡片居中，不铺满屏幕，玩家仍能看到自己走出的彩色路径。
 * “重新进入绘本”按钮发出 `game:reset`（契约 8.4：发送方 UI/Game）。
 */
import type { GameFinishedPayload, GameContext, GameSystem, Unsubscribe } from "../core/contracts";
import { STORY } from "../narrative/storyData";
import { el } from "./dom";
import { ensureUiStyles, releaseUiStyles } from "./uiStyles";

export class EndingOverlay implements GameSystem {
  readonly id = "ui-ending";
  readonly phase = "story" as const;

  private root: HTMLElement | null = null;
  private elapsedNode: HTMLElement | null = null;
  private restartButton: HTMLButtonElement | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private events: GameContext["events"] | null = null;

  private readonly handleRestart = (): void => {
    this.events?.emit("game:reset");
  };

  private readonly handleFinished = (payload: GameFinishedPayload): void => {
    this.show(payload.elapsedSeconds);
  };

  private readonly handleReset = (): void => {
    this.hide();
  };

  init(context: GameContext): void {
    ensureUiStyles();
    this.events = context.events;

    const card = el("div", "sw-ending__card");
    card.setAttribute("role", "dialog");
    card.append(el("h2", "sw-ending__title", STORY.ending.title));
    for (const line of STORY.ending.lines) {
      card.append(el("p", "sw-ending__line", line));
    }
    this.elapsedNode = el("p", "sw-ending__elapsed");
    this.restartButton = el("button", "sw-ending__restart", STORY.ending.restartLabel);
    this.restartButton.type = "button";
    this.restartButton.addEventListener("click", this.handleRestart);
    card.append(this.elapsedNode, this.restartButton);

    this.root = el("div", "sw-ending");
    this.root.hidden = true;
    this.root.append(card);
    context.uiRoot.append(this.root);

    this.unsubs.push(context.events.on("game:finished", this.handleFinished));
    this.unsubs.push(context.events.on("game:reset", this.handleReset));
  }

  dispose(): void {
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.restartButton?.removeEventListener("click", this.handleRestart);
    this.root?.remove();
    this.root = null;
    this.elapsedNode = null;
    this.restartButton = null;
    this.events = null;
    releaseUiStyles();
  }

  private show(elapsedSeconds: number): void {
    if (!this.root || !this.elapsedNode) return;
    this.elapsedNode.textContent = `${STORY.ending.elapsedLabel} ${formatElapsed(elapsedSeconds)}`;
    this.root.hidden = false;
  }

  private hide(): void {
    if (this.root) this.root.hidden = true;
  }
}

function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
