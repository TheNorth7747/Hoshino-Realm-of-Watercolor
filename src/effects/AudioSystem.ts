/**
 * 游戏音乐系统（V0.3）：挂载德彪西 L.66 钢琴曲，监听首次交互解锁、M 键静音与花树绽放琶音。
 */
import type { DebugStatSource, GameContext, GameSystem, Unsubscribe } from "../core/contracts";
import { DebussyPiano } from "./DebussyPiano";

export class AudioSystem implements GameSystem {
  readonly id = "audio";
  readonly phase = "effects" as const;

  private readonly piano = new DebussyPiano();
  private readonly unsubs: Unsubscribe[] = [];
  private unregisterStats: Unsubscribe | null = null;
  private attached = false;

  private readonly handleUnlock = (): void => {
    this.piano.unlock();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.piano.unlock();
    if (event.repeat) return;
    if (event.code === "KeyM") {
      this.toggleMute();
    }
  };

  init(context: GameContext): void {
    if (typeof window !== "undefined" && !this.attached) {
      this.attached = true;
      window.addEventListener("pointerdown", this.handleUnlock);
      window.addEventListener("keydown", this.handleKeyDown);
    }

    this.unsubs.push(
      context.events.on("story:completed", (payload) => {
        if (payload.nodeId === "tree") this.piano.playBloomChord();
      }),
      context.events.on("game:reset", () => {
        this.piano.reset();
      }),
    );

    const statSource: DebugStatSource = {
      id: "audio",
      read: () => ({
        track: "Debussy L.66",
        muted: this.piano.isMuted,
        playing: this.piano.isPlaying,
      }),
    };
    this.unregisterStats = context.debug.registerStatSource(statSource);
  }

  update(): void {
    this.piano.update();
  }

  toggleMute(): boolean {
    return this.piano.toggleMute();
  }

  isMuted(): boolean {
    return this.piano.isMuted;
  }

  dispose(): void {
    if (typeof window !== "undefined" && this.attached) {
      this.attached = false;
      window.removeEventListener("pointerdown", this.handleUnlock);
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    this.unregisterStats?.();
    this.unregisterStats = null;
    this.piano.dispose();
  }
}
