/**
 * 玩家控制器（A2，PRD 9.3 / AC-02）。
 *
 * 职责：
 * - WASD 相对镜头移动（方向取自 context.camera 的水平前向，含对角线归一化）。
 * - 角色朝移动方向平滑转向（指数阻尼，帧率无关）。
 * - 贴地：每帧用 context.world.sampleHeight 采样地形高度（A3 替换实现后无需改动）。
 * - 地图边界：用 context.world.bounds 夹紧，永不穿出（PRD 4.1）。
 * - 基础碰撞：圆形障碍推出滑动（A3 通过 getColliders() 注册树木等）。
 * - delta 截断：update 内部按 settings.maxDeltaSeconds 再截断一次，防瞬移（PRD 7.3）。
 * - 失焦清空输入：由 DomInputBinder 在 blur/隐藏时调用 InputState.handleWindowBlur。
 * - 符合共享契约 PlayerSnapshot / PlayerSource（core/contracts.ts 8.2），A1/A4 只读消费。
 *
 * 输入是事件驱动的（PRD 7.3 的“输入”阶段）：DOM 事件在两次 rAF 之间更新
 * InputState，本系统在 player 阶段读取，无需单独的每帧输入系统。
 *
 * 重置：监听 game:reset，唯一入口是事件（PRD 8.4），不提供第二套 reset 方法。
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

/** 常规移动速度（PRD 9.3：3.5～4.5 m/s）。 */
export const PLAYER_MOVE_SPEED = 4.2;
/** Shift 小跑速度（可选系统，PRD 9.3）。 */
export const PLAYER_SPRINT_SPEED = 6.2;
/** 速度指数阻尼速率（1/s）：约 0.25s 到达目标速度。 */
export const PLAYER_ACCEL_RATE = 12;
/** 转向指数阻尼速率（1/s）。 */
export const PLAYER_TURN_RATE = 10;
/** 玩家碰撞半径（米）。 */
export const PLAYER_COLLISION_RADIUS = 0.4;
/** 低于该速度不更新朝向，避免原地抖动。 */
const TURN_SPEED_THRESHOLD = 0.05;

export interface PlayerControllerOptions {
  /** 注入共享输入状态；缺省时自建（与 CameraRig 共享请用 createPlayerSystems）。 */
  readonly input?: InputState | undefined;
  readonly moveSpeed?: number | undefined;
  readonly sprintSpeed?: number | undefined;
  readonly playerRadius?: number | undefined;
}

export class PlayerController implements GameSystem, PlayerSource {
  readonly id = "player";
  readonly phase = "player" as const;

  /** 供 CameraRig / A4 消费的共享输入状态。 */
  readonly input: InputState;
  /** 障碍注册表：A3 在构建场景时添加圆形碰撞体。 */
  readonly colliders = new CollisionWorld();

  private readonly moveSpeed: number;
  private readonly sprintSpeed: number;
  private readonly playerRadius: number;

  private readonly position = new Vector3();
  private readonly velocity = new Vector3(); // 仅用 x/z 分量
  private headingRadians = Math.PI; // 出生朝向主路线：-Z（PRD 5.3）
  private grounded = true;
  private controlsEnabled = true;

  private readonly snapshot: PlayerSnapshot;
  private mesh: Group | null = null;
  /** V0.2 角色骨架与动作系统（null 表示未初始化/已释放）。 */
  private heroParts: HeroParts | null = null;
  private heroRig: HeroRig | null = null;
  private binder: DomInputBinder | null = null;
  private readonly unsubscribeFns: Array<() => void> = [];

  // 临时向量，避免每帧分配（PRD 7.3）。
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
    // 出生点来自 config/world.ts（spawn 地标），Y 由地形采样决定。
    const spawn = spawnPosition();
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
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
    // delta 截断：Game 已截断一次，这里防御性再截（PRD 7.3 maxDelta = 0.05s）。
    const step = clampDelta(deltaSeconds, context.settings.maxDeltaSeconds);

    const axes = this.input.readMoveAxes();
    const forward = this.readCameraForwardXZ(context.camera);
    // 镜头右向 = forward × up（水平面内）：f=(fx,0,fz) → right=(-fz, 0, fx)。
    const rightX = -forward.z;
    const rightZ = forward.x;

