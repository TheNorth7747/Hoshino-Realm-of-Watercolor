/**
 * 故事状态机测试（AC-06 / 08 / 12）：单向推进、前置条件、幂等、结局延迟、完整重置。
 */
import { afterEach, describe, expect, it } from "vitest";
import { LANDMARKS, STORY_NODE_SPATIAL } from "../../../src/config/world";
import { StorySystem } from "../../../src/narrative/StorySystem";
import type { DialogueController } from "../../../src/narrative/StorySystem";
import { STORY, nodeData } from "../../../src/narrative/storyData";
import {
  FakePlayerSource,
  StubDialogue,
  advanceAll,
  createTestBundle,
  eventLog,
  shardGroupChildren,
} from "./helpers";
import type { TestBundle } from "./helpers";

interface Setup extends TestBundle {
  readonly story: StorySystem;
  readonly dialogue: DialogueController;
}

const setups: Setup[] = [];

function setup(options?: { readonly debug?: boolean; readonly dialogue?: StubDialogue }): Setup {
  const bundle = createTestBundle({ debug: options?.debug === true });
  const dialogue = options?.dialogue ?? new StubDialogue();
  const story = new StorySystem({ player: bundle.player, dialogue });
  story.init(bundle.context);
  const result: Setup = { ...bundle, story, dialogue };
  setups.push(result);
  return result;
}

afterEach(() => {
  for (const item of setups.splice(0)) item.story.dispose();
});

function completeFlowerAndStream(item: Setup): void {
  item.player.moveToNode("flower");
  item.story.update(1 / 60, item.context);
  item.story.interact();
  item.player.moveToNode("stream");
  item.story.update(1 / 60, item.context);
  item.story.interact();
}

describe("单向状态机 intro → flower → stream → tree → finished", () => {
  it("首帧发出开场对话；进入蓝花坡范围后 intro → flower", () => {
    const item = setup();
    const dialogues = eventLog(item.events, "dialogue:requested");
    expect(item.story.getHudState().step).toBe("intro");
    expect(item.story.getHudState().objective).toBe(STORY.intro.objective);

    item.story.update(1 / 60, item.context);
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0]?.lines).toEqual([...STORY.intro.lines]);
    expect(dialogues[0]?.speaker).toBe(STORY.intro.speaker);
    expect(item.story.getHudState().step).toBe("intro");

    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    expect(item.story.getHudState().step).toBe("flower");
    expect(item.story.getHudState().objective).toBe(nodeData("flower").objective);
  });

  it("按 E 完成 flower：染色、完成、对话事件齐备，星屑出现，目标推进到 stream", () => {
    const item = setup();
    const blooms = eventLog(item.events, "color:bloom");
    const completed = eventLog(item.events, "story:completed");
    const dialogues = eventLog(item.events, "dialogue:requested");

    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();

    expect(completed.map((entry) => entry.nodeId)).toEqual(["flower"]);
    expect(blooms).toHaveLength(1);
    const bloom = blooms[0];
    expect(bloom?.radius).toBe(STORY_NODE_SPATIAL.flower.bloomRadius);
    expect(bloom?.duration).toBe(STORY.bloomDurationSeconds);
    expect(bloom?.position.x).toBe(LANDMARKS.flower.x);
    expect(bloom?.position.z).toBe(LANDMARKS.flower.z);
    expect(dialogues.at(-1)?.lines).toEqual([...nodeData("flower").dialogue]);
    expect(shardGroupChildren(item)).toBe(1);
    expect(item.story.getHudState().step).toBe("stream");
    expect(item.story.getHudState().objective).toBe(nodeData("stream").objective);
    item.story.update(1 / 60, item.context);
    expect(item.story.getHudState().prompt).toBeNull();
  });

  it("范围外按 E 不触发任何节点", () => {
    const item = setup();
    const completed = eventLog(item.events, "story:completed");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    expect(completed).toHaveLength(0);
    expect(item.story.getHudState().step).toBe("intro");
  });

  it("前置未满足时 stream 锁定：不完成、提示锁定文案", () => {
    const item = setup();
    const completed = eventLog(item.events, "story:completed");
    item.player.moveToNode("stream");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.story.update(1 / 60, item.context);
    expect(completed).toHaveLength(0);
    expect(item.story.getHudState().prompt).toBe(nodeData("stream").lockedHint);
  });

  it("对话打开时按 E 不触发世界互动", () => {
    const item = setup({ dialogue: new StubDialogue(true) });
    const completed = eventLog(item.events, "story:completed");
    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    expect(completed).toHaveLength(0);
  });

  it("tree 按 E 后只出现星屑与对话；拾取星屑 3 才染色并进入结局倒计时", () => {
    const item = setup();
    const blooms = eventLog(item.events, "color:bloom");
    const completed = eventLog(item.events, "story:completed");
    const finished = eventLog(item.events, "game:finished");
    const shards = eventLog(item.events, "shard:collected");

    completeFlowerAndStream(item);
    item.player.moveToNode("tree");
    item.story.update(1 / 60, item.context);
    item.story.interact();

    expect(completed.map((entry) => entry.nodeId)).toEqual(["flower", "stream"]);
    expect(blooms).toHaveLength(2);
    expect(item.story.getHudState().step).toBe("tree");
    expect(item.story.getHudState().objective).toBe(nodeData("tree").shardObjective);
    expect(shardGroupChildren(item)).toBe(3);

    item.player.moveToShard("tree");
    item.story.update(1 / 60, item.context);

    expect(shards.map((entry) => entry.shardId)).toEqual(["shard-tree"]);
    expect(completed.map((entry) => entry.nodeId)).toEqual(["flower", "stream", "tree"]);
    expect(blooms).toHaveLength(3);
    expect(blooms[2]?.radius).toBe(STORY_NODE_SPATIAL.tree.bloomRadius);
    expect(item.story.getHudState().step).toBe("finished");
    expect(item.story.getHudState().objective).toBe(STORY.ending.pendingObjective);
    expect(finished).toHaveLength(0);

    advanceAll([item.story], item.context, STORY.ending.delaySeconds - 0.2);
    expect(finished).toHaveLength(0);
    advanceAll([item.story], item.context, 0.4);
    expect(finished).toHaveLength(1);
    expect(finished[0]?.elapsedSeconds).toBeGreaterThan(0);
    expect(item.story.getHudState().finished).toBe(true);
    expect(item.story.getHudState().objective).toBe("");
  });
});

