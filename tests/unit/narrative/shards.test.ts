/**
 * 星屑测试（AC-07）：靠近收集、同 ID 去重、计数准确、重置后可重新收集。
 */
import { afterEach, describe, expect, it } from "vitest";
import { STAR_SHARD_TOTAL } from "../../../src/config/world";
import { StorySystem } from "../../../src/narrative/StorySystem";
import { STORY, shardIdFor } from "../../../src/narrative/storyData";
import {
  StubDialogue,
  advanceAll,
  createTestBundle,
  eventLog,
  shardGroupChildren,
  shardWorldPosition,
} from "./helpers";
import type { TestBundle } from "./helpers";

interface Setup extends TestBundle {
  readonly story: StorySystem;
}

const setups: Setup[] = [];

function setup(): Setup {
  const bundle = createTestBundle();
  const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
  story.init(bundle.context);
  const result: Setup = { ...bundle, story };
  setups.push(result);
  return result;
}

afterEach(() => {
  for (const item of setups.splice(0)) item.story.dispose();
});

function interactAt(item: Setup, id: "flower" | "stream" | "tree"): void {
  item.player.moveToNode(id);
  item.story.update(1 / 60, item.context);
  item.story.interact();
}

describe("星屑收集与去重", () => {
  it("靠近即收集，HUD 计数立即更新；同一 ID 重复靠近只计一次", () => {
    const item = setup();
    const shards = eventLog(item.events, "shard:collected");
    interactAt(item, "flower");
    expect(shards).toHaveLength(0);
    expect(item.story.getHudState().shardsCollected).toBe(0);

    item.player.moveToShard("flower");
    item.story.update(1 / 60, item.context);
    expect(shards).toHaveLength(1);
    expect(shards[0]?.shardId).toBe(shardIdFor("flower"));
    expect(shards[0]?.total).toBe(1);
    expect(item.story.getHudState().shardsCollected).toBe(1);
    expect(item.story.getHudState().shardTotal).toBe(STAR_SHARD_TOTAL);
    expect(shardGroupChildren(item)).toBe(0);

    advanceAll([item.story], item.context, 0.5);
    item.player.moveToShard("flower");
    item.story.update(1 / 60, item.context);
    expect(shards).toHaveLength(1);
    expect(item.story.getHudState().shardsCollected).toBe(1);
  });

  it("收集半径边界：半径外不收集，半径内收集", () => {
    const item = setup();
    const shards = eventLog(item.events, "shard:collected");
    interactAt(item, "flower");
    const shard = shardWorldPosition("flower");

    item.player.moveTo(shard.x + STORY.shardCollectRadius + 0.3, shard.z);
    item.story.update(1 / 60, item.context);
    expect(shards).toHaveLength(0);

    item.player.moveTo(shard.x + STORY.shardCollectRadius - 0.1, shard.z);
    item.story.update(1 / 60, item.context);
    expect(shards).toHaveLength(1);
  });

  it("三枚星屑依次收集，总数精确到 3/3", () => {
    const item = setup();
    const shards = eventLog(item.events, "shard:collected");
    for (const id of ["flower", "stream", "tree"] as const) {
      interactAt(item, id);
      item.player.moveToShard(id);
      item.story.update(1 / 60, item.context);
    }
    expect(shards.map((entry) => entry.shardId)).toEqual([
      "shard-flower",
      "shard-stream",
      "shard-tree",
    ]);
    expect(shards.map((entry) => entry.total)).toEqual([1, 2, 3]);
    expect(item.story.getHudState().shardsCollected).toBe(3);
    expect(shardGroupChildren(item)).toBe(0);
  });

  it("未互动的节点不会提前出现星屑", () => {
    const item = setup();
    item.story.update(1 / 60, item.context);
    item.player.moveToShard("stream");
    item.story.update(1 / 60, item.context);
    expect(shardGroupChildren(item)).toBe(0);
    expect(item.story.getHudState().shardsCollected).toBe(0);
  });

  it("重置后星屑清零，可再收集且计数从 1 重新开始", () => {
    const item = setup();
    const shards = eventLog(item.events, "shard:collected");
    interactAt(item, "flower");
    item.player.moveToShard("flower");
    item.story.update(1 / 60, item.context);
    expect(item.story.getHudState().shardsCollected).toBe(1);

    item.events.emit("game:reset");
    expect(item.story.getHudState().shardsCollected).toBe(0);
    expect(shardGroupChildren(item)).toBe(0);

    interactAt(item, "flower");
    item.player.moveToShard("flower");
    item.story.update(1 / 60, item.context);
    expect(shards.map((entry) => entry.total)).toEqual([1, 1]);
    expect(item.story.getHudState().shardsCollected).toBe(1);
  });
});
