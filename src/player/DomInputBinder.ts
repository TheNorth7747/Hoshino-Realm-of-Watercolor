/**
 * DOM 输入绑定（A2 / V0.3 兼容拖拽旋转 + 单击可选 Pointer Lock）。
 */
import { applyKeyEvent, shouldPreventDefault, type InputState } from "./InputState";

function isFormElement(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

export interface DomInputBinderOptions {
  readonly state: InputState;
  readonly canvas: HTMLCanvasElement;
  readonly windowTarget: Window;
}

export class DomInputBinder {
  private readonly state: InputState;
  private readonly canvas: HTMLCanvasElement;
  private readonly windowTarget: Window;
  private activePointerId: number | null = null;
  private lastClientX = 0;
  private lastClientY = 0;
  private startClientX = 0;
  private startClientY = 0;
  private movedDuringPress = false;
  private attached = false;

  constructor(options: DomInputBinderOptions) {
    this.state = options.state;
    this.canvas = options.canvas;
    this.windowTarget = options.windowTarget;
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    this.windowTarget.addEventListener("keydown", this.onKeyDown);
    this.windowTarget.addEventListener("keyup", this.onKeyUp);
    this.windowTarget.addEventListener("blur", this.onWindowBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);

    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.windowTarget.addEventListener("pointermove", this.onPointerMove);
    this.windowTarget.addEventListener("pointerup", this.onPointerUp);
    this.windowTarget.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  dispose(): void {
    if (!this.attached) return;
    this.attached = false;

    this.windowTarget.removeEventListener("keydown", this.onKeyDown);
    this.windowTarget.removeEventListener("keyup", this.onKeyUp);
    this.windowTarget.removeEventListener("blur", this.onWindowBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);

    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.windowTarget.removeEventListener("pointermove", this.onPointerMove);
    this.windowTarget.removeEventListener("pointerup", this.onPointerUp);
    this.windowTarget.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.state.handleWindowBlur();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isFormElement(event.target)) return;
    if (applyKeyEvent(this.state, event.code, true) && shouldPreventDefault(event.code)) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (isFormElement(event.target)) return;
    applyKeyEvent(this.state, event.code, false);
  };

  private readonly onWindowBlur = (): void => {
    this.state.handleWindowBlur();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.state.handleWindowBlur();
  };

  private readonly onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    this.state.setPointerLocked(locked);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.startClientX = event.clientX;
    this.startClientY = event.clientY;
    this.movedDuringPress = false;
    this.state.setDragging(true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (document.pointerLockElement === this.canvas) {
      this.state.addMouseDelta(event.movementX, event.movementY);
      return;
    }
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    const dx = event.clientX - this.lastClientX;
    const dy = event.clientY - this.lastClientY;
    if (Math.hypot(event.clientX - this.startClientX, event.clientY - this.startClientY) > 4) {
      this.movedDuringPress = true;
    }
    this.state.addMouseDelta(dx, dy);
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.state.setDragging(false);
    // 轻点画布（非拖拽）可进入 Pointer Lock；无头环境或用户取消静默忽略
    if (
      !this.movedDuringPress &&
      event.button === 0 &&
      document.pointerLockElement !== this.canvas &&
      typeof this.canvas.requestPointerLock === "function"
    ) {
      try {
        const result = this.canvas.requestPointerLock() as unknown;
        if (result && typeof (result as Promise<void>).catch === "function") {
          void (result as Promise<void>).catch(() => undefined);
        }
      } catch {
        // 静默忽略不支持 Pointer Lock 的无头环境
      }
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.state.addWheelDelta(event.deltaY);
  };
}