    let moveX = forward.x * axes.z + rightX * axes.x;
    let moveZ = forward.z * axes.z + rightZ * axes.x;
    // 归一化 + 幅度钳制：斜向不加速，方向必须除以同一个长度，避免速度超上限。
    const rawLength = Math.hypot(moveX, moveZ);
    const magnitude = Math.min(1, rawLength);
    if (rawLength > 1e-6) {
      moveX /= rawLength;
      moveZ /= rawLength;
    }

    const baseSpeed = this.input.isSprinting() ? this.sprintSpeed : this.moveSpeed;
    const targetVX = moveX * baseSpeed * magnitude;
    const targetVZ = moveZ * baseSpeed * magnitude;

    // 速度指数阻尼：加速与减速同一曲线，帧率无关。
    const blend = 1 - Math.exp(-PLAYER_ACCEL_RATE * step);
    this.velocity.x += (targetVX - this.velocity.x) * blend;
    this.velocity.z += (targetVZ - this.velocity.z) * blend;

    // 位移积分 → 障碍推出 → 边界夹紧（顺序保证永不穿出地图）。
    this.position.x += this.velocity.x * step;
    this.position.z += this.velocity.z * step;
    this.colliders.resolve(this.position, this.playerRadius);
    // 边界来自 context.world.bounds（Game 注入 config/world.ts 的 WORLD_BOUNDS），
    // 不在本模块复制另一套坐标（PRD 5.3 / 7.2）。
    const bounds = context.world.bounds;
    this.position.x = Math.min(Math.max(this.position.x, bounds.minX), bounds.maxX);
    this.position.z = Math.min(Math.max(this.position.z, bounds.minZ), bounds.maxZ);

    // 贴地：地形高度采样接口（A3 换真实地形后无需改动本文件）。
    const groundY = context.world.sampleHeight(this.position.x, this.position.z);
    if (Number.isFinite(groundY)) {
      this.position.y = groundY;
      this.grounded = true;
    } else {
      // 采样异常时保持原高度并标记离地，宁可悬空也不瞬移。
      this.grounded = false;
    }

    // 平滑转向：朝移动方向按最短角阻尼。
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
    // 角色动作由实际速度驱动（idle / walk / run）：传入的 speed 与 snapshot.speed 同源，
    // 不存在与真实移动脱节的“空转动画”。
    this.heroRig?.update(step, speed);
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

  /** V0.2 角色动作状态（调试面板与测试读取；未初始化时返回 null）。 */
  getHeroMotionState(): HeroRigState | null {
    return this.heroRig?.getState() ?? null;
  }

  /** 对话期间限速钩子（PRD 9.3）：关闭时输入轴读零；恢复后输入立即可用。 */
  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    this.input.setControlsEnabled(enabled);
  }

  isControlsEnabled(): boolean {
    return this.controlsEnabled;
  }

  /** A3 注册障碍入口。 */
  addColliders(circles: readonly CollisionCircle[]): void {
    this.colliders.addAll(circles);
  }

  private resetToSpawn(context: GameContext): void {
    this.position.copy(spawnPosition());
    const groundY = context.world.sampleHeight(this.position.x, this.position.z);
    if (Number.isFinite(groundY)) this.position.y = groundY;
    this.velocity.set(0, 0, 0);
    this.headingRadians = Math.PI;
    this.input.clearKeys();
    this.heroRig?.reset();
    if (this.mesh) {
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = this.headingRadians;
    }
    this.syncSnapshot();
  }

  private syncSnapshot(): void {
    // snapshot.position 与 this.position 是同一实例，A1/A4 读到的是本帧实时值。
    (this.snapshot as { headingRadians: number }).headingRadians = this.headingRadians;
    (this.snapshot as { speed: number }).speed = Math.hypot(this.velocity.x, this.velocity.z);
    (this.snapshot as { grounded: boolean }).grounded = this.grounded;
  }

  private readCameraForwardXZ(camera: PerspectiveCamera): Vector3 {
    camera.getWorldDirection(this.tmpForward);
    const len = Math.hypot(this.tmpForward.x, this.tmpForward.z);
    if (len > 1e-4) {
      // 镜头近乎垂直俯视时保持上一帧水平前向，避免除零跳变。
      this.cameraForward.set(this.tmpForward.x / len, 0, this.tmpForward.z / len);
    }
    return this.cameraForward;
  }

  private attachInputBinder(context: GameContext): void {
    if (typeof window === "undefined") return; // node 单测环境：直接操作 InputState。
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
