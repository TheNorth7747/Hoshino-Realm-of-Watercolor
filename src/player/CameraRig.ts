/**
 * 第三人称镜头 Rig（A2，PRD 9.3 / AC-02）。
 *
 * 职责：
 * - 平滑跟随：跟随点（玩家头部偏移）与镜头距离都做指数阻尼，帧率无关。
 * - 鼠标拖拽旋转：偏航/俯仰，俯仰钳制，灵敏度按像素。
 * - 滚轮缩放：目标距离乘性缩放并钳制到 [min, max]，距离平滑过渡。
 * - 基础地形避让：镜头 XZ 处采样地形高度，保证高于地面 clearance
 *   （PRD 9.3“摄像机做基础地形避让”；树木遮挡淡化属于 P1）。
 * - 结局运镜（PRD 5.5 / P0“花树开花后镜头短暂拉远”）：
 *   监听 `story:completed({ nodeId: "tree" })` 立即开始（早于 `game:finished`，
 *   后者在结局 UI 出现时才触发）。保持当前 yaw，用同一套指数阻尼把距离平滑
 *   拉到 CAMERA_FINALE_DISTANCE、俯角抬到 CAMERA_FINALE_PITCH，让花树、玩家
 *   与染色路径尽量留在画面里；运镜期间丢弃滚轮/拖拽增量，避免输入与动画争夺；
 *   `game:reset` 清除运镜并恢复默认距离、俯角与输入。
 * - delta 截断与 game:reset 复位（回到出生点朝向主路线）。
 *
 * 玩家位置通过共享契约 PlayerSource 读取（core/contracts.ts 8.2），
 * 不直接依赖 PlayerController 类，A4 的测试替身可复用同一接口。
 */
import type { Vector3 } from "three";
import { Vector3 as Vector3Impl } from "three";
import type { DebugStatSource, GameContext, GameSystem, PlayerSource } from "../core/contracts";
import { clampDelta } from "../core/config";
import type { InputState } from "./InputState";

/** 默认镜头距离（米）。V0.2：8 → 5，贴近参考视频的中景构图。 */
export const CAMERA_DEFAULT_DISTANCE = 5;
export const CAMERA_MIN_DISTANCE = 3;
export const CAMERA_MAX_DISTANCE = 14;
/**
 * 默认俯仰角（弧度）。V0.2：0.42（≈24°，偏俯视）→ 0.24（≈13.8°），
 * 降低俯视感，地平线从画面顶部区回到上部偏中。
 */
export const CAMERA_DEFAULT_PITCH = 0.24;
export const CAMERA_MIN_PITCH = 0.08;
export const CAMERA_MAX_PITCH = 1.15;
/**
 * 前看距离（米，默认距离下）：注视点在跟随点前方沿镜头水平前向偏移 1.6m，
 * 使角色落到画面中下部、地平线不再贴近顶部（V0.2 要求 1～2m）。
 * 偏移随镜头距离等比缩放（lookAheadDistance()），缩放后构图保持一致。
 */
export const CAMERA_LOOK_AHEAD_DEFAULT = 1.6;
/** 前看 = 距离 × 该比例（1.6 / 5 = 0.32）。 */
export const CAMERA_LOOK_AHEAD_RATIO = 0.32;
/** 前看偏移的绝对上下限，避免极端缩放下构图跑偏。 */
const LOOK_AHEAD_MIN = 0.6;
const LOOK_AHEAD_MAX = 5;
/** 拖拽灵敏度（弧度/像素）。 */
export const CAMERA_DRAG_SENSITIVITY = 0.005;
/** 滚轮缩放系数：每像素 deltaY 对应的距离乘性因子。 */
export const CAMERA_WHEEL_STEP = 0.0015;
/** 跟随点与距离的阻尼速率（1/s）。 */
export const CAMERA_FOLLOW_RATE = 8;
export const CAMERA_ZOOM_RATE = 8;
/**
 * 结局运镜：目标距离（米）与俯角（弧度）。
 * 距离沿用 13m 验收契约不修改（rc-finale-acceptance 依赖它）；
 * V0.2 把俯角从 0.62 降到 0.40，避免 13m 距离下变成顶视图，
 * 同时前看随距离等比放大到约 4.2m，让花树与染色路径留在画面中部。
 */
export const CAMERA_FINALE_DISTANCE = 13;
export const CAMERA_FINALE_PITCH = 0.4;
/**
 * 结局运镜阻尼速率（1/s）。刻意比常规缩放慢：指数阻尼的时间常数约 1/rate，
 * 2.2 对应 ~0.45s 时间常数、约 1.5s 视觉完成，首帧步进 <0.2m，无硬切感。
 */
