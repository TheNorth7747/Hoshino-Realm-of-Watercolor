/**
 * 星灵伙伴“团仔”（A4，PRD 9.5，AC-07）。
 *
 * - 玩家侧后方约 2.2m 悬浮跟随（1.5～2.5m 区间），平滑追踪 + 上下浮动。
 * - 距玩家 >12m 立即回收；水平间距 >2.5m 且 2 秒内没有实质缩小（卡住）也回收。
 * - 靠近当前故事目标时弹跳引导并朝向目标；目标推进只靠 `story:completed` 事件。
 * - 程序化原创占位形象；重置由 `game:reset` 驱动；dispose 释放全部几何体/材质。
 *
 * 朝向约定：headingRadians = 0 时玩家面向 -Z（Three.js 物体前方约定）。
 * 若 A2 采用不同约定，只需调整这里的 forward 推导，不影响故事系统。
 */
import { Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from "three";
import type {
  DebugStatSource,
  GameContext,
  GameSystem,
  LandmarkId,
  PlayerSource,
  StoryNodeId,
  Unsubscribe,
} from "../core/contracts";
import { LANDMARKS, STORY_NODE_ORDER, distanceXZ } from "../config/world";
import { disposeObject3D } from "../core/dispose";

export interface CompanionOptions {
  readonly player: PlayerSource;
}

const FOLLOW_REAR_METERS = 1.9;
const FOLLOW_SIDE_METERS = 1.1;
const HOVER_HEIGHT = 1.15;
const BOB_AMPLITUDE = 0.12;
const GUIDE_HOP_AMPLITUDE = 0.3;
const PURSUIT_STIFFNESS = 4;
const YAW_STIFFNESS = 6;
const RECOVERY_DISTANCE = 12;
const STUCK_SECONDS = 2;
const STUCK_MIN_GAP = 2.5;
const STUCK_MIN_PROGRESS = 0.25;
const GUIDE_RANGE_SCALE = 1.6;

export class CompanionController implements GameSystem {
  readonly id = "companion";
  readonly phase = "companion" as const;

  private readonly player: PlayerSource;
  private root: Group | null = null;
  private ring: Mesh | null = null;
  private readonly unsubs: Unsubscribe[] = [];
  private unregisterStats: Unsubscribe | null = null;

  private readonly desired = new Vector3();
  private readonly base = new Vector3();
  private readonly forward = new Vector3();
  private animTime = 0;
  private stuckTimer = 0;
  private lastGapXZ = 0;
  private recoveries = 0;
  private yaw = 0;
  private guideTarget: LandmarkId | null = "flower";
  private guiding = false;

  private readonly handleReset = (): void => {
    this.guideTarget = "flower";
    this.stuckTimer = 0;
    this.recoveries = 0;
    this.guiding = false;
    const snapshot = this.player.getPlayerSnapshot();
    this.computeDesired(snapshot.position, snapshot.headingRadians);
    this.base.copy(this.desired);
    this.root?.position.copy(this.desired);
    this.lastGapXZ = distanceXZ(this.desired, snapshot.position);
  };

  private readonly handleStoryCompleted = (payload: { nodeId: StoryNodeId }): void => {
    const index = STORY_NODE_ORDER.indexOf(payload.nodeId);
    const next = STORY_NODE_ORDER[index + 1];
    this.guideTarget = next ?? null;
  };

  private readonly handleFinished = (): void => {
    this.guideTarget = null;
  };

  constructor(options: CompanionOptions) {
    this.player = options.player;
  }

  get object3d(): Group | null {
    return this.root;
  }

  init(context: GameContext): void {
    this.root = this.buildPlaceholder();
    context.scene.add(this.root);

    const snapshot = this.player.getPlayerSnapshot();
    this.computeDesired(snapshot.position, snapshot.headingRadians);
    this.base.copy(this.desired);
    this.root.position.copy(this.desired);
    this.lastGapXZ = distanceXZ(this.desired, snapshot.position);
    this.yaw = snapshot.headingRadians;
    this.root.rotation.y = this.yaw;

    this.unsubs.push(context.events.on("game:reset", this.handleReset));
    this.unsubs.push(context.events.on("story:completed", this.handleStoryCompleted));
    this.unsubs.push(context.events.on("game:finished", this.handleFinished));
    this.unregisterStats = context.debug.registerStatSource(this.statSource);
  }

  update(deltaSeconds: number, _context: GameContext): void {
    if (!this.root) return;
    this.animTime += deltaSeconds;
    const snapshot = this.player.getPlayerSnapshot();
    const playerPosition = snapshot.position;

    this.computeDesired(playerPosition, snapshot.headingRadians);

    if (this.root.position.distanceTo(playerPosition) > RECOVERY_DISTANCE) {
      this.snapToDesired();
    } else {
      const alpha = 1 - Math.exp(-PURSUIT_STIFFNESS * deltaSeconds);
      this.base.lerp(this.desired, alpha);
    }

    this.guiding = this.computeGuiding(playerPosition);
    const targetYaw = this.guiding ? this.yawTowardGuide(playerPosition) : snapshot.headingRadians;
    this.yaw = dampAngle(this.yaw, targetYaw, YAW_STIFFNESS, deltaSeconds);
    this.root.rotation.y = this.yaw;

    const bob = Math.sin(this.animTime * 2.2) * BOB_AMPLITUDE;
    const hop = this.guiding ? Math.abs(Math.sin(this.animTime * 6)) * GUIDE_HOP_AMPLITUDE : 0;
    this.root.position.set(this.base.x, this.base.y + bob + hop, this.base.z);

    const gapXZ = distanceXZ(this.root.position, playerPosition);
    const closedEnough = gapXZ < this.lastGapXZ - STUCK_MIN_PROGRESS * deltaSeconds;
    if (gapXZ > STUCK_MIN_GAP && !closedEnough) {
      this.stuckTimer += deltaSeconds;
      if (this.stuckTimer > STUCK_SECONDS) this.snapToDesired();
    } else {
      this.stuckTimer = 0;
    }

    this.lastGapXZ = distanceXZ(this.root.position, playerPosition);
    if (this.ring) this.ring.rotation.z += deltaSeconds * 0.8;
  }

  dispose(): void {
    for (const unsubscribe of this.unsubs) unsubscribe();
    this.unsubs.length = 0;
    this.unregisterStats?.();
    this.unregisterStats = null;
    if (this.root) disposeObject3D(this.root);
    this.root = null;
    this.ring = null;
  }

  /** 侧后方跟随点：rear 1.9m + right 1.1m（合成约 2.2m），悬浮高度随玩家贴地。 */
  private computeDesired(playerPosition: Vector3, headingRadians: number): void {
    this.forward.set(-Math.sin(headingRadians), 0, -Math.cos(headingRadians));
    const rightX = -this.forward.z;
    const rightZ = this.forward.x;
    this.desired.set(
      playerPosition.x - this.forward.x * FOLLOW_REAR_METERS + rightX * FOLLOW_SIDE_METERS,
      playerPosition.y + HOVER_HEIGHT,
      playerPosition.z - this.forward.z * FOLLOW_REAR_METERS + rightZ * FOLLOW_SIDE_METERS,
    );
  }

  private snapToDesired(): void {
    this.base.copy(this.desired);
    this.root?.position.copy(this.desired);
    this.stuckTimer = 0;
    this.recoveries += 1;
  }

  private computeGuiding(playerPosition: Vector3): boolean {
    if (this.guideTarget === null) return false;
    const landmark = LANDMARKS[this.guideTarget];
    return distanceXZ(landmark, playerPosition) <= landmark.triggerRadius * GUIDE_RANGE_SCALE;
  }

  private yawTowardGuide(playerPosition: Vector3): number {
    if (this.guideTarget === null) return this.yaw;
    const landmark = LANDMARKS[this.guideTarget];
    return Math.atan2(-(landmark.x - playerPosition.x), -(landmark.z - playerPosition.z));
  }

  private buildPlaceholder(): Group {
    const root = new Group();
    root.name = "companion-tuanzai";

    const body = new Mesh(
      new SphereGeometry(0.32, 24, 16),
      new MeshStandardMaterial({
        color: 0xfff3d6,
        emissive: 0xffdf9e,
        emissiveIntensity: 0.5,
        roughness: 0.6,
      }),
    );
    body.name = "companion-body";
    body.scale.set(1, 0.92, 1);
    root.add(body);

    const eyeGeometry = new SphereGeometry(0.05, 12, 8);
    const eyeMaterial = new MeshStandardMaterial({ color: 0x3a332c, roughness: 0.4 });
    for (const side of [-1, 1]) {
      const eye = new Mesh(eyeGeometry, eyeMaterial);
      eye.name = side < 0 ? "companion-eye-left" : "companion-eye-right";
      eye.position.set(side * 0.11, 0.05, -0.27);
      root.add(eye);
    }

    this.ring = new Mesh(
      new TorusGeometry(0.45, 0.025, 8, 32),
      new MeshStandardMaterial({
        color: 0xffe9a8,
        emissive: 0xffd76a,
        emissiveIntensity: 0.9,
        roughness: 0.5,
      }),
    );
    this.ring.name = "companion-halo";
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = -0.05;
    root.add(this.ring);

    return root;
  }

  private readonly statSource: DebugStatSource = {
    id: "companion",
    read: () => ({
      distance: this.root
        ? Number(this.root.position.distanceTo(this.player.getPlayerSnapshot().position).toFixed(2))
        : 0,
      stuckSeconds: Number(this.stuckTimer.toFixed(2)),
      recoveries: this.recoveries,
      guiding: this.guiding,
      target: this.guideTarget ?? "-",
    }),
  };
}

function dampAngle(current: number, target: number, stiffness: number, dt: number): number {
  let delta = (target - current) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-stiffness * dt));
}
