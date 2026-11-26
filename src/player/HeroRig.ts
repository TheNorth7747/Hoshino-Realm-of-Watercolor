/**
 * 角色动作系统（V0.2，PRD 5.2「初步表现：斗篷轻摆」+ 手册要求 6）。
 *
 * 纯程序化、无动画文件、无外部资产。全部动作都由**实际速度**与**相位累积**驱动，
 * 不存在"看起来有动画但其实静止"的伪实现：
 *
 * | 状态 | 触发条件 | 表现 |
 * |---|---|---|
 * | idle | speed < 0.15 m/s | 极轻呼吸起伏 + 斗篷缓慢前后摆（±2°） |
 * | walk | 0.15 ≤ speed < 5.2 | 双腿交替摆动、手臂反相摆臂、身体上下起伏、斗篷滞后 |
 * | run  | speed ≥ 5.2（Shift 小跑 6.2） | 同上但幅度更大、频率更高、前倾更明显 |
 *
 * 关键实现点：
 * - 相位 `phase` 按 `speed / 步幅 × dt` 累积，因此步频随实际速度变化，
 *   不会出现"速度变了但腿摆频率不变"的假动画。
 * - 斗篷摆动的输入是**上一帧速度与朝向变化**（滞后量），并做一阶低通，
 *   形成"被身体拖着走"的拖尾感，而不是和腿同相位抖动。
 * - 所有角度带幅度上限，避免低帧率或异常速度导致穿模/翻转。
 * - 只修改节点变换，不访问几何/材质，dispose 无需释放 GPU 资源。
 */
import type { HeroParts } from "./heroCharacter";

/** 走/跑状态。 */
export type HeroMotionState = "idle" | "walk" | "run";

/** 阈值：低于此速度视为静止。 */
export const HERO_IDLE_SPEED = 0.15;
/** 跑步阈值：与 PlayerController 的 sprint 速度（6.2）留出余量。 */
export const HERO_RUN_SPEED = 5.2;
/** 步幅（米）：每累积一个步幅距离，腿完成一个完整摆动周期。 */
const STRIDE_LENGTH = 2.2;
/** 腿摆最大幅度（弧度）。 */
const LEG_SWING_MAX = 0.55;
/** 手臂摆最大幅度（弧度），与腿反相。 */
const ARM_SWING_MAX = 0.4;
/** 身体起伏幅度（米）。 */
const BOB_AMPLITUDE = 0.028;
/** 前倾最大角（弧度）：走 0.05、跑 0.13。 */
const LEAN_WALK = 0.05;
const LEAN_RUN = 0.13;
/** 斗篷摆动最大角（弧度）。 */
const CLOAK_SWING_MAX = 0.16;
/** 斗篷低通系数（0～1，每帧接近目标的百分比，按 60fps 标定后做帧率补偿）。 */
const CLOAK_DAMPING = 0.12;

export interface HeroRigState {
  readonly motion: HeroMotionState;
  /** 累积相位（弧度）。 */
  readonly phase: number;
  /** 当前腿摆角（弧度，左腿）。 */
  readonly legSwing: number;
  /** 当前臂摆角（弧度，左臂）。 */
  readonly armSwing: number;
  /** 当前身体起伏偏移（米）。 */
  readonly bob: number;
  /** 当前前倾角（弧度）。 */
  readonly lean: number;
  /** 当前斗篷摆角（弧度）。 */
  readonly cloakSwing: number;
  /** 当前速度（m/s），反映实际驱动量。 */
  readonly speed: number;
}

export class HeroRig {
  private readonly parts: HeroParts;

  private phase = 0;
  private motion: HeroMotionState = "idle";
  private legSwing = 0;
  private armSwing = 0;
  private bob = 0;
  private lean = 0;
  private cloakSwing = 0;
  private cloakVelocity = 0;
  private previousSpeed = 0;
  private speed = 0;
  private breathingPhase = 0;

  constructor(parts: HeroParts) {
    this.parts = parts;
  }

