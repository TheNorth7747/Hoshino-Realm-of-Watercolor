/**
 * 角色动作系统（V0.2 / V0.3 新增滞空跳跃动作）。
 *
 * 状态：idle | walk | run | jump
 */
import type { HeroParts } from "./heroCharacter";

export type HeroMotionState = "idle" | "walk" | "run" | "jump";

export const HERO_IDLE_SPEED = 0.15;
export const HERO_RUN_SPEED = 5.2;
const STRIDE_LENGTH = 2.2;
const LEG_SWING_MAX = 0.55;
const ARM_SWING_MAX = 0.4;
const BOB_AMPLITUDE = 0.028;
const LEAN_WALK = 0.05;
const LEAN_RUN = 0.13;
const CLOAK_SWING_MAX = 0.16;
const CLOAK_DAMPING = 0.12;

export interface HeroRigState {
  readonly motion: HeroMotionState;
  readonly phase: number;
  readonly legSwing: number;
  readonly armSwing: number;
  readonly bob: number;
  readonly lean: number;
  readonly cloakSwing: number;
  readonly speed: number;
  readonly grounded: boolean;
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
  private grounded = true;
  private breathingPhase = 0;

  constructor(parts: HeroParts) {
    this.parts = parts;
  }

  update(
    deltaSeconds: number,
    speed: number,
    grounded: boolean = true,
    verticalVelocity: number = 0,
  ): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.05));
    this.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
    this.grounded = grounded;

    if (!grounded) {
      this.motion = "jump";
      this.updateAirborne(dt, verticalVelocity);
    } else {
      this.motion = resolveMotionState(this.speed);
      if (this.motion === "idle") {
        this.updateIdle(dt);
      } else {
        this.updateLocomotion(dt);
      }
    }

    this.applyTransforms(dt);
    this.previousSpeed = this.speed;
  }

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
    this.grounded = true;
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
      grounded: this.grounded,
    };
  }

  private updateAirborne(dt: number, verticalVelocity: number): void {
    const safeVy = Number.isFinite(verticalVelocity) ? verticalVelocity : 0;
    const blend = Math.min(1, dt * 12);
    // 滞空收腿与自然举臂
    this.legSwing += (0.42 - this.legSwing) * blend;
    this.armSwing += (-0.34 - this.armSwing) * blend;
    this.bob += (0.04 - this.bob) * blend;
    this.lean += ((this.speed > 1 ? 0.14 : 0.04) - this.lean) * blend;
    // 起跳与下落时斗篷轻盈扬起
    const cloakTarget = clamp(-0.24 - safeVy * 0.025, -0.34, 0.12);
    this.cloakSwing += (cloakTarget - this.cloakSwing) * Math.min(1, dt * 10);
  }

  private updateIdle(dt: number): void {
    this.breathingPhase += dt * 1.25;
    this.legSwing = 0;
    this.armSwing = 0;
    this.lean *= 1 - Math.min(1, dt * 7);
    this.bob = Math.sin(this.breathingPhase) * 0.008;
    this.cloakVelocity *= 1 - Math.min(1, dt * 5);
    this.cloakSwing +=
      (Math.sin(this.breathingPhase * 0.6) * 0.02 - this.cloakSwing) * Math.min(1, dt * 4);
  }

  private updateLocomotion(dt: number): void {
    const isRun = this.motion === "run";
    this.phase += (this.speed / STRIDE_LENGTH) * Math.PI * 2 * dt;
    if (this.phase > Math.PI * 200) this.phase -= Math.PI * 200;

    const legAmplitude = LEG_SWING_MAX * (isRun ? 1.15 : 1);
    const armAmplitude = ARM_SWING_MAX * (isRun ? 1.2 : 1);

    this.legSwing = Math.sin(this.phase) * legAmplitude;
    this.armSwing = -Math.sin(this.phase) * armAmplitude;
    this.bob = Math.abs(Math.sin(this.phase)) * BOB_AMPLITUDE * (isRun ? 1.35 : 1);
    const targetLean = isRun ? LEAN_RUN : LEAN_WALK;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 8);

    const accel = (this.speed - this.previousSpeed) / Math.max(dt, 1e-4);
    const dragTarget = clamp(
      -accel * 0.02 + Math.sin(this.phase - 0.9) * CLOAK_SWING_MAX * (isRun ? 1.1 : 0.8),
      -CLOAK_SWING_MAX * 1.6,
      CLOAK_SWING_MAX * 1.6,
    );
    const damping = 1 - Math.pow(1 - CLOAK_DAMPING, dt * 60);
    this.cloakVelocity += (dragTarget - this.cloakSwing) * damping;
    this.cloakSwing += this.cloakVelocity * 0.65;
    this.cloakSwing = clamp(this.cloakSwing, -CLOAK_SWING_MAX * 1.8, CLOAK_SWING_MAX * 1.8);
  }

  private applyTransforms(_dt: number): void {
    const p = this.parts;
    p.body.position.y = this.bob;
    p.body.rotation.x = this.lean;

    if (this.motion === "jump") {
      p.legLeft.rotation.x = this.legSwing;
      p.legRight.rotation.x = -this.legSwing * 0.65;
    } else {
      p.legLeft.rotation.x = this.legSwing;
      p.legRight.rotation.x = -this.legSwing;
    }

    p.armLeft.rotation.x = this.armSwing;
    p.armRight.rotation.x = -this.armSwing;
    p.cloak.rotation.x = this.cloakSwing;
    p.head.rotation.x =
      -this.lean * 0.5 + Math.sin(this.phase) * 0.015 * (this.motion === "idle" ? 0 : 1);
  }
}

export function resolveMotionState(speed: number): HeroMotionState {
  if (!Number.isFinite(speed) || speed < HERO_IDLE_SPEED) return "idle";
  if (speed >= HERO_RUN_SPEED) return "run";
  return "walk";
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
