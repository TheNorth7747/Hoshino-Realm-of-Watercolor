import { describe, expect, it } from "vitest";
import {
  InputState,
  applyKeyEvent,
  shouldPreventDefault,
} from "../../src/player/InputState";

function pressKeys(state: InputState, codes: string[]): void {
  for (const code of codes) applyKeyEvent(state, code, true);
}

describe("InputState · 键盘映射", () => {
  it("WASD 合成移动轴（前=+z，右=+x）", () => {
    const state = new InputState();
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });

    applyKeyEvent(state, "KeyW", true);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 1 });

    applyKeyEvent(state, "KeyD", true);
    expect(state.readMoveAxes()).toEqual({ x: 1, z: 1 });

    applyKeyEvent(state, "KeyW", false);
    applyKeyEvent(state, "KeyD", false);
    applyKeyEvent(state, "KeyA", true);
    applyKeyEvent(state, "KeyS", true);
    expect(state.readMoveAxes()).toEqual({ x: -1, z: -1 });
  });

  it("方向键与 Shift（小跑）同样映射", () => {
    const state = new InputState();
    pressKeys(state, ["ArrowUp", "ShiftLeft"]);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 1 });
    expect(state.isSprinting()).toBe(true);

    applyKeyEvent(state, "ShiftLeft", false);
    applyKeyEvent(state, "ShiftRight", true);
    expect(state.isSprinting()).toBe(true);
  });

  it("未映射按键被忽略并返回 false", () => {
    const state = new InputState();
    expect(applyKeyEvent(state, "KeyQ", true)).toBe(false);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
  });

  it("clearKeys 清空全部按键", () => {
    const state = new InputState();
    pressKeys(state, ["KeyW", "KeyA", "ShiftLeft"]);
    state.clearKeys();
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    expect(state.isSprinting()).toBe(false);
  });
});

describe("InputState · 鼠标与滚轮增量", () => {
  it("拖拽增量累加，消费后清零；未拖拽时不输出", () => {
    const state = new InputState();
    state.addMouseDelta(5, 3);
    state.addMouseDelta(2, -1);
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 }); // 未拖拽

    state.setDragging(true);
    state.addMouseDelta(5, 3);
    expect(state.consumeMouseDelta()).toEqual({ x: 5, y: 3 });
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  it("滚轮增量累加，消费后清零", () => {
    const state = new InputState();
    state.addWheelDelta(120);
    state.addWheelDelta(-40);
    expect(state.consumeWheelDelta()).toBe(80);
    expect(state.consumeWheelDelta()).toBe(0);
  });

  it("含非数值分量的增量整条丢弃", () => {
    const state = new InputState();
    state.addMouseDelta(Number.NaN, 1);
    state.addWheelDelta(Number.POSITIVE_INFINITY);
    expect(state.consumeWheelDelta()).toBe(0);
    state.setDragging(true);
    // x 与 y 一起丢弃：不应用半条损坏的事件。
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
  });
});

describe("InputState · 失焦清理（PRD 9.3 / AC-02）", () => {
  it("handleWindowBlur 清空按键、拖拽与未消费增量", () => {
    const state = new InputState();
    pressKeys(state, ["KeyW", "KeyD"]);
    state.setDragging(true);
    state.addMouseDelta(30, 30);
    state.addWheelDelta(200);

    state.handleWindowBlur();

    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    expect(state.isDragging()).toBe(false);
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    expect(state.consumeWheelDelta()).toBe(0);
  });
});

describe("InputState · 控制开关（对话期间限速钩子）", () => {
  it("关闭后按键被忽略、轴读零；恢复后输入立即可用", () => {
    const state = new InputState();
    state.setControlsEnabled(false);
    applyKeyEvent(state, "KeyW", true);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    expect(state.isControlsEnabled()).toBe(false);

    state.setControlsEnabled(true);
    applyKeyEvent(state, "KeyW", true);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 1 });
  });

  it("关闭时清空已按下的按键", () => {
    const state = new InputState();
    applyKeyEvent(state, "KeyW", true);
    state.setControlsEnabled(false);
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    expect(state.isSprinting()).toBe(false);
  });
});

describe("preventDefault 判定", () => {
  it("游戏按键与方向键阻止默认行为，普通键不阻止", () => {
    expect(shouldPreventDefault("KeyW")).toBe(true);
    expect(shouldPreventDefault("ArrowUp")).toBe(true);
    expect(shouldPreventDefault("KeyQ")).toBe(false);
    expect(shouldPreventDefault("F5")).toBe(false);
  });
});
