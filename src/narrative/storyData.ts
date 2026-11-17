/**
 * 故事数据层（A4，PRD 8.3 / 9.6 / AC-12）。
 *
 * - story.json 只保存文本与规则；坐标、半径一律来自 config/world.ts，禁止第二套数字。
 * - 加载时做运行时校验：对话 ≤3 句、每句 ≤45 字、前置链与 STORY_NODE_ORDER 一致。
 * - UI 组件不直接读 JSON 里的坐标，也不写死任何剧情文本。
 */
import type { LandmarkId, ShardId, StoryNode, StoryNodeId } from "../core/contracts";
import { STORY_NODE_ORDER, STORY_NODE_SPATIAL } from "../config/world";
import rawStory from "./story.json";

export const MAX_DIALOGUE_LINES = 3;
export const MAX_LINE_CHARACTERS = 45;

export interface StoryNodeData {
  readonly title: string;
  readonly requires: readonly StoryNodeId[];
  readonly speaker: string;
  readonly dialogue: readonly string[];
  readonly objective: string;
  readonly shardObjective: string;
  readonly interactLabel: string;
  readonly lockedHint?: string;
  /** interact：按 E 即完成节点；shard：拾取该节点星屑后才算完成（PRD 5.4 花树）。 */
  readonly completeOn: "interact" | "shard";
  /** 星屑相对地标的偏移（米），不是另一套世界坐标。 */
  readonly shardOffset: { readonly x: number; readonly z: number };
}

export interface StoryData {
  readonly version: number;
  readonly shardCollectRadius: number;
  readonly bloomDurationSeconds: number;
  readonly intro: {
    readonly speaker: string;
    readonly lines: readonly string[];
    readonly objective: string;
  };
  readonly nodes: Readonly<Record<StoryNodeId, StoryNodeData>>;
  readonly ending: {
    readonly title: string;
    readonly lines: readonly string[];
    readonly pendingObjective: string;
    readonly delaySeconds: number;
    readonly restartLabel: string;
    readonly elapsedLabel: string;
  };
  readonly prompts: {
    readonly interactKey: string;
    readonly continueHint: string;
  };
}

function fail(message: string): never {
  throw new Error(`[story-data] ${message}`);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} 必须是非空字符串`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} 必须是有限数字`);
  return value;
}

