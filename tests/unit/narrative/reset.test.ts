/**
 * 完整重置测试（AC-08）：不刷新页面重玩，无残留任务标记、星屑、结局倒计时。
 */
import { afterEach, describe, expect, it } from "vitest";
import { StorySystem } from "../../../src/narrative/StorySystem";
import { STORY } from "../../../src/narrative/storyData";
import {
  StubDialogue,
  advanceAll,
  createTestBundle,
  eventLog,
  shardGroupChildren,
} from "./helpers";
import type { TestBundle } from "./helpers";

interface Setup extends TestBundle {
  readonly story: StorySystem;
}

const setups: Setup[] = [];

function setup(debug = false): Setup {
  const bundle = createTestBundle({ debug });
  const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
  story.init(bundle.context);
  const result: Setup = { ...bundle, story };
  setups.push(result);
  return result;
}

afterEach(() => {
  for (const item of setups.splice(0)) item.story.dispose();
});

describe("game:reset 完整重置", () => {
  it("中途重置：步骤回到 intro、星屑清零、网格清空、开场对话重新发出", () => {
    const item = setup();
    const dialogues = eventLog(item.events, "dialogue:requested");
    const shards = eventLog(item.events, "shard:collected");

    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.player.moveToShard("flower");
    item.story.update(1 / 60, item.context);
    expect(item.story.getHudState().step).toBe("stream");
    expect(item.story.getHudState().shardsCollected).toBe(1);
    const dialoguesBefore = dialogues.length;

    item.events.emit("game:reset");
    const state = item.story.getHudState();
    expect(state.step).toBe("intro");
    expect(state.shardsCollected).toBe(0);
    expect(state.finished).toBe(false);
    expect(state.objective).toBe(STORY.intro.objective);
    expect(shardGroupChildren(item)).toBe(0);

    item.story.update(1 / 60, item.context);
    expect(dialogues.length).toBe(dialoguesBefore + 1);
    expect(dialogues.at(-1)?.lines).toEqual([...STORY.intro.lines]);
    expect(shards).toHaveLength(1); // 重置本身不伪造收集事件
  });

  it("结局倒计时中重置：不再发出 game:finished", () => {
    const item = setup(true);
    const finished = eventLog(item.events, "game:finished");
    item.story.debugCompleteNode("flower");
    item.story.debugCompleteNode("stream");
    item.story.debugCompleteNode("tree");
    advanceAll([item.story], item.context, 1);
    expect(item.story.getHudState().step).toBe("finished");

    item.events.emit("game:reset");
    advanceAll([item.story], item.context, STORY.ending.delaySeconds + 1);
    expect(finished).toHaveLength(0);
    expect(item.story.getHudState().step).toBe("intro");
  });

  it("重置后可以完整二次通关：星屑重新计数、结局再次触发", () => {
    const item = setup(true);
    const shards = eventLog(item.events, "shard:collected");
    const finished = eventLog(item.events, "game:finished");

    item.story.debugCompleteNode("flower");
    item.story.debugCompleteNode("stream");
    item.story.debugCompleteNode("tree");
    advanceAll([item.story], item.context, STORY.ending.delaySeconds + 0.2);
    expect(finished).toHaveLength(1);

    item.events.emit("game:reset");
    expect(item.story.getHudState().shardsCollected).toBe(0);

    item.story.debugCompleteNode("flower");
    item.story.debugCompleteNode("stream");
    item.story.debugCompleteNode("tree");
    advanceAll([item.story], item.context, STORY.ending.delaySeconds + 0.2);

    expect(shards.map((entry) => entry.total)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(finished).toHaveLength(2);
    expect(item.story.getHudState().shardsCollected).toBe(3);
    expect(item.story.getHudState().finished).toBe(true);
  });

  it("重置后旧节点仍可正常重新互动（非调试路径）", () => {
    const item = setup();
    const completed = eventLog(item.events, "story:completed");
    item.player.moveToNode("flower");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    item.events.emit("game:reset");
    item.story.update(1 / 60, item.context);
    item.story.interact();
    expect(completed.map((entry) => entry.nodeId)).toEqual(["flower", "flower"]);
    expect(item.story.getHudState().step).toBe("stream");
  });
});
