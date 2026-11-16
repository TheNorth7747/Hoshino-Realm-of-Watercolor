/**
 * 故事状态机（A4，PRD 5.4 / 9.5 / 9.6，AC-06 / 07 / 08 / 12）。
 *
 * 单向推进：intro → flower → stream → tree → finished。
 * - flower / stream：在范围内按 E 即完成（completeOn=interact），触发染色 + 对话 + 星屑出现。
 * - tree：按 E 后出现星屑 3，拾取星屑才触发大范围染色与结局（completeOn=shard，PRD 5.4）。
 * - 星屑统一“靠近即收集”（PRD 9.5 二选一），同一 ShardId 只计数一次。
 * - 所有触发幂等；重置只由 `game:reset` 事件驱动（契约 GameSystem 注释）。
 * - 坐标全部来自 config/world.ts；文本与规则来自 story.json。
 */
import { Group, Mesh, MeshStandardMaterial, OctahedronGeometry, Vector3 } from "three";
import type {
  DebugStatSource,
  GameContext,
  GameSystem,
  PlayerSource,
  ShardId,
  StoryNode,
  StoryNodeId,
  StoryStep,
  Unsubscribe,
} from "../core/contracts";
import { LANDMARKS, STAR_SHARD_TOTAL, STORY_NODE_ORDER, distanceXZ } from "../config/world";
import { STORY, nodeData, nodeLandmark, shardIdFor, storyNode } from "./storyData";

/** DialogueBox 对状态机暴露的最小控制面（E 键仲裁由状态机统一持有）。 */
export interface DialogueController {
  readonly isOpen: boolean;
  advance(): void;
  close(): void;
}

export interface StorySystemOptions {
  readonly player: PlayerSource;
  readonly dialogue: DialogueController;
}

export interface StoryHudState {
  readonly step: StoryStep;
  readonly objective: string;
  readonly shardsCollected: number;
  readonly shardTotal: number;
  readonly prompt: string | null;
  readonly finished: boolean;
}

export interface HudStateSource {
  getHudState(): StoryHudState;
}

interface ActiveShard {
  readonly shardId: ShardId;
  readonly nodeId: StoryNodeId;
  readonly mesh: Mesh;
  readonly position: Vector3;
  readonly baseY: number;
  readonly phase: number;
}

const SHARD_HOVER_HEIGHT = 1.0;
const SHARD_BOB_AMPLITUDE = 0.15;
const SHARD_SPIN_SPEED = 1.6;

export class StorySystem implements GameSystem, HudStateSource {
  readonly id = "story";
  readonly phase = "story" as const;

  private readonly player: PlayerSource;
  private readonly dialogue: DialogueController;

  private context: GameContext | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private unregisterStats: Unsubscribe | null = null;

  private step: StoryStep = "intro";
  private readonly completed = new Set<StoryNodeId>();
  private readonly interacted = new Set<StoryNodeId>();
  private readonly collectedShards = new Set<ShardId>();
  private readonly activeShards = new Map<ShardId, ActiveShard>();
  private readonly nodePositions = new Map<StoryNodeId, Vector3>();

  private shardGroup: Group | null = null;
  private shardGeometry: OctahedronGeometry | null = null;
  private shardMaterial: MeshStandardMaterial | null = null;

