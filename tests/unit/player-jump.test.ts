import { describe, expect, it } from "vitest";
import { createHeroMesh } from "../../src/player/heroCharacter";
import { HeroRig } from "../../src/player/HeroRig";
import { InputState, applyKeyEvent, shouldPreventDefault } from "../../src/player/InputState";
import { PLAYER_JUMP_SPEED, PlayerController } from "../../src/player/PlayerController";
import {
  createFakeGameContext,
  placeCameraLookingNegZ,
  runFrames,
} from "./helpers/fake-game-context";

describe("V0.3 Space 跳跃与滞空动作", () => {
  it("InputState 映射 Space 为边沿触发跳跃并阻止默认滚动", () => {
    const state = new InputState();
    expect(shouldPreventDefault("Space")).toBe(true);

    expect(applyKeyEvent(state, "Space", true)).toBe(true);
    expect(state.consumeJumpPressed()).toBe(true);
    // 单次按下只消费一次，不会无限连跳
    expect(state.consumeJumpPressed()).toBe(false);

    // 重复 keydown 也不重复排队
    applyKeyEvent(state, "Space", true);
    expect(state.consumeJumpPressed()).toBe(false);

    applyKeyEvent(state, "Space", false);
    applyKeyEvent(state, "Space", true);
    expect(state.consumeJumpPressed()).toBe(true);
  });

  it("PlayerController 按 Space 起跳离地并受重力落回地面", () => {
    const context = createFakeGameContext({ sampleHeight: () => 0 });
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);
    player.update(1 / 60, context);

    expect(player.getPlayerSnapshot().grounded).toBe(true);
    expect(player.getPlayerSnapshot().position.y).toBe(0);

    applyKeyEvent(player.input, "Space", true);
    player.update(1 / 60, context);

    const airborne = player.getPlayerSnapshot();
    expect(airborne.grounded).toBe(false);
    expect(airborne.position.y).toBeGreaterThan(0);
    expect(player.getHeroMotionState()?.motion).toBe("jump");

    // 推进足够帧数后安全落回地面
    runFrames(player, context, 90, 1 / 60);
    const landed = player.getPlayerSnapshot();
    expect(landed.grounded).toBe(true);
    expect(landed.position.y).toBeCloseTo(0, 5);
    expect(PLAYER_JUMP_SPEED).toBeGreaterThan(4);

    player.dispose();
  });

  it("HeroRig 滞空时进入 jump 状态并扬起斗篷", () => {
    const parts = createHeroMesh();
    const rig = new HeroRig(parts);
    rig.update(1 / 60, 3.0, false, 4.0);
    const state = rig.getState();
    expect(state.motion).toBe("jump");
    expect(state.grounded).toBe(false);
    expect(state.cloakSwing).toBeLessThan(0);

    rig.reset();
    expect(rig.getState().motion).toBe("idle");
    expect(rig.getState().grounded).toBe(true);
  });

  it("InputState 支持 Pointer Lock 期间输出鼠标增量", () => {
    const state = new InputState();
    state.setPointerLocked(true);
    state.addMouseDelta(12, -4);
    expect(state.consumeMouseDelta()).toEqual({ x: 12, y: -4 });
    state.handleWindowBlur();
    expect(state.isPointerLocked()).toBe(false);
  });
});
