/**
 * 输入状态（A2 / V0.3 新增 Space 跳跃与可选 Pointer Lock）。
 */

export type InputAction = "forward" | "back" | "left" | "right" | "sprint" | "jump";

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
  Space: "jump",
});

const PREVENT_DEFAULT_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

export interface MoveAxes {
  readonly x: number;
  readonly z: number;
}

export interface MouseDelta {
  readonly x: number;
  readonly y: number;
}

export class InputState {
  private controlsEnabled = true;
  private readonly pressed = new Set<InputAction>();
  private jumpQueued = false;
  private mouseDX = 0;
  private mouseDY = 0;
  private wheelAccumulated = 0;
  private dragging = false;
  private pointerLocked = false;

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    if (!enabled) {
      this.pressed.clear();
      this.jumpQueued = false;
      this.dragging = false;
    }
  }

  isControlsEnabled(): boolean {
    return this.controlsEnabled;
  }

  press(action: InputAction): void {
    if (!this.controlsEnabled) return;
    if (action === "jump" && !this.pressed.has("jump")) {
      this.jumpQueued = true;
    }
    this.pressed.add(action);
  }

  release(action: InputAction): void {
    this.pressed.delete(action);
  }

  isPressed(action: InputAction): boolean {
    return this.controlsEnabled && this.pressed.has(action);
  }

  /** 消费一次边沿触发的跳跃请求。 */
  consumeJumpPressed(): boolean {
    if (!this.controlsEnabled) {
      this.jumpQueued = false;
      return false;
    }
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

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

  setPointerLocked(locked: boolean): void {
    this.pointerLocked = this.controlsEnabled && locked;
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  addMouseDelta(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.mouseDX += x;
    this.mouseDY += y;
  }

  /** 读后清零；拖拽中或 Pointer Lock 锁定期间返回非零增量。 */
  consumeMouseDelta(): MouseDelta {
    const delta = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return this.dragging || this.pointerLocked ? delta : { x: 0, y: 0 };
  }

  addWheelDelta(deltaY: number): void {
    if (!Number.isFinite(deltaY)) return;
    this.wheelAccumulated += deltaY;
  }

  consumeWheelDelta(): number {
    const value = this.wheelAccumulated;
    this.wheelAccumulated = 0;
    return value;
  }

  clearKeys(): void {
    this.pressed.clear();
    this.jumpQueued = false;
  }

  handleWindowBlur(): void {
    this.pressed.clear();
    this.jumpQueued = false;
    this.dragging = false;
    this.pointerLocked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheelAccumulated = 0;
  }
}

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

export function shouldPreventDefault(code: string): boolean {
  return DEFAULT_KEY_BINDINGS[code] !== undefined || PREVENT_DEFAULT_CODES.has(code);
}

function clampUnit(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}