  private pendingIntro = true;
  private interactRequested = false;
  private runElapsed = 0;
  private endingTimer: number | null = null;
  private finishedEmitted = false;
  private prompt: string | null = null;

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "KeyE" || event.repeat) return;
    if (this.dialogue.isOpen) {
      this.dialogue.advance();
      return;
    }
    this.interactRequested = true;
  };

  private readonly handleReset = (): void => {
    this.resetRun();
  };

  constructor(options: StorySystemOptions) {
    this.player = options.player;
    this.dialogue = options.dialogue;
  }

  init(context: GameContext): void {
    this.context = context;
    for (const id of STORY_NODE_ORDER) {
      const landmark = LANDMARKS[nodeLandmark(id)];
      this.nodePositions.set(
        id,
        new Vector3(landmark.x, context.world.sampleHeight(landmark.x, landmark.z), landmark.z),
      );
    }

    this.shardGroup = new Group();
    this.shardGroup.name = "story-shards";
    this.shardGeometry = new OctahedronGeometry(0.3, 0);
    this.shardGeometry.scale(1, 1.5, 1);
    this.shardMaterial = new MeshStandardMaterial({
      color: 0xbfd9ff,
      emissive: 0x7fb2ff,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    });
    context.scene.add(this.shardGroup);

    this.unsubs.push(context.events.on("game:reset", this.handleReset));
    this.unregisterStats = context.debug.registerStatSource(this.statSource);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.handleKeyDown);
    }
    this.resetRun();
  }

  update(deltaSeconds: number, _context: GameContext): void {
    if (!this.finishedEmitted) this.runElapsed += deltaSeconds;

    if (this.pendingIntro) {
      this.pendingIntro = false;
      this.emitDialogue(STORY.intro.lines, STORY.intro.speaker);
    }

    const snapshot = this.player.getPlayerSnapshot();
    if (this.step === "intro" && this.isWithinNode("flower", snapshot.position)) {
      this.step = "flower";
    }

    if (this.interactRequested) {
      this.interactRequested = false;
      this.interact();
    }

    this.updateShards(deltaSeconds, snapshot.position);

    if (this.endingTimer !== null) {
      this.endingTimer -= deltaSeconds;
      if (this.endingTimer <= 0) {
        this.endingTimer = null;
        this.finishedEmitted = true;
        this.context?.events.emit("game:finished", { elapsedSeconds: this.runElapsed });
      }
    }

    this.prompt = this.computePrompt(snapshot.position);
  }

  /** 玩家按 E（或调试触发）时的世界互动；对话打开时不响应世界互动。 */
  interact(): void {
    if (this.dialogue.isOpen || this.finishedEmitted || this.step === "finished") return;
    const snapshot = this.player.getPlayerSnapshot();
    for (const id of STORY_NODE_ORDER) {
      if (!this.isWithinNode(id, snapshot.position)) continue;
      if (this.completed.has(id) || this.interacted.has(id)) return;
      if (!this.prerequisitesMet(id)) return;
      this.completeInteraction(storyNode(id));
      return;
    }
  }

  getHudState(): StoryHudState {
    return {
      step: this.step,
      objective: this.currentObjective(),
      shardsCollected: this.collectedShards.size,
      shardTotal: STAR_SHARD_TOTAL,
      prompt: this.prompt,
      finished: this.finishedEmitted,
    };
  }

  /** 仅调试模式：按顺序直接完成节点并发放星屑，供 ?debug=1 与自动测试使用。 */
  debugCompleteNode(id: StoryNodeId): void {
    if (!this.context?.settings.debugEnabled) return;
    if (this.completed.has(id) || !this.prerequisitesMet(id)) return;
    if (!this.interacted.has(id)) this.completeInteraction(storyNode(id));
    const shardId = shardIdFor(id);
    if (this.activeShards.has(shardId)) this.collectShard(shardId);
  }

  dispose(): void {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this.handleKeyDown);
    }
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.unregisterStats?.();
    this.unregisterStats = null;
    this.clearShardMeshes();
    this.shardGeometry?.dispose();
    this.shardGeometry = null;
    this.shardMaterial?.dispose();
    this.shardMaterial = null;
    this.shardGroup?.removeFromParent();
    this.shardGroup = null;
    this.nodePositions.clear();
    this.context = null;
  }

  private resetRun(): void {
    this.step = "intro";
    this.completed.clear();
    this.interacted.clear();
    this.collectedShards.clear();
    this.clearShardMeshes();
    this.pendingIntro = true;
    this.interactRequested = false;
    this.runElapsed = 0;
    this.endingTimer = null;
    this.finishedEmitted = false;
    this.prompt = null;
  }

  private prerequisitesMet(id: StoryNodeId): boolean {
    return storyNode(id).requires.every((required) => this.completed.has(required));
  }

  private isWithinNode(id: StoryNodeId, point: { x: number; z: number }): boolean {
    const position = this.nodePositions.get(id);
    if (!position) return false;
    return distanceXZ(position, point) <= storyNode(id).interactionRadius;
  }

  private completeInteraction(node: StoryNode): void {
    this.interacted.add(node.id);
    const data = nodeData(node.id);
    this.emitDialogue(node.dialogue, data.speaker);
    this.spawnShard(node.id);
    if (data.completeOn === "interact") this.finishNode(node);
  }

  private finishNode(node: StoryNode): void {
    if (this.completed.has(node.id)) return;
    this.completed.add(node.id);
    const position = this.nodePositions.get(node.id);
    if (position && this.context) {
      this.context.events.emit("color:bloom", {
        position: position.clone(),
        radius: node.bloomRadius,
        duration: STORY.bloomDurationSeconds,
      });
    }
    this.context?.events.emit("story:completed", { nodeId: node.id });

    const index = STORY_NODE_ORDER.indexOf(node.id);
    const next = STORY_NODE_ORDER[index + 1];
    if (next !== undefined) {
      this.step = next;
    } else {
      this.step = "finished";
      this.endingTimer = STORY.ending.delaySeconds;
    }
  }

  private spawnShard(nodeId: StoryNodeId): void {
    const shardId = shardIdFor(nodeId);
    if (!this.shardGroup || !this.shardGeometry || !this.shardMaterial) return;
    if (this.activeShards.has(shardId) || this.collectedShards.has(shardId)) return;
    const landmarkPosition = this.nodePositions.get(nodeId);
    if (!landmarkPosition) return;
    const offset = nodeData(nodeId).shardOffset;
    const position = new Vector3(
      landmarkPosition.x + offset.x,
      landmarkPosition.y + SHARD_HOVER_HEIGHT,
      landmarkPosition.z + offset.z,
    );
    const mesh = new Mesh(this.shardGeometry, this.shardMaterial);
    mesh.name = shardId;
    mesh.position.copy(position);
    this.shardGroup.add(mesh);
    this.activeShards.set(shardId, {
      shardId,
      nodeId,
      mesh,
      position,
      baseY: position.y,
      phase: this.activeShards.size * 1.3,
    });
  }

  private updateShards(deltaSeconds: number, playerPosition: Vector3): void {
    for (const shard of [...this.activeShards.values()]) {
      shard.mesh.rotation.y += deltaSeconds * SHARD_SPIN_SPEED;
      shard.mesh.position.y =
        shard.baseY + Math.sin(this.runElapsed * 2.4 + shard.phase) * SHARD_BOB_AMPLITUDE;
      if (distanceXZ(shard.position, playerPosition) <= STORY.shardCollectRadius) {
        this.collectShard(shard.shardId);
      }
    }
  }

  private collectShard(shardId: ShardId): void {
    if (this.collectedShards.has(shardId)) return;
    const shard = this.activeShards.get(shardId);
    this.collectedShards.add(shardId);
    if (shard) {
      this.shardGroup?.remove(shard.mesh);
      this.activeShards.delete(shardId);
    }
    this.context?.events.emit("shard:collected", {
      shardId,
      total: this.collectedShards.size,
    });
    if (
      shardId === shardIdFor("tree") &&
      this.interacted.has("tree") &&
      !this.completed.has("tree")
    ) {
      this.finishNode(storyNode("tree"));
    }
  }

  private clearShardMeshes(): void {
    for (const shard of this.activeShards.values()) {
      this.shardGroup?.remove(shard.mesh);
    }
    this.activeShards.clear();
  }

  private emitDialogue(lines: readonly string[], speaker: string): void {
    this.context?.events.emit("dialogue:requested", { lines: [...lines], speaker });
  }

  private currentTargetId(): StoryNodeId | null {
    switch (this.step) {
      case "intro":
      case "flower":
        return "flower";
      case "stream":
        return "stream";
      case "tree":
        return "tree";
      case "finished":
        return null;
    }
  }

  private currentObjective(): string {
    if (this.finishedEmitted) return "";
    if (this.step === "finished") return STORY.ending.pendingObjective;
    if (this.step === "intro") return STORY.intro.objective;
    const target = this.currentTargetId();
    if (target === null) return STORY.intro.objective;
    const data = nodeData(target);
    if (this.interacted.has(target) && !this.completed.has(target)) return data.shardObjective;
    return data.objective;
  }

  private computePrompt(playerPosition: Vector3): string | null {
    if (this.dialogue.isOpen || this.finishedEmitted || this.step === "finished") return null;
    const target = this.currentTargetId();
    if (
      target !== null &&
      !this.completed.has(target) &&
      !this.interacted.has(target) &&
      this.isWithinNode(target, playerPosition)
    ) {
      return `${STORY.prompts.interactKey} · ${nodeData(target).interactLabel}`;
    }
    for (const id of STORY_NODE_ORDER) {
      if (this.completed.has(id) || this.interacted.has(id)) continue;
      if (this.prerequisitesMet(id)) continue;
      if (this.isWithinNode(id, playerPosition)) {
        return nodeData(id).lockedHint ?? null;
      }
    }
    return null;
  }

  private readonly statSource: DebugStatSource = {
    id: "story",
    read: () => ({
      step: this.step,
      shards: `${this.collectedShards.size}/${STAR_SHARD_TOTAL}`,
      target: this.currentTargetId() ?? "-",
      prompt: this.prompt ?? "-",
      elapsed: Number(this.runElapsed.toFixed(1)),
      activeShards: [...this.activeShards.keys()].join(", ") || "-",
      endingTimer: this.endingTimer === null ? "-" : Number(this.endingTimer.toFixed(2)),
    }),
  };
}