  /**
   * 每帧更新。
   * @param deltaSeconds 已截断的步长
   * @param speed 实际水平速度（m/s）
   */
  update(deltaSeconds: number, speed: number): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.05));
    this.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
    this.motion = resolveMotionState(this.speed);

    if (this.motion === "idle") {
      this.updateIdle(dt);
    } else {
      this.updateLocomotion(dt);
    }

    this.applyTransforms(dt);
    this.previousSpeed = this.speed;
  }

  /** 回到初始姿态（game:reset / 出生时）。 */
  reset(): void {
    this.phase = 0;
    this.motion = "idle";
    this.legSwing = 0;
    this.armSwing = 0;
    this.bob = 0;
    this.lean = 0;
    this.cloakSwing = 0;
    this.cloakVelocity = 0;
    this.previousSpeed = 0;
    this.speed = 0;
    this.breathingPhase = 0;
    this.applyTransforms(0);
  }

  getState(): HeroRigState {
    return {
      motion: this.motion,
      phase: this.phase,
      legSwing: this.legSwing,
      armSwing: this.armSwing,
      bob: this.bob,
      lean: this.lean,
      cloakSwing: this.cloakSwing,
      speed: this.speed,
    };
  }

  // ---- 内部 ----

  /** 静止：呼吸起伏 + 斗篷缓慢摆动，幅度小但非零（可与"完全静止"区分）。 */
  private updateIdle(dt: number): void {
    this.breathingPhase += dt * 1.25;
    this.legSwing = 0;
    this.armSwing = 0;
    this.lean *= 1 - Math.min(1, dt * 7);
    this.bob = Math.sin(this.breathingPhase) * 0.008;
    // 静止时斗篷几乎不动，仅极轻微呼吸带动。
    this.cloakVelocity *= 1 - Math.min(1, dt * 5);
    this.cloakSwing +=
      (Math.sin(this.breathingPhase * 0.6) * 0.02 - this.cloakSwing) * Math.min(1, dt * 4);
  }

  /** 走/跑：相位按 实际速度/步幅 累积，四肢与起伏由相位驱动。 */
  private updateLocomotion(dt: number): void {
    const isRun = this.motion === "run";
    // 步频 ∝ 实际速度：速度快则步频高，绝不在速度变化时保持固定频率。
    this.phase += (this.speed / STRIDE_LENGTH) * Math.PI * 2 * dt;
    if (this.phase > Math.PI * 200) this.phase -= Math.PI * 200; // 防长期漂移

    const legAmplitude = LEG_SWING_MAX * (isRun ? 1.15 : 1);
    const armAmplitude = ARM_SWING_MAX * (isRun ? 1.2 : 1);

    this.legSwing = Math.sin(this.phase) * legAmplitude;
    this.armSwing = -Math.sin(this.phase) * armAmplitude; // 与腿反相
    // 每步两次起伏（左右脚各一次）。
    this.bob = Math.abs(Math.sin(this.phase)) * BOB_AMPLITUDE * (isRun ? 1.35 : 1);
    const targetLean = isRun ? LEAN_RUN : LEAN_WALK;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

    // 斗篷滞后摆动：由"速度变化率 + 身体相位"共同驱动，再做一阶低通。
    // 加速时斗篷被向后拖（模型朝 +Z，绕 X 轴负角 = 下摆后飘），减速时回落并轻微过冲。
    const accel = (this.speed - this.previousSpeed) / Math.max(dt, 1e-4);
    const dragTarget = clamp(
      -accel * 0.02 + Math.sin(this.phase - 0.9) * CLOAK_SWING_MAX * (isRun ? 1.1 : 0.8),
      -CLOAK_SWING_MAX * 1.6,
      CLOAK_SWING_MAX * 1.6,
    );
    // 帧率补偿：60fps 下的 CLOAK_DAMPING 换算到当前 dt。
    const damping = 1 - Math.pow(1 - CLOAK_DAMPING, dt * 60);
    this.cloakVelocity += (dragTarget - this.cloakSwing) * damping;
    this.cloakSwing += this.cloakVelocity * 0.65;
    this.cloakSwing = clamp(this.cloakSwing, -CLOAK_SWING_MAX * 1.8, CLOAK_SWING_MAX * 1.8);
  }

  private applyTransforms(_dt: number): void {
    const p = this.parts;
    // 身体：起伏 + 前倾（绕 X 轴，正方向前倾取决于模型朝 +Z）。
    p.body.position.y = this.bob;
    p.body.rotation.x = this.lean;

    // 双腿交替（绕髋 X 轴）。
    p.legLeft.rotation.x = this.legSwing;
    p.legRight.rotation.x = -this.legSwing;

    // 双臂反相摆动。
    p.armLeft.rotation.x = this.armSwing;
    p.armRight.rotation.x = -this.armSwing;

    // 斗篷滞后摆动（绕肩部 X 轴）+ 越跑越向后展开（负 X 表示向后飘）。
    p.cloak.rotation.x = this.cloakSwing;

    // 头部轻微反向补偿，避免跑动时整颗头随身体前倾过多。
    p.head.rotation.x =
      -this.lean * 0.5 + Math.sin(this.phase) * 0.015 * (this.motion === "idle" ? 0 : 1);
  }
}

/** 状态判定（纯函数，便于单测与调试面板复用）。 */
export function resolveMotionState(speed: number): HeroMotionState {
  if (!Number.isFinite(speed) || speed < HERO_IDLE_SPEED) return "idle";
  if (speed >= HERO_RUN_SPEED) return "run";
  return "walk";
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