describe("重复触发幂等", () => {
  it("同一节点连续按 E 只完成一次、只发一枚星屑、只播一次对话", () => {
    const item = setup();
    const blooms = eventLog(item.events, "color:bloom");
    const completed = eventLog(item.events, "story:completed");
    const dialogues = eventLog(item.events, "dialogue:requested");

    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    for (let press = 0; press < 5; press += 1) item.story.interact();

    expect(completed).toHaveLength(1);
    expect(blooms).toHaveLength(1);
    expect(dialogues).toHaveLength(2); // intro + flower
    expect(shardGroupChildren(item)).toBe(1);
  });

  it("走回头路再按 E 不重播对话、不重复推进", () => {
    const item = setup();
    const completed = eventLog(item.events, "story:completed");
    const dialogues = eventLog(item.events, "dialogue:requested");

    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.player.moveTo(0, 32);
    item.story.update(1 / 60, item.context);
    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.story.update(1 / 60, item.context);

    expect(completed).toHaveLength(1);
    expect(dialogues).toHaveLength(2);
    expect(item.story.getHudState().step).toBe("stream");
    expect(item.story.getHudState().prompt).toBeNull();
  });

  it("tree 互动后重复按 E 不重复生成星屑", () => {
    const item = setup();
    completeFlowerAndStream(item);
    item.player.moveToNode("tree");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.story.interact();
    item.story.interact();
    expect(shardGroupChildren(item)).toBe(3);
  });
});

describe("调试触发（?debug=1）", () => {
  it("非调试模式 debugCompleteNode 无效", () => {
    const item = setup();
    const completed = eventLog(item.events, "story:completed");
    item.story.debugCompleteNode("flower");
    expect(completed).toHaveLength(0);
  });

  it("调试模式按顺序触发三节点直达结局，且重复点击幂等", () => {
    const item = setup({ debug: true });
    const completed = eventLog(item.events, "story:completed");
    const shards = eventLog(item.events, "shard:collected");
    const finished = eventLog(item.events, "game:finished");

    item.story.debugCompleteNode("tree"); // 乱序：无效
    expect(completed).toHaveLength(0);

    item.story.debugCompleteNode("flower");
    item.story.debugCompleteNode("flower");
    item.story.debugCompleteNode("stream");
    item.story.debugCompleteNode("tree");
    item.story.debugCompleteNode("tree");

    expect(completed.map((entry) => entry.nodeId)).toEqual(["flower", "stream", "tree"]);
    expect(shards.map((entry) => entry.total)).toEqual([1, 2, 3]);
    advanceAll([item.story], item.context, STORY.ending.delaySeconds + 0.2);
    expect(finished).toHaveLength(1);
  });
});

describe("dispose 释放", () => {
  it("dispose 后监听器、星屑网格与调试统计全部移除", () => {
    const bundle = createTestBundle();
    const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
    story.init(bundle.context);
    expect(bundle.events.listenerCount()).toBeGreaterThan(0);
    expect(bundle.scene.getObjectByName("story-shards")).toBeDefined();

    story.dispose();
    expect(bundle.events.listenerCount()).toBe(0);
    expect(bundle.scene.getObjectByName("story-shards")).toBeUndefined();
    expect(bundle.context.debug.readStats()["story.step"]).toBeUndefined();
  });
});

describe("FakePlayerSource 契约", () => {
  it("快照只读消费，位置来自共享出生点", () => {
    const player = new FakePlayerSource();
    const snapshot = player.getPlayerSnapshot();
    expect(snapshot.position.z).toBe(32);
    expect(snapshot.grounded).toBe(true);
  });
});
