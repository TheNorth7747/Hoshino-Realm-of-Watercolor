/**
 * A2 模块出口与集成工厂。
 *
 * 集成者（Agent 1）只需在 main.ts 的 createSystems() 里返回 createPlayerSystemList()：
 *
 *   import { createPlayerSystemList } from "./player";
 *   function createSystems(): GameSystem[] {
 *     return createPlayerSystemList();
 *   }
 *
 * 工厂内部共享一个 InputState：PlayerController 读取移动轴，
 * CameraRig 消费拖拽/滚轮增量，键盘与镜头输入互不干扰。
 * 注册顺序 [player, camera] 与 SYSTEM_PHASES 一致（Game 会按阶段排序）。
 */
import type { GameSystem } from "../core/contracts";
import { InputState } from "./InputState";
import { PlayerController } from "./PlayerController";
import { CameraRig } from "./CameraRig";

export { InputState, DEFAULT_KEY_BINDINGS, applyKeyEvent, shouldPreventDefault } from "./InputState";
export type { InputAction, MoveAxes, MouseDelta } from "./InputState";
export { DomInputBinder } from "./DomInputBinder";
export {
  CollisionWorld,
  resolveCircleCollisions,
  circlePushOut,
  type CollisionCircle,
} from "./collision";
export {
  PlayerController,
  PLAYER_MOVE_SPEED,
  PLAYER_SPRINT_SPEED,
  PLAYER_COLLISION_RADIUS,
  type PlayerControllerOptions,
} from "./PlayerController";
export {
  CameraRig,
  CAMERA_DEFAULT_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_MAX_DISTANCE,
  CAMERA_DEFAULT_PITCH,
  CAMERA_MIN_PITCH,
  CAMERA_MAX_PITCH,
  CAMERA_DRAG_SENSITIVITY,
  CAMERA_WHEEL_STEP,
  CAMERA_TERRAIN_CLEARANCE,
  type CameraRigOptions,
} from "./CameraRig";
export { createPlayerPlaceholderMesh, PLAYER_PLACEHOLDER_NAME } from "./playerPlaceholder";

export interface PlayerSystems {
  readonly input: InputState;
  readonly player: PlayerController;
  readonly camera: CameraRig;
}

/** 构造共享输入的玩家 + 镜头系统对。 */
export function createPlayerSystems(options: {
  readonly player?: { readonly moveSpeed?: number; readonly sprintSpeed?: number };
  readonly camera?: { readonly distance?: number; readonly pitch?: number };
} = {}): PlayerSystems {
  const input = new InputState();
  const player = new PlayerController({
    input,
    moveSpeed: options.player?.moveSpeed,
    sprintSpeed: options.player?.sprintSpeed,
  });
  const camera = new CameraRig({
    playerSource: player,
    input,
    distance: options.camera?.distance,
    pitch: options.camera?.pitch,
  });
  return { input, player, camera };
}

/** 集成便利封装：直接返回 GameSystem 列表。 */
export function createPlayerSystemList(
  options?: Parameters<typeof createPlayerSystems>[0],
): GameSystem[] {
  const { player, camera } = createPlayerSystems(options);
  return [player, camera];
}
