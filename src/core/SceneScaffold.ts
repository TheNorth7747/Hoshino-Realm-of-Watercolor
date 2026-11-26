/**
 * 空场景骨架（A0）。
 *
 * 只提供：
 * - Scene + 默认背景色
 * - 一盏主方向光 + 半球光（PRD 10：灯光只用这两类）
 * - 默认摄像机（A2 的 CameraRig 会接管）
 * - `world-root` 空组：A3 的全部场景对象挂在这里
 * - 调试网格/坐标轴（仅 ?debug=1）
 *
 * 不提供：地形、植被、水、花树、角色、故事 —— 那些属于 A2/A3/A4/A5。
 */
import {
  AxesHelper,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
} from "three";
import type { EngineSettings, WorldBounds } from "./contracts";
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR } from "./config";
import { disposeObject3D } from "./dispose";

export interface SceneScaffold {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly worldRoot: Group;
  dispose(): void;
}

export interface SceneScaffoldOptions {
  readonly settings: EngineSettings;
  readonly bounds: WorldBounds;
  readonly spawn: { readonly x: number; readonly y: number; readonly z: number };
}

const WORLD_ROOT_NAME = "world-root";
const DEBUG_HELPERS_NAME = "debug-helpers";

export function createSceneScaffold(options: SceneScaffoldOptions): SceneScaffold {
  const { settings, bounds, spawn } = options;

  const scene = new Scene();
  scene.name = "starwater-scene";
  scene.background = new Color(settings.clearColor);

  const sizeX = bounds.maxX - bounds.minX;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const fogNear = Math.min(sizeX, sizeZ) * 0.45;
  const fogFar = Math.max(sizeX, sizeZ) * 1.35;
  scene.fog = new Fog(settings.clearColor, fogNear, fogFar);

  // V0.2 光照：降低半球光的均匀填平感，让纸面有柔和的明暗层次；
  // 加一盏很弱的天顶补光（无阴影、无额外 pass），不引入 bloom/SSAO。
  const hemisphere = new HemisphereLight(0xfff8ec, 0xc2c8c9, 0.72);
  hemisphere.name = "hemisphere-light";
  scene.add(hemisphere);

  const sun = new DirectionalLight(0xfff3e0, 1.34);
  sun.name = "key-light";
  sun.position.set(spawn.x + 24, spawn.y + 42, spawn.z + 18);
  sun.castShadow = false; // 首版只给关键对象投影，默认关闭，由 A3 按需开启
  scene.add(sun);

  // 反向补光：压一点背光面死黑，让树冠/角色轮廓能读出来
  const fill = new DirectionalLight(0xd8e4f2, 0.22);
  fill.name = "fill-light";
  fill.position.set(spawn.x - 20, spawn.y + 26, spawn.z - 24);
  fill.castShadow = false;
  scene.add(fill);

  const worldRoot = new Group();
  worldRoot.name = WORLD_ROOT_NAME;
  scene.add(worldRoot);

  const camera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.name = "default-camera";
  camera.position.set(spawn.x, spawn.y + 4.5, spawn.z + 9);
  camera.lookAt(spawn.x, spawn.y + 1.2, spawn.z);

  if (settings.debugEnabled) {
    const helpers = new Group();
    helpers.name = DEBUG_HELPERS_NAME;
    const gridSize = Math.max(sizeX, sizeZ);
    const grid = new GridHelper(gridSize, Math.round(gridSize / 4), 0x8d949c, 0xd6d0c4);
    grid.name = "debug-grid";
    grid.position.y = spawn.y + 0.01;
    // 默认隐藏平面网格，避免固定 Y=spawn.y 的网格线穿过起伏地形造成水平白条带假象
    grid.visible = false;
    const axes = new AxesHelper(6);
    axes.name = "debug-axes";
    axes.position.set(spawn.x, spawn.y + 0.02, spawn.z);
    helpers.add(grid, axes);
    scene.add(helpers);
  }

  return {
    scene,
    camera,
    worldRoot,
    dispose(): void {
      disposeObject3D(scene);
      scene.clear();
    },
  };
}
