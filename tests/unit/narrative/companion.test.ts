/**
 * 伙伴测试（AC-07）：侧后方跟随、>12m 回收、卡住 >2s 回收、引导、重置、释放。
 */
import { afterEach, describe, expect, it } from "vitest";
import { LANDMARKS, distanceXZ, sampleTerrainHeight } from "../../../src/config/world";
import { CompanionController } from "../../../src/companion/CompanionController";
import { advanceAll, createTestBundle } from "./helpers";
import type { TestBundle } from "./helpers";

interface Setup extends TestBundle {
  readonly companion: CompanionController;
}

const setups: Setup[] = [];

function setup(): Setup {
  const bundle = createTestBundle();
  const companion = new CompanionController({ player: bundle.player });
  companion.init(bundle.context);
  const result: Setup = { ...bundle, companion };
  setups.push(result);
  return result;
}

afterEach(() => {
  for (const item of setups.splice(0)) item.companion.dispose();
});

function gapXZ(item: Setup): number {
  const root = item.companion.object3d;
  if (!root) throw new Error("companion 未初始化");
  return distanceXZ(root.position, item.player.position);
}

function stat(item: Setup, key: string): string | number | boolean {
  const value = item.context.debug.readStats()[`companion.${key}`];
  if (value === undefined) throw new Error(`缺少调试指标 companion.${key}`);
  return value;
}

describe("跟随", () => {
  it("初始位于玩家侧后方 1.5～2.5m", () => {
    const item = setup();
    expect(gapXZ(item)).toBeGreaterThanOrEqual(1.5);
    expect(gapXZ(item)).toBeLessThanOrEqual(2.5);
  });

  it("玩家移动后平滑收敛回侧后方区间，不误触发回收", () => {
    const item = setup();
    item.player.moveTo(0, 26);
    advanceAll([item.companion], item.context, 2);
    expect(gapXZ(item)).toBeGreaterThanOrEqual(1.5);
    expect(gapXZ(item)).toBeLessThanOrEqual(2.5);
    item.player.moveTo(0, 20);
    advanceAll([item.companion], item.context, 2);
    expect(gapXZ(item)).toBeGreaterThanOrEqual(1.5);
    expect(gapXZ(item)).toBeLessThanOrEqual(2.5);
    expect(stat(item, "recoveries")).toBe(0);
  });

  it("悬浮高度在玩家上方约 1.15m 附近浮动", () => {
    const item = setup();
    advanceAll([item.companion], item.context, 1);
    const root = item.companion.object3d;
    const dy = (root?.position.y ?? 0) - item.player.position.y;
    expect(dy).toBeGreaterThan(0.9);
    expect(dy).toBeLessThan(1.6);
  });
});

describe("超时回收", () => {
  it("距玩家超过 12m 立即回到身边", () => {
    const item = setup();
    item.player.moveTo(30, -10);
    item.companion.update(1 / 60, item.context);
    expect(gapXZ(item)).toBeLessThanOrEqual(2.5);
    expect(stat(item, "recoveries")).toBe(1);
  });

  it("水平间距持续不缩小（卡住）超过 2 秒后回收", () => {
    const item = setup();
    item.player.moveTo(6, 32);
    const root = item.companion.object3d;
    if (!root) throw new Error("companion 未初始化");
    // 每帧把玩家放到伙伴前方 6m：伙伴净间距永不缩小，模拟被卡住。
    for (let frame = 0; frame < 150; frame += 1) {
      item.companion.update(1 / 60, item.context);
      item.player.moveTo(root.position.x + 6, root.position.z);
      if (stat(item, "recoveries") === 1) break;
    }
    expect(stat(item, "recoveries")).toBe(1);
    expect(stat(item, "stuckSeconds")).toBe(0);
  });

  it("正常跟随不会累积卡住计时", () => {
    const item = setup();
    item.player.moveTo(0, 26);
    advanceAll([item.companion], item.context, 3);
    expect(stat(item, "stuckSeconds")).toBe(0);
    expect(stat(item, "recoveries")).toBe(0);
  });
});

describe("目标引导", () => {
  it("靠近当前目标时进入引导状态；story:completed 后目标推进", () => {
    const item = setup();
    item.player.moveToNode("flower");
    item.companion.update(1 / 60, item.context);
    expect(stat(item, "guiding")).toBe(true);
    expect(stat(item, "target")).toBe("flower");

    item.events.emit("story:completed", { nodeId: "flower" });
    item.companion.update(1 / 60, item.context);
    expect(stat(item, "target")).toBe("stream");
    expect(stat(item, "guiding")).toBe(false);

    item.player.moveToNode("stream");
    item.companion.update(1 / 60, item.context);
    expect(stat(item, "guiding")).toBe(true);
  });

  it("结局后不再引导", () => {
    const item = setup();
    item.events.emit("game:finished", { elapsedSeconds: 10 });
    item.player.moveToNode("tree");
    item.companion.update(1 / 60, item.context);
    expect(stat(item, "guiding")).toBe(false);
    expect(stat(item, "target")).toBe("-");
  });
});

describe("重置与释放", () => {
  it("game:reset 后回到出生点侧后方，引导目标回到 flower", () => {
    const item = setup();
    item.player.moveTo(30, -10);
    item.companion.update(1 / 60, item.context);
    item.events.emit("story:completed", { nodeId: "flower" });

    item.player.moveTo(0, 32);
    item.events.emit("game:reset");
    const root = item.companion.object3d;
    expect(root).toBeDefined();
    if (root) {
      // 水平位置固定在出生点侧后方；高度取共享地形采样器之上（M2 起地形不再平坦）
      expect(distanceXZ(root.position, { x: 1.1, z: 33.9 })).toBeLessThan(0.01);
      expect(root.position.y).toBeGreaterThan(sampleTerrainHeight(1.1, 33.9));
    }
    expect(stat(item, "target")).toBe("flower");
    expect(stat(item, "stuckSeconds")).toBe(0);
  });

  it("dispose 移除场景对象、监听器与调试指标", () => {
    const bundle = createTestBundle();
    const companion = new CompanionController({ player: bundle.player });
    companion.init(bundle.context);
    expect(bundle.scene.getObjectByName("companion-tuanzai")).toBeDefined();
    companion.dispose();
    expect(bundle.scene.getObjectByName("companion-tuanzai")).toBeUndefined();
    expect(bundle.events.listenerCount()).toBe(0);
    expect(bundle.context.debug.readStats()["companion.distance"]).toBeUndefined();
  });
});

describe("坐标来源", () => {
  it("引导目标坐标直接引用共享地标配置", () => {
    expect(LANDMARKS.flower.x).toBe(-8);
    expect(LANDMARKS.flower.z).toBe(20);
  });
});