export const CAMERA_FINALE_RATE = 2.2;
/** 跟随点在玩家脚底坐标之上的高度（角色约 1.4m 高）。 */
export const CAMERA_HEAD_OFFSET = 1.5;
/** 镜头与地面的最小间距（米）。 */
export const CAMERA_TERRAIN_CLEARANCE = 0.8;
/** 单帧拖拽/滚轮增量上限：防止失焦恢复后镜头跳变。 */
const MAX_MOUSE_DELTA_PER_FRAME = 240;
const MAX_WHEEL_DELTA_PER_FRAME = 480;

export interface CameraRigOptions {
  readonly playerSource: PlayerSource;
  /** 与 PlayerController 共享的输入状态（createPlayerSystems 负责接线）。 */
  readonly input: InputState;
  readonly distance?: number | undefined;
  readonly pitch?: number | undefined;
  /** 前看距离（米）；缺省按 CAMERA_LOOK_AHEAD_DEFAULT 与距离等比缩放。 */
  readonly lookAhead?: number | undefined;
}

export class CameraRig implements GameSystem {
  readonly id = "camera";
  readonly phase = "camera" as const;

  private readonly playerSource: PlayerSource;
  private readonly input: InputState;
  private readonly defaultDistance: number;
  private readonly defaultPitch: number;
  /** 显式前看距离：null 表示按距离等比缩放（默认行为）。 */
  private readonly fixedLookAhead: number | null;

  private yaw = 0; // 0 = 镜头在目标 +Z 方向，看向 -Z（主路线方向）
  private pitch: number;
  private targetDistance: number;
  private currentDistance: number;
  private readonly followPoint = new Vector3Impl();
  /** 注视点：跟随点 + 前看偏移；镜头 lookAt 它（不进快照，纯视觉）。 */
  private readonly lookTarget = new Vector3Impl();

  private finaleActive = false;
  private finaleElapsed = 0;
  private finaleUserControlled = false;
  private finaleTargetDistance = CAMERA_FINALE_DISTANCE;
  private finaleTargetPitch = CAMERA_FINALE_PITCH;

  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly tmpDesired = new Vector3Impl();

  constructor(options: CameraRigOptions) {
    this.playerSource = options.playerSource;
    this.input = options.input;
    this.defaultDistance = options.distance ?? CAMERA_DEFAULT_DISTANCE;
    this.defaultPitch = options.pitch ?? CAMERA_DEFAULT_PITCH;
    this.fixedLookAhead = options.lookAhead ?? null;
    this.pitch = this.defaultPitch;
    this.targetDistance = this.defaultDistance;
    this.currentDistance = this.defaultDistance;
    this.followPoint.set(0, CAMERA_HEAD_OFFSET, 0);
  }

  init(context: GameContext): void {
    // 玩家系统先注册（player 阶段在前），此时快照已在出生点。
    this.snapToTarget(context);

    this.unsubscribeFns.push(
      context.events.on("game:reset", () => this.resetToSpawn(context)),
      // 结局运镜：花树节点完成即刻开始，不等 game:finished（那是结局 UI 触发点）。
      context.events.on("story:completed", (payload) => this.handleStoryCompleted(payload.nodeId)),
      context.debug.registerStatSource(this.createStatSource()),
    );
  }

