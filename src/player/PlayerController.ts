/**
 * 玩家控制器（A2 / V0.3 新增 Space 跳跃与接地接触阴影缩放）。
 */
import type { Group, PerspectiveCamera } from "three";
import { Vector3 } from "three";
import type {
  DebugStatSource,
  GameContext,
  GameSystem,
  PlayerSnapshot,
  PlayerSource,
} from "../core/contracts";
import { clampDelta } from "../core/config";
import { disposeObject3D } from "../core/dispose";
import { spawnPosition } from "../config/world";
import { CollisionWorld, type CollisionCircle } from "./collision";
import { InputState } from "./InputState";
import { DomInputBinder } from "./DomInputBinder";
import { createHeroMesh, type HeroParts } from "./heroCharacter";
import { HeroRig, type HeroRigState } from "./HeroRig";

export const PLAYER_MOVE_SPEED = 4.2;
export const PLAYER_SPRINT_SPEED = 6.2;
export const PLAYER_JUMP_SPEED = 5.6;
export const PLAYER_GRAVITY = 16.0;
export const PLAYER_ACCEL_RATE = 12;
export const PLAYER_TURN_RATE = 10;
export const PLAYER_COLLISION_RADIUS = 0.4;
const TURN_SPEED_THRESHOLD = 0.05;

export interface PlayerControllerOptions {
  readonly input?: InputState | undefined;
  readonly moveSpeed?: number | undefined;
  readonly sprintSpeed?: number | undefined;
  readonly playerRadius?: number | undefined;
}

export class PlayerController implements GameSystem, PlayerSource {
  readonly id = "player";
  readonly phase = "player" as const;

  readonly input: InputState;
  readonly colliders = new CollisionWorld();

  private readonly moveSpeed: number;
  private readonly sprintSpeed: number;
  private readonly playerRadius: number;

  private readonly position = new Vector3();
  private readonly velocity = new Vector3();
  private verticalVelocity = 0;
  private headingRadians = Math.PI;
  private grounded = true;
  private controlsEnabled = true;

  private readonly snapshot: PlayerSnapshot;
  private mesh: Group | null = null;
  private heroParts: HeroParts | null = null;
  private heroRig: HeroRig | null = null;
  private binder: DomInputBinder | null = null;
  private readonly unsubscribeFns: Array<() => void> = [];

  private readonly cameraForward = new Vector3(0, 0, -1);
  private readonly tmpForward = new Vector3();

  constructor(options: PlayerControllerOptions = {}) {
    this.input = options.input ?? new InputState();
    this.moveSpeed = options.moveSpeed ?? PLAYER_MOVE_SPEED;
    this.sprintSpeed = options.sprintSpeed ?? PLAYER_SPRINT_SPEED;
    this.playerRadius = options.playerRadius ?? PLAYER_COLLISION_RADIUS;

    const spawn = spawnPosition();
    this.position.copy(spawn);

    this.snapshot = {
      position: this.position,
      headingRadians: this.headingRadians,
      speed: 0,
      grounded: true,
    };
  }

  init(context: GameContext): void {
    const spawn = spawnPosition();
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.headingRadians = Math.PI;
    this.syncSnapshot();

    this.heroParts = createHeroMesh();
    this.heroRig = new HeroRig(this.heroParts);
    this.mesh = this.heroParts.root;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.headingRadians;
    context.worldRoot.add(this.mesh);

    this.attachInputBinder(context);

    this.unsubscribeFns.push(
      context.events.on("game:reset", () => this.resetToSpawn(context)),
      context.debug.registerStatSource(this.createStatSource()),
    );
  }

