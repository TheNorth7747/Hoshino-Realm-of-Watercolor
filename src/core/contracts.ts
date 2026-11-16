/**
 * 共享契约（A0 独占，PRD 第 8 节 + 7.2 节）。
 *
 * 规则：
 * - 这里只放“跨模块语义”，不放实现。实现分别落在 rendering / player / world / narrative / companion / effects。
 * - 已有字段语义不得改变；可以新增可选字段或新接口，但必须先由集成者审查。
 * - 全文件禁止 `any`；不确定的外部数据用 `unknown` 并显式收敛。
 */
import type { Group, PerspectiveCamera, Scene, Texture, Vector3, WebGLRenderer } from "three";

/* ============================================================================
 * 8.1 染色接口（A1 实现，A3 场景/A5 VFX 只读消费）
 * ========================================================================== */

export interface ColorRevealMask {
  readonly texture: Texture;
  update(deltaSeconds: number, playerPosition: Vector3): void;
  stamp(worldPosition: Vector3, radius: number, strength?: number): void;
  reset(): void;
  dispose(): void;
}

/* ============================================================================
 * 8.2 玩家快照（A2 实现，A1/A4 只读消费）
 * ========================================================================== */

export interface PlayerSnapshot {
  readonly position: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly grounded: boolean;
}

/**
 * 建议契约：A2 的控制器实现此接口，A4 的伙伴与故事系统依赖接口而不是具体类。
 * 这样 A2/A4 可以在没有对方实现时用测试替身互相验证。
 */
export interface PlayerSource {
  getPlayerSnapshot(): PlayerSnapshot;
}

/* ============================================================================
 * 8.3 故事节点数据（A4 拥有文本与状态机，坐标只来自 config/world.ts）
 * ========================================================================== */

export type StoryNodeId = "flower" | "stream" | "tree";

export interface StoryNode {
  id: StoryNodeId;
  title: string;
  requires: StoryNodeId[];
  interactionRadius: number;
  bloomRadius: number;
  dialogue: string[];
}

/** 任务单向推进：intro → flower → stream → tree → finished（PRD 9.6）。 */
export type StoryStep = "intro" | StoryNodeId | "finished";

/** 星屑 ID 与故事节点一一对应，保证“同一 ID 只计数一次”。 */
export type ShardId = `shard-${StoryNodeId}`;

/* ============================================================================
 * 8.4 离散事件（发送方/接收方见 PRD 表格）
 * ========================================================================== */

export interface StoryCompletedPayload {
  readonly nodeId: StoryNodeId;
}

export interface ColorBloomPayload {
  readonly position: Vector3;
  readonly radius: number;
  readonly duration: number;
}

export interface ShardCollectedPayload {
  readonly shardId: ShardId;
  readonly total: number;
}

export interface DialogueRequestedPayload {
  readonly lines: readonly string[];
  readonly speaker: string;
}

export interface GameFinishedPayload {
  readonly elapsedSeconds: number;
}

/** `game:reset` 无载荷，因此类型为 undefined。 */
export type GameResetPayload = undefined;

export interface GameEvents {
  readonly "story:completed": StoryCompletedPayload;
  readonly "color:bloom": ColorBloomPayload;
  readonly "shard:collected": ShardCollectedPayload;
  readonly "dialogue:requested": DialogueRequestedPayload;
  readonly "game:finished": GameFinishedPayload;
  readonly "game:reset": GameResetPayload;
}

export type EventHandler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

/** 无载荷事件不传参，有载荷事件必须传载荷。 */
export type EmitArgs<K extends keyof GameEvents> = GameEvents[K] extends undefined
  ? []
  : [payload: GameEvents[K]];

export type Unsubscribe = () => void;

export interface EventBusLike {
  on<K extends keyof GameEvents>(type: K, handler: EventHandler<K>): Unsubscribe;
  once<K extends keyof GameEvents>(type: K, handler: EventHandler<K>): Unsubscribe;
  off<K extends keyof GameEvents>(type: K, handler: EventHandler<K>): void;
  emit<K extends keyof GameEvents>(type: K, ...args: EmitArgs<K>): void;
  listenerCount(type?: keyof GameEvents): number;
  clear(): void;
}

