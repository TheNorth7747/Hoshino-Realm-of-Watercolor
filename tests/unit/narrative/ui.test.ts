/**
 * UI 测试（AC-06 / 07 / 08 / 12）：HUD、互动提示、对话框、结局、重置、调试面板。
 * 使用最小 DOM 替身；文本断言全部对照 story.json 数据，验证 UI 不写死剧情。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorySystem } from "../../../src/narrative/StorySystem";
import { createNarrativeSystems } from "../../../src/narrative";
import { STORY, nodeData } from "../../../src/narrative/storyData";
import { HUD } from "../../../src/ui/HUD";
import { DialogueBox } from "../../../src/ui/DialogueBox";
import { EndingOverlay } from "../../../src/ui/EndingOverlay";
import { DebugPanel } from "../../../src/ui/DebugPanel";
import {
  type FakeElement,
  FakeDocument,
  StubDialogue,
  advanceAll,
  createTestBundle,
  eventLog,
} from "./helpers";
import type { TestBundle } from "./helpers";

beforeEach(() => {
  vi.stubGlobal("document", new FakeDocument());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeDocument(): FakeDocument {
  return document as unknown as FakeDocument;
}

function uiNode(bundle: TestBundle, className: string): FakeElement {
  const node = bundle.uiRoot.findByClass(className);
  if (!node) throw new Error(`UI 缺少 .${className}`);
  return node;
}

describe("HUD", () => {
  it("显示当前目标与星屑 0/3，事件后计数与目标同步更新", () => {
    const bundle = createTestBundle();
    const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
    const hud = new HUD(story);
    story.init(bundle.context);
    hud.init(bundle.context);

    expect(uiNode(bundle, "sw-hud__objective").textContent).toBe(STORY.intro.objective);
    expect(uiNode(bundle, "sw-hud__shards").textContent).toBe("✦ 0/3");

    bundle.player.moveToNode("flower");
    advanceAll([story, hud], bundle.context, 0.1);
    expect(uiNode(bundle, "sw-prompt").hidden).toBe(false);
    expect(uiNode(bundle, "sw-prompt").textContent).toBe(
      `${STORY.prompts.interactKey} · ${nodeData("flower").interactLabel}`,
    );

    story.interact();
    bundle.player.moveToShard("flower");
    advanceAll([story, hud], bundle.context, 0.1);
    expect(uiNode(bundle, "sw-hud__shards").textContent).toBe("✦ 1/3");
    expect(uiNode(bundle, "sw-hud__objective").textContent).toBe(nodeData("stream").objective);
    expect(uiNode(bundle, "sw-prompt").hidden).toBe(true);

    story.dispose();
    hud.dispose();
    expect(bundle.uiRoot.children).toHaveLength(0);
    expect(fakeDocument().head.children).toHaveLength(0);
  });
});

describe("DialogueBox", () => {
  it("dialogue:requested 打开，逐句推进，末句后关闭", () => {
    const bundle = createTestBundle();
    const box = new DialogueBox();
    box.init(bundle.context);
    const root = uiNode(bundle, "sw-dialogue");
    expect(root.hidden).toBe(true);

    bundle.events.emit("dialogue:requested", { lines: ["第一句", "第二句"], speaker: "团仔" });
    expect(box.isOpen).toBe(true);
    expect(root.hidden).toBe(false);
    expect(uiNode(bundle, "sw-dialogue__speaker").textContent).toBe("团仔");
    expect(uiNode(bundle, "sw-dialogue__line").textContent).toBe("第一句");
    expect(uiNode(bundle, "sw-dialogue__progress").textContent).toBe("1/2");

    box.advance();
    expect(uiNode(bundle, "sw-dialogue__line").textContent).toBe("第二句");
    box.advance();
    expect(box.isOpen).toBe(false);
    expect(root.hidden).toBe(true);

    box.dispose();
  });

  it("点击推进；game:reset 与 game:finished 关闭对话", () => {
    const bundle = createTestBundle();
    const box = new DialogueBox();
    box.init(bundle.context);
    const root = uiNode(bundle, "sw-dialogue");

    bundle.events.emit("dialogue:requested", { lines: ["甲", "乙", "丙"], speaker: "团仔" });
    root.click();
    expect(uiNode(bundle, "sw-dialogue__line").textContent).toBe("乙");
    bundle.events.emit("game:reset");
    expect(box.isOpen).toBe(false);

    bundle.events.emit("dialogue:requested", { lines: ["甲"], speaker: "团仔" });
    bundle.events.emit("game:finished", { elapsedSeconds: 1 });
    expect(box.isOpen).toBe(false);

    box.dispose();
  });

  it("对话打开时 StorySystem 的 E 互动被屏蔽（真实 DialogueBox 仲裁）", () => {
    const bundle = createTestBundle();
    const box = new DialogueBox();
    const story = new StorySystem({ player: bundle.player, dialogue: box });
    box.init(bundle.context);
    story.init(bundle.context);
    const completed = eventLog(bundle.events, "story:completed");

    bundle.player.moveToNode("flower");
    story.update(1 / 60, bundle.context);
    while (box.isOpen) box.advance(); // 先关闭开场对话
    story.interact();
    expect(box.isOpen).toBe(true);
    expect(completed).toHaveLength(1);

    story.interact(); // 对话仍打开：不重复触发
    expect(completed).toHaveLength(1);
    box.advance();
    box.advance();
    box.advance();
    expect(box.isOpen).toBe(false);

    story.dispose();
    box.dispose();
  });
});

describe("EndingOverlay", () => {
  it("game:finished 后显示结局与用时；点击重新进入绘本发出 game:reset 并隐藏", () => {
    const bundle = createTestBundle();
    const ending = new EndingOverlay();
    ending.init(bundle.context);
    const resets = eventLog(bundle.events, "game:reset");
    const root = uiNode(bundle, "sw-ending");
    expect(root.hidden).toBe(true);

    bundle.events.emit("game:finished", { elapsedSeconds: 75 });
    expect(root.hidden).toBe(false);
    expect(root.textContent).toContain(STORY.ending.title);
    expect(root.textContent).toContain("01:15");
    expect(root.textContent).toContain(STORY.ending.restartLabel);

    uiNode(bundle, "sw-ending__restart").click();
    expect(resets).toHaveLength(1);
    expect(root.hidden).toBe(true);

    ending.dispose();
    expect(bundle.uiRoot.children).toHaveLength(0);
  });
});

describe("DebugPanel", () => {
  it("非调试模式不挂载", () => {
    const bundle = createTestBundle();
    const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
    const panel = new DebugPanel(story);
    story.init(bundle.context);
    panel.init(bundle.context);
    expect(bundle.uiRoot.findByClass("sw-debug")).toBeNull();
    panel.dispose();
    story.dispose();
  });

  it("调试模式按钮按序触发三节点到达结局，重置按钮清空", () => {
    const bundle = createTestBundle({ debug: true });
    const story = new StorySystem({ player: bundle.player, dialogue: new StubDialogue() });
    const panel = new DebugPanel(story);
    story.init(bundle.context);
    panel.init(bundle.context);
    const finished = eventLog(bundle.events, "game:finished");

    const buttons = bundle.uiRoot.findAllByClass("sw-debug__button");
    expect(buttons.map((button) => button.dataset["node"])).toEqual([
      "flower",
      "stream",
      "tree",
      "reset",
    ]);
    for (const button of buttons.slice(0, 3)) button.click();
    advanceAll([story, panel], bundle.context, STORY.ending.delaySeconds + 0.2);
    expect(finished).toHaveLength(1);
    expect(uiNode(bundle, "sw-debug__stats").textContent).toContain("shards=3/3");

    const resetButton = buttons[3];
    resetButton?.click();
    expect(story.getHudState().step).toBe("intro");
    expect(story.getHudState().shardsCollected).toBe(0);

    panel.dispose();
    story.dispose();
  });
});

describe("createNarrativeSystems 全流程集成（测试替身玩家）", () => {
  it("走完三节点、收集三星屑、看到结局、重置后二次游玩", () => {
    const bundle = createTestBundle();
    const systems = createNarrativeSystems({ player: bundle.player });
    for (const system of systems) system.init?.(bundle.context);
    const story = systems.find((system) => system.id === "story") as StorySystem;
    const dialogue = systems.find((system) => system.id === "ui-dialogue") as DialogueBox;
    const finished = eventLog(bundle.events, "game:finished");
    const shards = eventLog(bundle.events, "shard:collected");

    const playNode = (id: "flower" | "stream" | "tree"): void => {
      bundle.player.moveToNode(id);
      advanceAll(systems, bundle.context, 0.1);
      while (dialogue.isOpen) dialogue.advance();
      story.interact();
      advanceAll(systems, bundle.context, 0.1);
      while (dialogue.isOpen) dialogue.advance();
      bundle.player.moveToShard(id);
      advanceAll(systems, bundle.context, 0.2);
    };

    playNode("flower");
    playNode("stream");
    playNode("tree");
    expect(shards.map((entry) => entry.total)).toEqual([1, 2, 3]);
    expect(uiNode(bundle, "sw-hud__shards").textContent).toBe("✦ 3/3");

    advanceAll(systems, bundle.context, STORY.ending.delaySeconds + 0.2);
    expect(finished).toHaveLength(1);
    expect(uiNode(bundle, "sw-ending").hidden).toBe(false);
    expect(dialogue.isOpen).toBe(false);

    uiNode(bundle, "sw-ending__restart").click();
    advanceAll(systems, bundle.context, 0.1);
    expect(uiNode(bundle, "sw-ending").hidden).toBe(true);
    expect(uiNode(bundle, "sw-hud__shards").textContent).toBe("✦ 0/3");
    expect(uiNode(bundle, "sw-hud__objective").textContent).toBe(STORY.intro.objective);
    expect(story.getHudState().step).toBe("intro");

    playNode("flower");
    expect(story.getHudState().shardsCollected).toBe(1);
    expect(story.getHudState().step).toBe("stream");

    for (const system of [...systems].reverse()) system.dispose?.();
    expect(bundle.uiRoot.children).toHaveLength(0);
    expect(fakeDocument().head.children).toHaveLength(0);
    expect(bundle.events.listenerCount("game:reset")).toBe(0);
    expect(bundle.scene.getObjectByName("story-shards")).toBeUndefined();
    expect(bundle.scene.getObjectByName("companion-tuanzai")).toBeUndefined();
  });
});