  update(deltaSeconds: number, context: GameContext): void {
    const step = clampDelta(deltaSeconds, context.settings.maxDeltaSeconds);

    if (this.finaleActive) {
      this.finaleElapsed += step;
      if (this.finaleElapsed < 2.8) {
        // 初始 2.8s 结局运镜期间隔离输入，保证平滑拉远至 13m 与构图稳定
        this.input.consumeMouseDelta();
        this.input.consumeWheelDelta();
        this.updateFinale(step);
      } else {
        // 2.8s 后允许玩家自由旋转与缩放回望，无人输入时继续收敛至目标距离与俯角
        const mouse = this.input.consumeMouseDelta();
        const wheel = this.input.consumeWheelDelta();
        if (mouse.x !== 0 || mouse.y !== 0 || wheel !== 0) {
          if (!this.finaleUserControlled) {
            this.finaleUserControlled = true;
            this.targetDistance = this.currentDistance;
          }
          if (mouse.x !== 0 || mouse.y !== 0) {
            const dx = clampMagnitude(mouse.x, MAX_MOUSE_DELTA_PER_FRAME);
            const dy = clampMagnitude(mouse.y, MAX_MOUSE_DELTA_PER_FRAME);
            this.yaw -= dx * CAMERA_DRAG_SENSITIVITY;
            this.pitch += dy * CAMERA_DRAG_SENSITIVITY;
            this.pitch = Math.min(CAMERA_MAX_PITCH, Math.max(CAMERA_MIN_PITCH, this.pitch));
          }
          if (wheel !== 0) {
            const clampedWheel = clampMagnitude(wheel, MAX_WHEEL_DELTA_PER_FRAME);
            this.targetDistance *= Math.exp(clampedWheel * CAMERA_WHEEL_STEP);
            this.targetDistance = Math.min(
              CAMERA_MAX_DISTANCE,
              Math.max(CAMERA_MIN_DISTANCE, this.targetDistance),
            );
          }
        }
        if (this.finaleUserControlled) {
          const zoomBlend = 1 - Math.exp(-CAMERA_ZOOM_RATE * step);
          this.currentDistance += (this.targetDistance - this.currentDistance) * zoomBlend;
        } else {
          this.updateFinale(step);
        }
      }
    } else {
      // 拖拽旋转：右拖 → 视线右转（yaw 减小），下拖 → 镜头升高俯角增大。
      const mouse = this.input.consumeMouseDelta();
      if (mouse.x !== 0 || mouse.y !== 0) {
        const dx = clampMagnitude(mouse.x, MAX_MOUSE_DELTA_PER_FRAME);
        const dy = clampMagnitude(mouse.y, MAX_MOUSE_DELTA_PER_FRAME);
        this.yaw -= dx * CAMERA_DRAG_SENSITIVITY;
        this.pitch += dy * CAMERA_DRAG_SENSITIVITY;
        this.pitch = Math.min(CAMERA_MAX_PITCH, Math.max(CAMERA_MIN_PITCH, this.pitch));
      }

      // 滚轮缩放：向下滚 → 拉远；目标距离钳制，实际距离平滑追踪。
      const wheel = this.input.consumeWheelDelta();
      if (wheel !== 0) {
        const clampedWheel = clampMagnitude(wheel, MAX_WHEEL_DELTA_PER_FRAME);
        this.targetDistance *= Math.exp(clampedWheel * CAMERA_WHEEL_STEP);
        this.targetDistance = Math.min(
          CAMERA_MAX_DISTANCE,
          Math.max(CAMERA_MIN_DISTANCE, this.targetDistance),
        );
      }
      const zoomBlend = 1 - Math.exp(-CAMERA_ZOOM_RATE * step);
      this.currentDistance += (this.targetDistance - this.currentDistance) * zoomBlend;
    }

    // 跟随点阻尼追踪玩家头部位置。
    const playerPosition = this.playerSource.getPlayerSnapshot().position;
    this.tmpDesired.set(playerPosition.x, playerPosition.y + CAMERA_HEAD_OFFSET, playerPosition.z);
    const followBlend = 1 - Math.exp(-CAMERA_FOLLOW_RATE * step);
    this.followPoint.lerp(this.tmpDesired, followBlend);

    this.applyCameraTransform(context);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeFns) unsubscribe();
    this.unsubscribeFns.length = 0;
    // 系统销毁后不再处于运镜态，避免被复用时残留状态（dispose 后 getter 应报默认值语义）。
    this.clearFinale();
  }

  // ---- 调试 / 测试读取 ----

  getYaw(): number {
    return this.yaw;
  }

  getPitch(): number {
    return this.pitch;
  }

  getDistance(): number {
    return this.currentDistance;
  }

  /** 滚轮缩放的目标距离（调试与测试用）。 */
  getTargetDistance(): number {
    return this.targetDistance;
  }

  getFollowPoint(): Vector3 {
    return this.followPoint;
  }

  /** 当前注视点（跟随点 + 前看偏移）；调试与构图测试用。 */
  getLookTarget(): Vector3 {
    return this.lookTarget;
  }

  /** 当前前看距离（米）；调试与构图测试用。 */
  getLookAhead(): number {
    return this.lookAheadDistance();
  }

  /** 是否处于结局运镜中（调试与测试用）。 */
  isFinaleActive(): boolean {
    return this.finaleActive;
  }

  /** 结局运镜的目标距离（调试与测试用）。 */
  getFinaleTargetDistance(): number {
    return this.finaleTargetDistance;
  }

  /** 结局运镜的目标俯角（调试与测试用）。 */
  getFinaleTargetPitch(): number {
    return this.finaleTargetPitch;
  }

  // ---- 结局运镜 ----

  /**
   * 仅响应花树节点：`story:completed({ nodeId: "tree" })`。
   * 记录当前 yaw 后不动，锁定目标距离/俯角，交给 update 的同一套指数阻尼推进。
   * 幂等：重复事件不会重设进度（不会把镜头拉回起点）。
   */
  private handleStoryCompleted(nodeId: string): void {
    if (nodeId !== "tree" || this.finaleActive) return;
    this.finaleActive = true;
    this.finaleElapsed = 0;
    this.finaleUserControlled = false;
    this.finaleTargetDistance = CAMERA_FINALE_DISTANCE;
    this.finaleTargetPitch = CAMERA_FINALE_PITCH;
    // 运镜接管镜头后清空可能残留的输入增量，避免运镜结束瞬间被旧增量顶一下。
    this.input.handleWindowBlur();
  }

  /** 阻尼推进运镜（复用其他距离/角度同构的指数阻尼，无计时器硬切）。 */
  private updateFinale(step: number): void {
    const blend = 1 - Math.exp(-CAMERA_FINALE_RATE * step);
    this.currentDistance += (this.finaleTargetDistance - this.currentDistance) * blend;
    // 距离与俯角同步逼近；目标值由常量给出，yaw 全程保持不变（保留朝向）。
    this.pitch += (this.finaleTargetPitch - this.pitch) * blend;
    // 同步常规缩放目标，运镜结束/重置后不会回弹到旧值。
    this.targetDistance = this.currentDistance;
  }

  /** 清除运镜状态（reset / dispose 共用）。 */
  private clearFinale(): void {
    this.finaleActive = false;
    this.finaleElapsed = 0;
    this.finaleUserControlled = false;
    this.finaleTargetDistance = CAMERA_FINALE_DISTANCE;
    this.finaleTargetPitch = CAMERA_FINALE_PITCH;
  }

  /** 立即把镜头摆到理想位（init / reset 用，避免开场或重置时镜头飞入）。 */
  private snapToTarget(context: GameContext): void {
    const playerPosition = this.playerSource.getPlayerSnapshot().position;
    this.followPoint.set(playerPosition.x, playerPosition.y + CAMERA_HEAD_OFFSET, playerPosition.z);
    this.currentDistance = this.targetDistance;
    this.applyCameraTransform(context);
  }

  private resetToSpawn(context: GameContext): void {
    // 结束结局运镜，恢复默认距离/俯角与可用输入（PRD P0 reset 要求）。
    this.clearFinale();
    this.yaw = 0;
    this.pitch = this.defaultPitch;
    this.targetDistance = this.defaultDistance;
    // clearKeys 清空方向键；拖拽/滚轮增量由 handleWindowBlur 一并丢弃。
    this.input.clearKeys();
    this.input.handleWindowBlur();
    // 强制 lerp 收敛：直接置为玩家当前位置再快照。
    this.snapToTarget(context);
  }

  private applyCameraTransform(context: GameContext): void {
    const camera = context.camera;
    const cosPitch = Math.cos(this.pitch);
    // 镜头位于跟随点的“yaw 方向反向”处；yaw=0 时镜头在 +Z 侧，看向 -Z。
    const offsetX = Math.sin(this.yaw) * cosPitch * this.currentDistance;
    const offsetY = Math.sin(this.pitch) * this.currentDistance;
    const offsetZ = Math.cos(this.yaw) * cosPitch * this.currentDistance;

    const camX = this.followPoint.x + offsetX;
    const camZ = this.followPoint.z + offsetZ;
    let camY = this.followPoint.y + offsetY;

    // 基础地形避让：本帧镜头 XZ 处的地形高度 + 最小间距（PRD 9.3）。
    const groundY = context.world.sampleHeight(camX, camZ);
    if (Number.isFinite(groundY)) {
      camY = Math.max(camY, groundY + CAMERA_TERRAIN_CLEARANCE);
    }

    // 前看：注视点沿镜头水平前向（即 -yaw 方向）前移，把角色压到画面中下部。
    const lookAhead = this.lookAheadDistance();
    this.lookTarget.set(
      this.followPoint.x - Math.sin(this.yaw) * lookAhead,
      this.followPoint.y,
      this.followPoint.z - Math.cos(this.yaw) * lookAhead,
    );

    camera.position.set(camX, camY, camZ);
    camera.lookAt(this.lookTarget);
  }

  /**
   * 前看距离：显式值优先；否则随当前距离等比缩放（默认 5m → 1.6m），
   * 并钳制在绝对上下限内，保证 3～14m 全程构图不跑偏。
   */
  private lookAheadDistance(): number {
    if (this.fixedLookAhead !== null) {
      return this.fixedLookAhead;
    }
    return Math.min(
      LOOK_AHEAD_MAX,
      Math.max(LOOK_AHEAD_MIN, this.currentDistance * CAMERA_LOOK_AHEAD_RATIO),
    );
  }

  private createStatSource(): DebugStatSource {
    return {
      id: "camera",
      read: () => ({
        cameraYaw: Number(this.yaw.toFixed(4)),
        cameraPitch: Number(this.pitch.toFixed(4)),
        cameraDistance: Number(this.currentDistance.toFixed(4)),
        cameraLookAhead: Number(this.lookAheadDistance().toFixed(4)),
        cameraFinale: this.finaleActive,
      }),
    };
  }
}

function clampMagnitude(value: number, max: number): number {
  if (value > max) return max;
  if (value < -max) return -max;
  return value;
}