function asLines(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${label} 必须是数组`);
  const lines = value.map((entry: unknown, index: number) => asString(entry, `${label}[${index}]`));
  if (lines.length < 1 || lines.length > MAX_DIALOGUE_LINES) {
    fail(`${label} 需要 1～${MAX_DIALOGUE_LINES} 句，实际 ${lines.length} 句`);
  }
  for (const line of lines) {
    if ([...line].length > MAX_LINE_CHARACTERS) {
      fail(`${label} 单句超过 ${MAX_LINE_CHARACTERS} 字：${line}`);
    }
  }
  return lines;
}

function asStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) fail(`${label} 必须是数组`);
  return value.map((entry: unknown, index: number) => asString(entry, `${label}[${index}]`));
}

function parseNode(raw: unknown, id: StoryNodeId, index: number): StoryNodeData {
  const record = asRecord(raw, `nodes.${id}`);
  const requires = asStringArray(record["requires"], `nodes.${id}.requires`);
  const previous = index === 0 ? undefined : STORY_NODE_ORDER[index - 1];
  const expected: readonly StoryNodeId[] = previous === undefined ? [] : [previous];
  if (requires.length !== expected.length || requires.some((entry, i) => entry !== expected[i])) {
    fail(`nodes.${id}.requires 必须与 STORY_NODE_ORDER 前置链一致：[${expected.join(", ")}]`);
  }
  const completeOn = asString(record["completeOn"], `nodes.${id}.completeOn`);
  if (completeOn !== "interact" && completeOn !== "shard") {
    fail(`nodes.${id}.completeOn 只能是 interact 或 shard`);
  }
  const offset = asRecord(record["shardOffset"], `nodes.${id}.shardOffset`);
  const offsetX = asNumber(offset["x"], `nodes.${id}.shardOffset.x`);
  const offsetZ = asNumber(offset["z"], `nodes.${id}.shardOffset.z`);
  if (Math.hypot(offsetX, offsetZ) > 3) fail(`nodes.${id}.shardOffset 离地标不得超过 3m`);
  const lockedHintRaw = record["lockedHint"];
  const lockedHint =
    lockedHintRaw === undefined ? undefined : asString(lockedHintRaw, `nodes.${id}.lockedHint`);
  const base: StoryNodeData = {
    title: asString(record["title"], `nodes.${id}.title`),
    requires: expected,
    speaker: asString(record["speaker"], `nodes.${id}.speaker`),
    dialogue: asLines(record["dialogue"], `nodes.${id}.dialogue`),
    objective: asString(record["objective"], `nodes.${id}.objective`),
    shardObjective: asString(record["shardObjective"], `nodes.${id}.shardObjective`),
    interactLabel: asString(record["interactLabel"], `nodes.${id}.interactLabel`),
    completeOn,
    shardOffset: { x: offsetX, z: offsetZ },
  };
  return lockedHint === undefined ? base : { ...base, lockedHint };
}

/** 校验并收敛外部 JSON；任何违反 PRD 约束的数据在加载期即抛错。 */
export function parseStoryData(raw: unknown): StoryData {
  const root = asRecord(raw, "story");
  const version = asNumber(root["version"], "version");
  if (version !== 1) fail(`不支持的故事数据版本：${version}`);

  const shardCollectRadius = asNumber(root["shardCollectRadius"], "shardCollectRadius");
  if (shardCollectRadius <= 0 || shardCollectRadius > 3)
    fail("shardCollectRadius 必须在 (0, 3] 米");
  const bloomDurationSeconds = asNumber(root["bloomDurationSeconds"], "bloomDurationSeconds");
  if (bloomDurationSeconds < 0.8 || bloomDurationSeconds > 1.5) {
    fail("bloomDurationSeconds 必须在 0.8～1.5 秒（PRD 9.1）");
  }

  const intro = asRecord(root["intro"], "intro");
  const nodesRaw = asRecord(root["nodes"], "nodes");
  const nodes = {} as Record<StoryNodeId, StoryNodeData>;
  STORY_NODE_ORDER.forEach((id, index) => {
    nodes[id] = parseNode(nodesRaw[id], id, index);
  });

  const ending = asRecord(root["ending"], "ending");
  const delaySeconds = asNumber(ending["delaySeconds"], "ending.delaySeconds");
  if (delaySeconds < 2 || delaySeconds > 3) fail("ending.delaySeconds 必须在 2～3 秒（PRD 9.6）");

  const prompts = asRecord(root["prompts"], "prompts");

  return {
    version,
    shardCollectRadius,
    bloomDurationSeconds,
    intro: {
      speaker: asString(intro["speaker"], "intro.speaker"),
      lines: asLines(intro["lines"], "intro.lines"),
      objective: asString(intro["objective"], "intro.objective"),
    },
    nodes,
    ending: {
      title: asString(ending["title"], "ending.title"),
      lines: asLines(ending["lines"], "ending.lines"),
      pendingObjective: asString(ending["pendingObjective"], "ending.pendingObjective"),
      delaySeconds,
      restartLabel: asString(ending["restartLabel"], "ending.restartLabel"),
      elapsedLabel: asString(ending["elapsedLabel"], "ending.elapsedLabel"),
    },
    prompts: {
      interactKey: asString(prompts["interactKey"], "prompts.interactKey"),
      continueHint: asString(prompts["continueHint"], "prompts.continueHint"),
    },
  };
}

export const STORY: StoryData = parseStoryData(rawStory);

/** 契约 StoryNode：文本来自 JSON，半径来自共享空间配置（PRD 8.3）。 */
export const STORY_NODES: readonly StoryNode[] = STORY_NODE_ORDER.map((id) => ({
  id,
  title: STORY.nodes[id].title,
  requires: [...STORY.nodes[id].requires],
  interactionRadius: STORY_NODE_SPATIAL[id].interactionRadius,
  bloomRadius: STORY_NODE_SPATIAL[id].bloomRadius,
  dialogue: [...STORY.nodes[id].dialogue],
}));

export function storyNode(id: StoryNodeId): StoryNode {
  const node = STORY_NODES.find((entry) => entry.id === id);
  if (!node) fail(`未知故事节点：${id}`);
  return node;
}

export function nodeData(id: StoryNodeId): StoryNodeData {
  return STORY.nodes[id];
}

export function nodeLandmark(id: StoryNodeId): LandmarkId {
  return STORY_NODE_SPATIAL[id].landmark;
}

export function shardIdFor(id: StoryNodeId): ShardId {
  return `shard-${id}`;
}

export function nodeIdFromShard(shardId: ShardId): StoryNodeId {
  return shardId.slice("shard-".length) as StoryNodeId;
}
