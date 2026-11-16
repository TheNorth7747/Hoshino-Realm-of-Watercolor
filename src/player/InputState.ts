/**
 * 输入状态（A2）。
 *
 * 设计：DOM 事件 → InputState（纯状态，可单测）→ PlayerController / CameraRig 消费。
 * 每帧顺序（PRD 7.3）中“输入”阶段是事件驱动的：键盘/鼠标事件在两次 rAF 之间
 * 更新本状态，player 阶段读取移动轴，camera 阶段消费拖拽与滚轮增量。
 *
 * 失焦（blur / 页面隐藏）必须清空全部输入，避免角色持续移动（PRD 9.3 / AC-02）。
 */

export type InputAction = "forward" | "back" | "left" | "right" | "sprint";

/** KeyboardEvent.code → 动作。方向键作为 WASD 的补充，Shift 为可选小跑（PRD 9.3）。 */
export const DEFAULT_KEY_BINDINGS: Readonly<Record<string, InputAction>> = Object.freeze({
  KeyW: "forward",
  ArrowUp: "forward",
  KeyS: "back",
  ArrowDown: "back",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
});

/** 需要阻止浏览器默认行为（页面滚动）的游戏按键。 */
const PREVENT_DEFAULT_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
]);

export interface MoveAxes {
  /** 右为正（D=+1，A=-1）。 */
  readonly x: number;
  /** 前为正（W=+1，S=-1）。 */
  readonly z: number;
}

export interface MouseDelta {
  readonly x: number;
  readonly y: number;
}

/**
 * 纯输入状态，不接触 DOM。测试与无窗口环境可直接操作。
 * 单位：mouseDelta 为像素，wheelDelta 为原生 deltaY 累加值。
 */
export class InputState {
  /** 关闭后移动轴与冲刺一律读零（对话期间限速钩子，PRD 9.3）。 */
  private controlsEnabled = true;
  private readonly pressed = new Set<InputAction>();
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelAccumulated = 0;
  private dragging = false;

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    if (!enabled) {
      this.pressed.clear();
      this.dragging = false;
    }
  }

  isControlsEnabled(): boolean {
    return this.controlsEnabled;
  }

  press(action: InputAction): void {
    if (!this.controlsEnabled) return;
    this.pressed.add(action);
  }

  release(action: InputAction): void {
    this.pressed.delete(action);
  }

  isPressed(action: InputAction): boolean {
    return this.controlsEnabled && this.pressed.has(action);
  }

  /** WASD 合成移动轴，输出钳制到 [-1, 1]；对角线由消费方归一化。 */
  readMoveAxes(): MoveAxes {
    if (!this.controlsEnabled) return { x: 0, z: 0 };
    const x = (this.pressed.has("right") ? 1 : 0) - (this.pressed.has("left") ? 1 : 0);
    const z = (this.pressed.has("forward") ? 1 : 0) - (this.pressed.has("back") ? 1 : 0);
    return { x: clampUnit(x), z: clampUnit(z) };
  }

  isSprinting(): boolean {
    return this.controlsEnabled && this.pressed.has("sprint");
  }

  setDragging(dragging: boolean): void {
    if (!this.controlsEnabled) {
      this.dragging = false;
      return;
    }
    this.dragging = dragging;
  }

  isDragging(): boolean {
    return this.dragging;
  }

  /** 拖拽增量累加（像素）；consumer 每帧消费一次。 */
  addMouseDelta(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.mouseDX += x;
    this.mouseDY += y;
  }

  /** 读后清零；仅在拖拽中返回非零增量。 */
  consumeMouseDelta(): MouseDelta {
    const delta = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return this.dragging ? delta : { x: 0, y: 0 };
  }

  addWheelDelta(deltaY: number): void {
    if (!Number.isFinite(deltaY)) return;
    this.wheelAccumulated += deltaY;
  }

  /** 读后清零。 */
  consumeWheelDelta(): number {
    const value = this.wheelAccumulated;
    this.wheelAccumulated = 0;
    return value;
  }

  /** 清空按键（保留拖拽增量；拖拽结束由 pointerup 负责）。 */
  clearKeys(): void {
    this.pressed.clear();
  }

  /**
   * 窗口失焦 / 页面隐藏时调用：清空按键、结束拖拽、丢弃未消费增量（PRD 9.3）。
   */
  handleWindowBlur(): void {
    this.pressed.clear();
    this.dragging = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelAccumulated = 0;
  }
}

/** 按键事件 → 输入状态；返回是否为游戏按键（供 preventDefault 判断）。 */
export function applyKeyEvent(state: InputState, code: string, down: boolean): boolean {
  const action = DEFAULT_KEY_BINDINGS[code];
  if (!action) return false;
  if (down) {
    state.press(action);
  } else {
    state.release(action);
  }
  return true;
}

/** 该按键是否需要 preventDefault（方向键滚动页面等）。 */
export function shouldPreventDefault(code: string): boolean {
  return DEFAULT_KEY_BINDINGS[code] !== undefined || PREVENT_DEFAULT_CODES.has(code);
}

function clampUnit(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}