/* ============================================================================
 * 世界坐标（数值在 config/world.ts，这里只定义形状）
 * ========================================================================== */

export interface WorldBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export type TerrainHeightSampler = (x: number, z: number) => number;

export interface WorldRuntimeInfo {
  readonly bounds: WorldBounds;
  readonly sampleHeight: TerrainHeightSampler;
}

export type LandmarkId = "spawn" | "flower" | "stream" | "tree" | "lookout";

export interface LandmarkDefinition {
  readonly id: LandmarkId;
  readonly label: string;
  readonly x: number;
  readonly z: number;
  readonly triggerRadius: number;
}

/* ============================================================================
 * 引擎设置与调试
 * ========================================================================== */

export interface EngineSettings {
  readonly appName: string;
  /** 单帧最大 delta，避免切回页面时角色瞬移（PRD 7.3）。 */
  readonly maxDeltaSeconds: number;
  /** 渲染 DPR 上限（PRD 11.1）。 */
  readonly dprCap: number;
  /** 染色遮罩分辨率（PRD 9.1）。 */
  readonly maskResolution: number;
  readonly clearColor: number;
  readonly debugEnabled: boolean;
}

export type DebugValue = string | number | boolean;

export interface DebugStatSource {
  readonly id: string;
  read(): Readonly<Record<string, DebugValue>>;
}

export interface DebugSnapshot {
  readonly enabled: boolean;
  readonly running: boolean;
  readonly elapsedSeconds: number;
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly systems: readonly string[];
  readonly errorCount: number;
}

export interface DebugApi {
  readonly enabled: boolean;
  log(message: string, detail?: unknown): void;
  reportError(error: unknown, context?: string): void;
  registerStatSource(source: DebugStatSource): Unsubscribe;
  readStats(): Readonly<Record<string, DebugValue>>;
  snapshot(): DebugSnapshot;
  readonly errorMessages: readonly string[];
}

/* ============================================================================
 * 系统生命周期与挂载点（A1～A5 的唯一接入方式）
 * ========================================================================== */

/**
 * 每帧执行顺序（PRD 7.3）：
 * 输入 → 玩家移动 → 伙伴跟随 → 故事/触发器 → 染色遮罩 → VFX → 镜头 → 渲染 → 调试统计。
 * Game 按此数组排序执行，注册顺序不影响阶段顺序。
 */
export const SYSTEM_PHASES = [
  "input",
  "player",
  "companion",
  "story",
  "reveal",
  "effects",
  "camera",
] as const;

export type SystemPhase = (typeof SYSTEM_PHASES)[number];

export function systemPhaseIndex(phase: SystemPhase): number {
  return SYSTEM_PHASES.indexOf(phase);
}

export interface GameContext {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly events: EventBusLike;
  readonly debug: DebugApi;
  readonly settings: EngineSettings;
  readonly world: WorldRuntimeInfo;
  /** 原生 HTML 覆盖层，A4 的 HUD/对话框挂在这里。 */
  readonly uiRoot: HTMLElement;
  /** 空的世界根节点，A3 的场景对象挂在这里；A1 的材质从这里取世界坐标。 */
  readonly worldRoot: Group;
}

/**
 * 模块系统。`reset` 不提供方法：重置统一由 `game:reset` 事件驱动，
 * 避免“事件 + 方法”双触发导致重复清理（PRD 8.4）。
 */
export interface GameSystem {
  readonly id: string;
  readonly phase: SystemPhase;
  init?(context: GameContext): void;
  update?(deltaSeconds: number, context: GameContext): void;
  resize?(width: number, height: number): void;
  dispose?(): void;
}

export interface SystemRegistry {
  registerSystem(system: GameSystem): void;
  getSystem<T extends GameSystem = GameSystem>(id: string): T | undefined;
  readonly systems: readonly GameSystem[];
}

/* ============================================================================
 * 调试桥（供 ?debug=1 与 Playwright 使用）
 * ========================================================================== */

export interface StarwaterBridge {
  readonly version: string;
  readonly game: {
    readonly isRunning: boolean;
    getSnapshot(): DebugSnapshot;
    reset(): void;
    getSystem(id: string): GameSystem | undefined;
    readonly events: EventBusLike;
  };
}
