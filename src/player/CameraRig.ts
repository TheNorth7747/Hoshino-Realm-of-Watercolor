/**
 * 第三人称镜头 Rig（A2，PRD 9.3 / AC-02）。
 *
 * 职责：
 * - 平滑跟随：跟随点（玩家头部偏移）与镜头距离都做指数阻尼，帧率无关。
 * - 鼠标拖拽旋转：偏航/俯仰，俯仰钳制，灵敏度按像素。
 * - 滚轮缩放：目标距离乘性缩放并钳制到 [min, max]，距离平滑过渡。
 * - 基础地形避让：镜头 XZ 处采样地形高度，保证高于地面 clearance
 *   （PRD 9.3“摄像机做基础地形避让”；树木遮挡淡化属于 P1）。
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

/** 默认镜头距离（米）。 */
export const CAMERA_DEFAULT_DISTANCE = 8;
export const CAMERA_MIN_DISTANCE = 3;
export const CAMERA_MAX_DISTANCE = 14;
/** 默认俯仰角（弧度，约 24°，镜头略高于头顶向下看）。 */
export const CAMERA_DEFAULT_PITCH = 0.42;
export const CAMERA_MIN_PITCH = 0.08;
export const CAMERA_MAX_PITCH = 1.15;
/** 拖拽灵敏度（弧度/像素）。 */
export const CAMERA_DRAG_SENSITIVITY = 0.005;
/** 滚轮缩放系数：每像素 deltaY 对应的距离乘性因子。 */
export const CAMERA_WHEEL_STEP = 0.0015;
/** 跟随点与距离的阻尼速率（1/s）。 */
export const CAMERA_FOLLOW_RATE = 8;
export const CAMERA_ZOOM_RATE = 8;
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
}

export class CameraRig implements GameSystem {
  readonly id = "camera";
  readonly phase = "camera" as const;

  private readonly playerSource: PlayerSource;
  private readonly input: InputState;
  private readonly defaultDistance: number;
  private readonly defaultPitch: number;

  private yaw = 0; // 0 = 镜头在目标 +Z 方向，看向 -Z（主路线方向）
  private pitch: number;
  private targetDistance: number;
  private currentDistance: number;
  private readonly followPoint = new Vector3Impl();

  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly tmpDesired = new Vector3Impl();

  constructor(options: CameraRigOptions) {
    this.playerSource = options.playerSource;
    this.input = options.input;
    this.defaultDistance = options.distance ?? CAMERA_DEFAULT_DISTANCE;
    this.defaultPitch = options.pitch ?? CAMERA_DEFAULT_PITCH;
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
      context.debug.registerStatSource(this.createStatSource()),
    );
  }

  update(deltaSeconds: number, context: GameContext): void {
    const step = clampDelta(deltaSeconds, context.settings.maxDeltaSeconds);

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

  getFollowPoint(): Vector3 {
    return this.followPoint;
  }

  /** 立即把镜头摆到理想位（init / reset 用，避免开场或重置时镜头飞入）。 */
  private snapToTarget(context: GameContext): void {
    const playerPosition = this.playerSource.getPlayerSnapshot().position;
    this.followPoint.set(playerPosition.x, playerPosition.y + CAMERA_HEAD_OFFSET, playerPosition.z);
    this.currentDistance = this.targetDistance;
    this.applyCameraTransform(context);
  }

  private resetToSpawn(context: GameContext): void {
    this.yaw = 0;
    this.pitch = this.defaultPitch;
    this.targetDistance = this.defaultDistance;
    this.input.clearKeys();
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

    camera.position.set(camX, camY, camZ);
    camera.lookAt(this.followPoint);
  }

  private createStatSource(): DebugStatSource {
    return {
      id: "camera",
      read: () => ({
        cameraYaw: Number(this.yaw.toFixed(4)),
        cameraPitch: Number(this.pitch.toFixed(4)),
        cameraDistance: Number(this.currentDistance.toFixed(4)),
      }),
    };
  }
}

function clampMagnitude(value: number, max: number): number {
  if (value > max) return max;
  if (value < -max) return -max;
  return value;
}