  update(deltaSeconds: number, context: GameContext): void {
    const step = clampDelta(deltaSeconds, context.settings.maxDeltaSeconds);

    const axes = this.input.readMoveAxes();
    const forward = this.readCameraForwardXZ(context.camera);
    const rightX = -forward.z;
    const rightZ = forward.x;

    let moveX = forward.x * axes.z + rightX * axes.x;
    let moveZ = forward.z * axes.z + rightZ * axes.x;
    const rawLength = Math.hypot(moveX, moveZ);
    const magnitude = Math.min(1, rawLength);
    if (rawLength > 1e-6) {
      moveX /= rawLength;
      moveZ /= rawLength;
    }

    const baseSpeed = this.input.isSprinting() ? this.sprintSpeed : this.moveSpeed;
    const targetVX = moveX * baseSpeed * magnitude;
    const targetVZ = moveZ * baseSpeed * magnitude;

    const blend = 1 - Math.exp(-PLAYER_ACCEL_RATE * step);
    this.velocity.x += (targetVX - this.velocity.x) * blend;
    this.velocity.z += (targetVZ - this.velocity.z) * blend;

    this.position.x += this.velocity.x * step;
    this.position.z += this.velocity.z * step;
    this.colliders.resolve(this.position, this.playerRadius);

    const bounds = context.world.bounds;
    this.position.x = Math.min(Math.max(this.position.x, bounds.minX), bounds.maxX);
    this.position.z = Math.min(Math.max(this.position.z, bounds.minZ), bounds.maxZ);

    const groundY = context.world.sampleHeight(this.position.x, this.position.z);
    const jumpPressed = this.input.consumeJumpPressed();

    if (Number.isFinite(groundY)) {
      if (this.grounded && jumpPressed) {
        this.verticalVelocity = PLAYER_JUMP_SPEED;
        this.grounded = false;
      }

      if (!this.grounded) {
        this.position.y += this.verticalVelocity * step;
        this.verticalVelocity -= PLAYER_GRAVITY * step;
        if (this.position.y <= groundY) {
          this.position.y = groundY;
          this.verticalVelocity = 0;
          this.grounded = true;
        }
      } else {
        this.position.y = groundY;
      }

      // 更新接触柔影：贴地置于脚底，跳跃离地时缩小
      if (this.heroParts) {
        const heightAboveGround = Math.max(0, this.position.y - groundY);
        const shadowScale = Math.max(0.45, 1 - heightAboveGround * 0.35);
        this.heroParts.shadow.position.y = 0.025 - heightAboveGround;
        this.heroParts.shadow.scale.setScalar(shadowScale);
      }
    } else {
      this.grounded = false;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > TURN_SPEED_THRESHOLD) {
      const targetHeading = Math.atan2(this.velocity.x, this.velocity.z);
      let delta = targetHeading - this.headingRadians;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.headingRadians += delta * (1 - Math.exp(-PLAYER_TURN_RATE * step));
    }

    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingRadians;
    }

    this.heroRig?.update(step, speed, this.grounded, this.verticalVelocity);
    this.syncSnapshot();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeFns) unsubscribe();
    this.unsubscribeFns.length = 0;
    this.binder?.dispose();
    this.binder = null;
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = null;
    }
    this.heroParts = null;
    this.heroRig = null;
    this.colliders.clear();
  }

  getPlayerSnapshot(): PlayerSnapshot {
    return this.snapshot;
  }

  getHeroMotionState(): HeroRigState | null {
    return this.heroRig?.getState() ?? null;
  }

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    this.input.setControlsEnabled(enabled);
  }

  isControlsEnabled(): boolean {
    return this.controlsEnabled;
  }

  addColliders(circles: readonly CollisionCircle[]): void {
    this.colliders.addAll(circles);
  }

  private resetToSpawn(context: GameContext): void {
    this.position.copy(spawnPosition());
    const groundY = context.world.sampleHeight(this.position.x, this.position.z);
    if (Number.isFinite(groundY)) this.position.y = groundY;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.headingRadians = Math.PI;
    this.input.clearKeys();
    this.heroRig?.reset();
    if (this.heroParts) {
      this.heroParts.shadow.position.y = 0.025;
      this.heroParts.shadow.scale.setScalar(1);
    }
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingRadians;
    }
    this.syncSnapshot();
  }

  private syncSnapshot(): void {
    (this.snapshot as { headingRadians: number }).headingRadians = this.headingRadians;
    (this.snapshot as { speed: number }).speed = Math.hypot(this.velocity.x, this.velocity.z);
    (this.snapshot as { grounded: boolean }).grounded = this.grounded;
  }

  private readCameraForwardXZ(camera: PerspectiveCamera): Vector3 {
    camera.getWorldDirection(this.tmpForward);
    const len = Math.hypot(this.tmpForward.x, this.tmpForward.z);
    if (len > 1e-4) {
      this.cameraForward.set(this.tmpForward.x / len, 0, this.tmpForward.z / len);
    }
    return this.cameraForward;
  }

  private attachInputBinder(context: GameContext): void {
    if (typeof window === "undefined") return;
    this.binder = new DomInputBinder({
      state: this.input,
      canvas: context.canvas,
      windowTarget: window,
    });
    this.binder.attach();
  }

  private createStatSource(): DebugStatSource {
    return {
      id: "player",
      read: () => ({
        positionX: round4(this.position.x),
        positionY: round4(this.position.y),
        positionZ: round4(this.position.z),
        headingRadians: round4(this.headingRadians),
        speed: round4(this.snapshot.speed),
        grounded: this.snapshot.grounded,
        colliders: this.colliders.count,
        heroMotion: this.heroRig?.getState().motion ?? "none",
        heroPhase: round4(this.heroRig?.getState().phase ?? 0),
        heroCloakSwing: round4(this.heroRig?.getState().cloakSwing ?? 0),
      }),
    };
  }
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}
