import { describe, expect, it } from "vitest";
import { DomInputBinder } from "../../src/player/DomInputBinder";
import { InputState } from "../../src/player/InputState";

/**
 * DomInputBinder 的 node 环境测试：
 * 用 EventTarget + 带 code/clientX 等字段的 Event shim 模拟浏览器事件，
 * 验证监听接线与状态更新；浏览器特有分支（表单聚焦跳过）留待 M1 集成 smoke。
 *
 * vitest 默认按文件隔离，document stub 不会泄漏到其他测试文件。
 */
const fakeDocument = new EventTarget();
(globalThis as { document: unknown }).document = fakeDocument;

function makeCanvas(): HTMLCanvasElement {
  return new EventTarget() as unknown as HTMLCanvasElement;
}

function makeWindow(): Window {
  return new EventTarget() as unknown as Window;
}

function fire(target: EventTarget, type: string, props: Record<string, unknown>): void {
  const event = Object.assign(new Event(type, { cancelable: true }), props);
  target.dispatchEvent(event);
}

interface Harness {
  readonly state: InputState;
  readonly canvas: HTMLCanvasElement;
  readonly windowTarget: Window;
  readonly binder: DomInputBinder;
}

function attach(): Harness {
  const state = new InputState();
  const canvas = makeCanvas();
  const windowTarget = makeWindow();
  const binder = new DomInputBinder({ state, canvas, windowTarget });
  binder.attach();
  return { state, canvas, windowTarget, binder };
}

describe("DomInputBinder · 键盘接线", () => {
  it("window keydown/keyup 更新移动轴", () => {
    const { state, windowTarget, binder } = attach();
    fire(windowTarget, "keydown", { code: "KeyW" });
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 1 });
    fire(windowTarget, "keyup", { code: "KeyW" });
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    binder.dispose();
  });

  it("方向键 keydown 阻止默认行为（页面滚动）", () => {
    const { windowTarget, binder } = attach();
    let prevented = false;
    const event = Object.assign(new Event("keydown", { cancelable: true }), { code: "ArrowUp" });
    event.preventDefault = () => {
      prevented = true;
    };
    windowTarget.dispatchEvent(event);
    expect(prevented).toBe(true);
    binder.dispose();
  });

  it("dispose 后不再响应事件", () => {
    const { state, windowTarget, binder } = attach();
    binder.dispose();
    fire(windowTarget, "keydown", { code: "KeyW" });
    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
  });
});

describe("DomInputBinder · 失焦清理", () => {
  it("window blur 清空按键与增量", () => {
    const { state, windowTarget, binder } = attach();
    fire(windowTarget, "keydown", { code: "KeyW" });
    fire(windowTarget, "keydown", { code: "KeyD" });
    state.addWheelDelta(300);

    fire(windowTarget, "blur", {});

    expect(state.readMoveAxes()).toEqual({ x: 0, z: 0 });
    expect(state.consumeWheelDelta()).toBe(0);
    binder.dispose();
  });
});

describe("DomInputBinder · 拖拽与滚轮接线", () => {
  it("canvas pointerdown 开始拖拽，window pointermove 累积增量，pointerup 结束", () => {
    const { state, canvas, windowTarget, binder } = attach();
    fire(canvas, "pointerdown", { button: 0, pointerId: 1, clientX: 100, clientY: 50 });
    expect(state.isDragging()).toBe(true);

    fire(windowTarget, "pointermove", { pointerId: 1, clientX: 140, clientY: 30 });
    fire(windowTarget, "pointermove", { pointerId: 1, clientX: 160, clientY: 20 });
    expect(state.consumeMouseDelta()).toEqual({ x: 60, y: -30 });

    fire(windowTarget, "pointerup", { pointerId: 1 });
    expect(state.isDragging()).toBe(false);
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    binder.dispose();
  });

  it("忽略非主键与移出指针", () => {
    const { state, canvas, windowTarget, binder } = attach();
    fire(canvas, "pointerdown", { button: 2, pointerId: 1, clientX: 0, clientY: 0 });
    expect(state.isDragging()).toBe(false);

    fire(canvas, "pointerdown", { button: 0, pointerId: 7, clientX: 10, clientY: 10 });
    fire(windowTarget, "pointermove", { pointerId: 99, clientX: 50, clientY: 50 });
    expect(state.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    binder.dispose();
  });

  it("canvas wheel 累积增量并阻止默认行为", () => {
    const { state, canvas, binder } = attach();
    let prevented = false;
    const event = Object.assign(new Event("wheel", { cancelable: true }), { deltaY: 120 });
    event.preventDefault = () => {
      prevented = true;
    };
    canvas.dispatchEvent(event);
    expect(prevented).toBe(true);
    expect(state.consumeWheelDelta()).toBe(120);
    binder.dispose();
  });
});
