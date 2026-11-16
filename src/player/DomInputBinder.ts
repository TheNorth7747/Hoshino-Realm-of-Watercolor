/**
 * DOM 输入绑定（A2）。
 *
 * 把浏览器事件接到 InputState 上：
 * - 键盘：window keydown/keyup，按 KeyboardEvent.code 映射（PRD 9.3）。
 * - 鼠标：canvas 上按下开始拖拽，window 上移动/抬起（拖出画布也能继续/结束）。
 * - 滚轮：canvas wheel，preventDefault 防止页面缩放/滚动。
 * - 失焦与页面隐藏：清空全部输入，避免角色持续移动（PRD 9.3 / AC-02）。
 *
 * 对话框等表单元素聚焦时不吞按键，保证 UI 可正常输入。
 */
import { applyKeyEvent, shouldPreventDefault, type InputState } from "./InputState";

/** 表单元素上不拦截键盘，避免影响未来对话框的文本输入。 */
function isFormElement(target: EventTarget | null): boolean {
  // node 单测环境没有 HTMLElement 全局；浏览器恒存在。
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
  /** wheel/pointerdown 绑定在画布上。 */
  readonly canvas: HTMLCanvasElement;
  /** keydown/keyup/blur/pointermove/up 绑定在 window 上。 */
  readonly windowTarget: Window;
}

export class DomInputBinder {
  private readonly state: InputState;
  private readonly canvas: HTMLCanvasElement;
  private readonly windowTarget: Window;
  private activePointerId: number | null = null;
  private lastClientX = 0;
  private lastClientY = 0;
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

  private readonly onPointerDown = (event: PointerEvent): void => {
    // 仅主键拖拽旋转；同一时间只跟踪一个指针。
    if (event.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.state.setDragging(true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    this.state.addMouseDelta(event.clientX - this.lastClientX, event.clientY - this.lastClientY);
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.state.setDragging(false);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.state.addWheelDelta(event.deltaY);
  };
}
