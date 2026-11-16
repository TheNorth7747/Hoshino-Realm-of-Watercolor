/**
 * 故事数据层测试（AC-12：文本/规则数据化，坐标单一来源）。
 */
import { describe, expect, it } from "vitest";
import { LANDMARKS, STORY_NODE_ORDER, STORY_NODE_SPATIAL } from "../../../src/config/world";
import {
  MAX_DIALOGUE_LINES,
  MAX_LINE_CHARACTERS,
  STORY,
  STORY_NODES,
  nodeLandmark,
  parseStoryData,
  shardIdFor,
} from "../../../src/narrative/storyData";
import rawStory from "../../../src/narrative/story.json";

function mutableClone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(STORY)) as Record<string, unknown>;
}

function nodeRecord(raw: Record<string, unknown>, id: string): Record<string, unknown> {
  const nodes = raw["nodes"] as Record<string, unknown>;
  return nodes[id] as Record<string, unknown>;
}

describe("story.json 数据约束", () => {
  it("随包数据通过校验，节点顺序与共享配置一致", () => {
    expect(STORY.version).toBe(1);
    expect(STORY_NODES.map((node) => node.id)).toEqual([...STORY_NODE_ORDER]);
  });

  it("每个节点对话不超过 3 句、每句不超过 45 字", () => {
    const allLines = [
      STORY.intro.lines,
      ...STORY_NODES.map((node) => node.dialogue),
      STORY.ending.lines,
    ];
    for (const lines of allLines) {
      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(lines.length).toBeLessThanOrEqual(MAX_DIALOGUE_LINES);
      for (const line of lines) {
        expect([...line].length).toBeLessThanOrEqual(MAX_LINE_CHARACTERS);
      }
    }
  });

  it("StoryNode 半径取自共享空间配置，JSON 不保存另一套坐标", () => {
    for (const node of STORY_NODES) {
      const spatial = STORY_NODE_SPATIAL[node.id];
      expect(node.interactionRadius).toBe(spatial.interactionRadius);
      expect(node.bloomRadius).toBe(spatial.bloomRadius);
      expect(nodeLandmark(node.id)).toBe(spatial.landmark);
      const landmark = LANDMARKS[spatial.landmark];
      expect(landmark.triggerRadius).toBe(spatial.interactionRadius);
    }
    const rawNodes = (rawStory as { nodes: Record<string, Record<string, unknown>> }).nodes;
    for (const id of STORY_NODE_ORDER) {
      const keys = Object.keys(rawNodes[id] ?? {});
      for (const forbidden of ["position", "coordinates", "x", "z", "landmark", "center"]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("前置链与 STORY_NODE_ORDER 一致，星屑 ID 与节点一一对应", () => {
    expect(STORY.nodes.flower.requires).toEqual([]);
    expect(STORY.nodes.stream.requires).toEqual(["flower"]);
    expect(STORY.nodes.tree.requires).toEqual(["stream"]);
    expect(shardIdFor("flower")).toBe("shard-flower");
    expect(shardIdFor("tree")).toBe("shard-tree");
  });
});

describe("parseStoryData 拒绝违规数据", () => {
  it("对话超过 3 句", () => {
    const raw = mutableClone();
    nodeRecord(raw, "flower")["dialogue"] = ["一", "二", "三", "四"];
    expect(() => parseStoryData(raw)).toThrow(/1～3 句/);
  });

  it("单句超过 45 字", () => {
    const raw = mutableClone();
    nodeRecord(raw, "flower")["dialogue"] = ["星".repeat(MAX_LINE_CHARACTERS + 1)];
    expect(() => parseStoryData(raw)).toThrow(/45 字/);
  });

  it("前置链被篡改", () => {
    const raw = mutableClone();
    nodeRecord(raw, "stream")["requires"] = [];
    expect(() => parseStoryData(raw)).toThrow(/前置链/);
  });

  it("缺少节点", () => {
    const raw = mutableClone();
    delete (raw["nodes"] as Record<string, unknown>)["tree"];
    expect(() => parseStoryData(raw)).toThrow();
  });

  it("completeOn 非法", () => {
    const raw = mutableClone();
    nodeRecord(raw, "tree")["completeOn"] = "battle";
    expect(() => parseStoryData(raw)).toThrow(/completeOn/);
  });

  it("结局延迟超出 2～3 秒", () => {
    const raw = mutableClone();
    (raw["ending"] as Record<string, unknown>)["delaySeconds"] = 5;
    expect(() => parseStoryData(raw)).toThrow(/2～3 秒/);
  });

  it("星屑偏移过远（防止另一套坐标 drift）", () => {
    const raw = mutableClone();
    nodeRecord(raw, "flower")["shardOffset"] = { x: 20, z: 0 };
    expect(() => parseStoryData(raw)).toThrow(/3m/);
  });

  it("版本不支持", () => {
    const raw = mutableClone();
    raw["version"] = 2;
    expect(() => parseStoryData(raw)).toThrow(/版本/);
  });
});
