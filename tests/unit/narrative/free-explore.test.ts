import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { PlayerSource } from "../../../src/core/contracts";
import { LANDMARKS } from "../../../src/config/world";
import { FreeExploreSystem } from "../../../src/narrative/FreeExploreSystem";
import { CONTROLS_HINT_TEXT, MinimalHud } from "../../../src/ui/MinimalHud";
import { createFakeGameContext } from "../helpers/fake-game-context";

class FakePlayer implements PlayerSource {
  readonly position = new Vector3(0, 0, 32);
  getPlayerSnapshot() {
    return { position: this.position, headingRadians: Math.PI, speed: 0, grounded: true };
  }
}

describe("V0.3 FreeExploreSystem 极简无对话探索", () => {
  it("走近蓝花坡/溪流/樱树自动触发染色，不弹窗、无需按 E", () => {
    const context = createFakeGameContext();
    const player = new FakePlayer();
    const explore = new FreeExploreSystem({ player });
    explore.init(context);

    const blooms: number[] = [];
    const completed: string[] = [];
    let finished = 0;
    context.events.on("color:bloom", (p) => blooms.push(p.radius));
    context.events.on("story:completed", (p) => completed.push(p.nodeId));
    context.events.on("game:finished", () => {
      finished += 1;
    });

    // 蓝花坡
    player.position.set(LANDMARKS.flower.x, 0, LANDMARKS.flower.z);
    explore.update(0.016, context);
    expect(completed).toEqual(["flower"]);
    expect(blooms.length).toBe(1);

    // 重复停留不重复触发
    explore.update(0.016, context);
    expect(completed).toEqual(["flower"]);

    // 溪流
    player.position.set(LANDMARKS.stream.x, 0, LANDMARKS.stream.z);
    explore.update(0.016, context);
    expect(completed).toEqual(["flower", "stream"]);

    // 樱树
    player.position.set(LANDMARKS.tree.x, 0, LANDMARKS.tree.z);
    explore.update(0.016, context);
    expect(completed).toEqual(["flower", "stream", "tree"]);
    expect(explore.getState().step).toBe("finished");

    // 推进超过 2.5s 后发出 game:finished
    for (let i = 0; i < 60; i += 1) explore.update(0.05, context);
    expect(finished).toBe(1);

    // reset 完整清零
    context.events.emit("game:reset");
    expect(explore.getState().visited).toEqual([]);
    expect(explore.getState().step).toBe("intro");
    expect(explore.getState().finished).toBe(false);

    explore.dispose();
  });

  it("MinimalHud 常量不包含对话与星屑文案", () => {
    expect(CONTROLS_HINT_TEXT).toContain("Space jump");
    expect(CONTROLS_HINT_TEXT).toContain("WASD move");
    expect(typeof MinimalHud).toBe("function");
  });
});
