/**
 * 极简无对话自由探索系统（V0.3）。
 *
 * 取代对话/星屑/伙伴引导流程，还原参考视频的沉浸式散步体验：
 * - 无弹窗对话、无 E 键门槛、无任务遮挡。
 * - 玩家走近蓝花坡、溪流或山顶樱花树时自然触发水彩晕染；
 *   抵达樱花树后唤醒樱花绽放、落瓣、晚霞天空、远山显色、林间光束与全域花野漫延。
 * - 支持 R 键快速重置绘本，以及 `?debug=1` 下的 `debugCompleteNode()` 调试触发。
 */
import { Vector3 } from "three";
import type {
  DebugStatSource,
  GameContext,
  GameSystem,
  PlayerSource,
  StoryNodeId,
  StoryStep,
  Unsubscribe,
} from "../core/contracts";
import { LANDMARKS, STORY_NODE_ORDER, distanceXZ } from "../config/world";

export interface FreeExploreOptions {
  readonly player: PlayerSource;
}

export interface FreeExploreState {
  readonly step: StoryStep;
  readonly visited: readonly StoryNodeId[];
  readonly elapsedSeconds: number;
  readonly finished: boolean;
}

interface LandmarkTrigger {
  readonly id: StoryNodeId;
  readonly radius: number;
  readonly bloomRadius: number;
  readonly bloomDuration: number;
}

const TRIGGERS: readonly LandmarkTrigger[] = [
  { id: "flower", radius: 6.5, bloomRadius: 9, bloomDuration: 1.4 },
  { id: "stream", radius: 5.5, bloomRadius: 10, bloomDuration: 1.4 },
  { id: "tree", radius: 7.0, bloomRadius: 18, bloomDuration: 1.8 },
];

const ENDING_DELAY_SECONDS = 2.5;

function isFormTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export class FreeExploreSystem implements GameSystem {
  readonly id = "story";
  readonly phase = "story" as const;

  private readonly player: PlayerSource;
  private context: GameContext | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private unregisterStats: Unsubscribe | null = null;

  private readonly nodePositions = new Map<StoryNodeId, Vector3>();
  private readonly visited = new Set<StoryNodeId>();
  private step: StoryStep = "intro";
  private runElapsed = 0;
  private endingTimer: number | null = null;
  private finished = false;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || isFormTarget(event.target)) return;
    if (event.code === "KeyR") {
      this.context?.events.emit("game:reset");
    }
  };

  private readonly handleReset = (): void => {
    this.resetRun();
  };

  constructor(options: FreeExploreOptions) {
    this.player = options.player;
  }

  init(context: GameContext): void {
    this.context = context;
    for (const id of STORY_NODE_ORDER) {
      const landmark = LANDMARKS[id];
      this.nodePositions.set(
        id,
        new Vector3(landmark.x, context.world.sampleHeight(landmark.x, landmark.z), landmark.z),
      );
    }

    this.unsubs.push(context.events.on("game:reset", this.handleReset));
    this.unregisterStats = context.debug.registerStatSource(this.statSource);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown);
    }
    this.resetRun();
  }

  update(deltaSeconds: number, _context: GameContext): void {
    if (!this.finished) this.runElapsed += deltaSeconds;

    const pos = this.player.getPlayerSnapshot().position;
    for (const trigger of TRIGGERS) {
      if (this.visited.has(trigger.id)) continue;
      const nodePos = this.nodePositions.get(trigger.id);
      if (!nodePos) continue;
      if (distanceXZ(nodePos, pos) <= trigger.radius) {
        this.triggerLandmark(trigger);
      }
    }

    if (this.endingTimer !== null) {
      this.endingTimer -= deltaSeconds;
      if (this.endingTimer <= 0) {
        this.endingTimer = null;
        this.finished = true;
        this.context?.events.emit("game:finished", { elapsedSeconds: this.runElapsed });
      }
    }
  }

  /** 仅调试模式：触发地标扩散或樱树绽放（供 ?debug=1 与 e2e 测试）。 */
  debugCompleteNode(id: StoryNodeId): void {
    if (!this.context?.settings.debugEnabled) return;
    const trigger = TRIGGERS.find((t) => t.id === id);
    if (trigger) this.triggerLandmark(trigger);
  }

  getState(): FreeExploreState {
    return {
      step: this.step,
      visited: [...this.visited],
      elapsedSeconds: this.runElapsed,
      finished: this.finished,
    };
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.unregisterStats?.();
    this.unregisterStats = null;
    this.nodePositions.clear();
    this.context = null;
  }

  private resetRun(): void {
    this.visited.clear();
    this.step = "intro";
    this.runElapsed = 0;
    this.endingTimer = null;
    this.finished = false;
  }

  private triggerLandmark(trigger: LandmarkTrigger): void {
    if (this.visited.has(trigger.id)) return;
    this.visited.add(trigger.id);

    const pos = this.nodePositions.get(trigger.id);
    if (pos && this.context) {
      this.context.events.emit("color:bloom", {
        position: pos.clone(),
        radius: trigger.bloomRadius,
        duration: trigger.bloomDuration,
      });
    }
    this.context?.events.emit("story:completed", { nodeId: trigger.id });

    if (trigger.id === "tree") {
      this.step = "finished";
      this.endingTimer = ENDING_DELAY_SECONDS;
    } else if (this.step !== "finished") {
      this.step = trigger.id;
    }
  }

  private readonly statSource: DebugStatSource = {
    id: "story",
    read: () => ({
      mode: "free-explore",
      step: this.step,
      visited: [...this.visited].join(", ") || "-",
      elapsed: Number(this.runElapsed.toFixed(1)),
      finished: this.finished,
    }),
  };
}
