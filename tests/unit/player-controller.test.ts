import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import type { PerspectiveCamera } from "three";
import { PlayerController } from "../../src/player/PlayerController";
import { PLAYER_MOVE_SPEED } from "../../src/player/PlayerController";
import { applyKeyEvent } from "../../src/player/InputState";
import { PLAYER_PLACEHOLDER_NAME } from "../../src/player/heroCharacter";
import type { GameContext, PlayerSnapshot, PlayerSource } from "../../src/core/contracts";
import { WORLD_BOUNDS, sampleTerrainHeight } from "../../src/config/world";
import {
  createFakeGameContext,
  hillyTerrain,
  placeCameraLookingNegZ,
  runFrames,
  type FakeContextOptions,
} from "./helpers/fake-game-context";

const DT = 1 / 60;

interface PlayerHarness {
  readonly context: GameContext;
  readonly player: PlayerController;
}

function createPlayer(options: FakeContextOptions = {}): PlayerHarness {
  const context = createFakeGameContext(options);
  placeCameraLookingNegZ(context.camera);
  const player = new PlayerController();
  player.init(context);
  return { context, player };
}

function holdKeys(player: PlayerController, codes: string[]): void {
  for (const code of codes) applyKeyEvent(player.input, code, true);
}

/** 读取相机水平前向，供“镜头相对移动”断言用。 */
function cameraForwardXZ(camera: PerspectiveCamera): { x: number; z: number } {
  const dir = camera.getWorldDirection(new Vector3());
  const len = Math.hypot(dir.x, dir.z);
  return { x: dir.x / len, z: dir.z / len };
}

describe("PlayerController · 快照契约（core/contracts 8.2）", () => {
  it("init 后快照位于出生点、朝向主路线 -Z、速度为 0", () => {
    const { player } = createPlayer();
    const snapshot: PlayerSnapshot = player.getPlayerSnapshot();
    expect(snapshot.position.x).toBe(0);
    // 出生点 Y 来自共享地形采样器（A3 接入后不再是 0），不在这里写死高度
    expect(snapshot.position.y).toBeCloseTo(sampleTerrainHeight(0, 32), 6);
    expect(snapshot.position.z).toBe(32);
    expect(snapshot.headingRadians).toBeCloseTo(Math.PI, 6);
    expect(snapshot.speed).toBe(0);
    expect(snapshot.grounded).toBe(true);
  });

  it("实现 PlayerSource 接口，快照身份稳定", () => {
    const { player } = createPlayer();
    const source: PlayerSource = player;
    expect(source.getPlayerSnapshot()).toBe(source.getPlayerSnapshot());
  });

  it("调试 stat source 暴露玩家坐标（AC-11）", () => {
    const { context, player } = createPlayer();
    const stats = context.debug.readStats();
    expect(stats["player.positionX"]).toBe(0);
    expect(stats["player.positionZ"]).toBe(32);
    expect(stats["player.speed"]).toBe(0);
    expect(player.isControlsEnabled()).toBe(true);
  });

  it("占位角色加入 worldRoot 并跟随位置与朝向", () => {
    const { context, player } = createPlayer();
    const mesh = context.worldRoot.children.find((c) => c.name === PLAYER_PLACEHOLDER_NAME);
    expect(mesh).toBeDefined();

    holdKeys(player, ["KeyD"]);
    runFrames(player, context, 60);
    const snapshot = player.getPlayerSnapshot();
    expect(mesh?.position.x).toBeCloseTo(snapshot.position.x, 6);
    expect(mesh?.position.z).toBeCloseTo(snapshot.position.z, 6);
    expect(mesh?.rotation.y).toBeCloseTo(snapshot.headingRadians, 6);
  });
});

describe("PlayerController · WASD 相对镜头移动（PRD 9.3）", () => {
  it("镜头朝 -Z 时 W 沿 -Z 前进，速度收敛到 4.2m/s", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 90);
    const snapshot = player.getPlayerSnapshot();
    expect(snapshot.position.z).toBeLessThan(32 - PLAYER_MOVE_SPEED * 1.2);
    expect(snapshot.position.x).toBeCloseTo(0, 6);
    expect(snapshot.speed).toBeGreaterThan(4.1);
    expect(snapshot.headingRadians).toBeCloseTo(Math.PI, 6);
  });

  it("镜头朝 +X 时 W 沿 +X 前进（移动方向跟随镜头）", () => {
    const { context, player } = createPlayer();
    context.camera.position.set(-9, 1, 0);
    context.camera.lookAt(0, 1, 0);
    const forward = cameraForwardXZ(context.camera);
    expect(forward.x).toBeCloseTo(1, 6);

    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 90);
    const snapshot = player.getPlayerSnapshot();
    expect(snapshot.position.x).toBeGreaterThan(PLAYER_MOVE_SPEED * 1.2);
    expect(snapshot.position.z).toBeCloseTo(32, 6);
  });

  it("W+D 对角移动方向归一化，速度不超 4.2m/s", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW", "KeyD"]);
    runFrames(player, context, 90);
    const snapshot = player.getPlayerSnapshot();
    expect(snapshot.speed).toBeGreaterThan(4.0);
    expect(snapshot.speed).toBeLessThan(PLAYER_MOVE_SPEED + 0.2);
    expect(snapshot.position.x).toBeGreaterThan(2);
    expect(snapshot.position.z).toBeLessThan(32 - 2);
  });

  it("Shift 小跑收敛到 6.2m/s（可选系统）", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW", "ShiftLeft"]);
    runFrames(player, context, 90);
    expect(player.getPlayerSnapshot().speed).toBeGreaterThan(6.0);
    expect(player.getPlayerSnapshot().speed).toBeLessThan(6.4);
  });
});

describe("PlayerController · 平滑转向", () => {
  it("朝向逐帧逼近移动方向，不瞬间跳变", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyD"]); // 目标朝向：+X → heading = π/2
    runFrames(player, context, 1);
    const afterOneFrame = player.getPlayerSnapshot().headingRadians;
    expect(Math.abs(Math.PI - afterOneFrame)).toBeGreaterThan(0.1);

    runFrames(player, context, 150);
    expect(player.getPlayerSnapshot().headingRadians).toBeCloseTo(Math.PI / 2, 2);
  });

  it("停止移动后朝向保持不变", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyD"]);
    runFrames(player, context, 150);
    const heading = player.getPlayerSnapshot().headingRadians;
    player.input.clearKeys();
    runFrames(player, context, 30);
    expect(player.getPlayerSnapshot().headingRadians).toBeCloseTo(heading, 6);
  });
});

describe("PlayerController · 贴地与地形采样接口", () => {
  it("缓起伏测试地形上位置 Y 始终等于采样值", () => {
    const { context, player } = createPlayer({ sampleHeight: hillyTerrain });
    holdKeys(player, ["KeyW", "KeyA"]);
    for (let i = 0; i < 120; i += 1) {
      player.update(DT, context);
      const p = player.getPlayerSnapshot().position;
      expect(p.y).toBeCloseTo(hillyTerrain(p.x, p.z), 9);
      expect(player.getPlayerSnapshot().grounded).toBe(true);
    }
  });

  it("采样返回非有限值时保持高度并标记离地", () => {
    let failNext = false;
    const { context, player } = createPlayer({
      sampleHeight: (x, z) => (failNext ? Number.NaN : hillyTerrain(x, z)),
    });
    holdKeys(player, ["KeyW"]);
    player.update(DT, context);
    failNext = true;
    const before = player.getPlayerSnapshot().position.clone();
    player.update(DT, context);
    expect(player.getPlayerSnapshot().grounded).toBe(false);
    expect(player.getPlayerSnapshot().position.y).toBeCloseTo(before.y, 9);
  });
});

describe("PlayerController · 地图边界（AC-02）", () => {
  it("持续前移 1500 帧后夹在世界边界 minZ", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 1500);
    const p = player.getPlayerSnapshot().position;
    expect(p.z).toBe(WORLD_BOUNDS.minZ);
    expect(p.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
    expect(p.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
  });

  it("反向移动夹在 maxZ", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyS"]);
    runFrames(player, context, 900);
    expect(player.getPlayerSnapshot().position.z).toBe(WORLD_BOUNDS.maxZ);
  });

  it("边界由 context.world.bounds 注入，不依赖硬编码坐标", () => {
    const { context, player } = createPlayer({
      bounds: { minX: -10, maxX: 10, minZ: 20, maxZ: 40 },
    });
    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 360);
    expect(player.getPlayerSnapshot().position.z).toBe(20);
    player.input.clearKeys();
    holdKeys(player, ["KeyS"]);
    runFrames(player, context, 360);
    expect(player.getPlayerSnapshot().position.z).toBe(40);
  });
});

describe("PlayerController · 基础碰撞（圆形障碍）", () => {
  it("正面撞树被挡住，不进入障碍半径", () => {
    const { context, player } = createPlayer();
    player.addColliders([{ x: 0, z: 20, radius: 1.5 }]);
    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 600);
    const p = player.getPlayerSnapshot().position;
    expect(p.z).toBeGreaterThan(20 + 1.5 + 0.4 - 0.05);
    expect(Math.abs(p.x)).toBeLessThan(1e-6);
    expect(Math.hypot(p.x - 0, p.z - 20)).toBeGreaterThanOrEqual(1.9 - 1e-6);
  });

  it("斜向移动可绕障碍滑过，全程不入圆", () => {
    const { context, player } = createPlayer();
    // 障碍中心略偏离 W+D 对角线（x+z=32），碰撞带切向分量，可以滑过去。
    player.addColliders([{ x: 7.5, z: 26, radius: 1.5 }]);
    holdKeys(player, ["KeyW", "KeyD"]);
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 600; i += 1) {
      player.update(DT, context);
      const p = player.getPlayerSnapshot().position;
      minDist = Math.min(minDist, Math.hypot(p.x - 7.5, p.z - 26));
    }
    const final = player.getPlayerSnapshot().position;
    expect(minDist).toBeLessThan(2.2); // 发生过接触
    expect(minDist).toBeGreaterThanOrEqual(1.9 - 1e-6); // 从未穿入
    expect(Math.hypot(final.x - 7.5, final.z - 26)).toBeGreaterThan(3); // 已绕过
  });
});

describe("PlayerController · delta 截断（PRD 7.3）", () => {
  it("超长 delta（切回页面）不会瞬移", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW"]);
    const startZ = player.getPlayerSnapshot().position.z;
    player.update(10, context); // 10 秒 delta
    const moved = startZ - player.getPlayerSnapshot().position.z;
    // 0.05s 截断 + 加速曲线：位移应等于 4.2 * 0.451 * 0.05 ≈ 0.0948m。
    expect(moved).toBeGreaterThan(0.09);
    expect(moved).toBeLessThan(0.1);
    expect(moved).toBeLessThan(PLAYER_MOVE_SPEED * 0.05);
  });

  it("NaN / 负数 delta 被视为 0", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW"]);
    const before = player.getPlayerSnapshot().position.clone();
    player.update(Number.NaN, context);
    player.update(-1, context);
    const after = player.getPlayerSnapshot().position;
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.z).toBeCloseTo(before.z, 9);
    expect(Number.isFinite(after.y)).toBe(true);
  });
});

describe("PlayerController · 失焦与输入恢复（PRD 9.3）", () => {
  it("失焦清空输入后惯性停下，不会持续移动", () => {
    const { context, player } = createPlayer();
    holdKeys(player, ["KeyW"]);
    runFrames(player, context, 60);
    expect(player.getPlayerSnapshot().speed).toBeGreaterThan(4);

    player.input.handleWindowBlur();
    runFrames(player, context, 90);
    expect(player.getPlayerSnapshot().speed).toBeLessThan(1e-6);

    const stopped = player.getPlayerSnapshot().position.clone();
    runFrames(player, context, 120);
    const after = player.getPlayerSnapshot().position;
    // 指数衰减渐近于零：残差远小于任何真实移动（1 帧 ≈ 0.07m）。
    expect(after.distanceTo(stopped)).toBeLessThan(1e-6);
  });

  it("setControlsEnabled(false) 限速钩子：关闭不动、恢复可用", () => {
    const { context, player } = createPlayer();
    player.setControlsEnabled(false);
    holdKeys(player, ["KeyW"]);
    const before = player.getPlayerSnapshot().position.clone();
    runFrames(player, context, 60);
    expect(player.getPlayerSnapshot().position.distanceTo(before)).toBeLessThan(1e-9);

    player.setControlsEnabled(true);
    applyKeyEvent(player.input, "KeyW", true);
    runFrames(player, context, 30);
    expect(player.getPlayerSnapshot().speed).toBeGreaterThan(2);
  });
});

describe("PlayerController · game:reset（PRD 8.4）", () => {
  it("重置回出生点、清零速度与朝向，保留 A3 注册的碰撞体", () => {
    const { context, player } = createPlayer({ sampleHeight: hillyTerrain });
    player.addColliders([{ x: 10, z: 10, radius: 1 }]);
    holdKeys(player, ["KeyW", "KeyD"]);
    runFrames(player, context, 120);
    expect(player.getPlayerSnapshot().position.z).not.toBe(32);

    context.events.emit("game:reset");
    const p = player.getPlayerSnapshot().position;
    expect(p.x).toBe(0);
    expect(p.z).toBe(32);
    expect(p.y).toBeCloseTo(hillyTerrain(0, 32), 9);
    expect(player.getPlayerSnapshot().speed).toBe(0);
    expect(player.getPlayerSnapshot().headingRadians).toBeCloseTo(Math.PI, 6);
    expect(player.colliders.count).toBe(1);
  });
});

describe("PlayerController · 5 分钟持续移动模拟（AC-02 验收代理）", () => {
  /**
   * 6000 帧 × 0.05s（最大 delta）= 300 秒游戏时间。
   * 轮换 6 种输入组合（模拟玩家画圈探索），周期性插入失焦。
   * 全程断言：不瞬移、不出界、不 NaN、始终贴地、路径长度合理。
   */
  it("缓起伏地形上连续 6000 帧无瞬移、无越界、无 NaN", () => {
    const { context, player } = createPlayer({ sampleHeight: hillyTerrain });
    const patterns: readonly string[][] = [
      ["KeyW"],
      ["KeyW", "KeyD"],
      ["KeyD"],
      ["KeyS"],
      ["KeyA"],
      ["KeyW", "KeyA"],
    ];
    const violations: string[] = [];
    let pathLength = 0;
    let movingSeconds = 0;
    let maxPerFrameDisplacement = 0;
    const previous = new Vector3();

    // 预热一帧：出生点的 Y 来自 config 的平坦采样器，与本测试替身地形存在
    // 一次性的落地差，不计入移动统计。
    player.update(0.05, context);
    previous.copy(player.getPlayerSnapshot().position);

    for (let tick = 0; tick < 6000; tick += 1) {
      const patternIndex = Math.floor(tick / 240) % patterns.length;
      const codes = patterns[patternIndex] ?? [];
      player.input.clearKeys();
      for (const code of codes) applyKeyEvent(player.input, code, true);

      if (tick > 0 && tick % 900 === 0) player.input.handleWindowBlur(); // 失焦模拟

      const axes = player.input.readMoveAxes();
      const moving = axes.x !== 0 || axes.z !== 0;
      if (moving) movingSeconds += 0.05;

      player.update(0.05, context);
      const snapshot = player.getPlayerSnapshot();
      const p = snapshot.position;
      const displacement = p.distanceTo(previous);
      pathLength += displacement;
      maxPerFrameDisplacement = Math.max(maxPerFrameDisplacement, displacement);
      previous.copy(p);

      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        violations.push(`tick ${tick}: 位置出现非有限值`);
        break;
      }
      if (Math.abs(p.x) > WORLD_BOUNDS.maxX || Math.abs(p.z) > WORLD_BOUNDS.maxX) {
        violations.push(`tick ${tick}: 越界 (${p.x}, ${p.z})`);
      }
      if (displacement > PLAYER_MOVE_SPEED * 0.05 + 0.01) {
        violations.push(`tick ${tick}: 单帧位移 ${displacement.toFixed(4)}m 疑似瞬移`);
      }
      if (!snapshot.grounded) violations.push(`tick ${tick}: 意外离地`);
      if (Math.abs(p.y - hillyTerrain(p.x, p.z)) > 1e-9) {
        violations.push(`tick ${tick}: 未贴地 y=${p.y}`);
      }
      if (!Number.isFinite(snapshot.headingRadians) || !Number.isFinite(snapshot.speed)) {
        violations.push(`tick ${tick}: 快照数值异常`);
        break;
      }
    }

    expect(violations).toEqual([]);
    expect(maxPerFrameDisplacement).toBeLessThanOrEqual(PLAYER_MOVE_SPEED * 0.05 + 0.01);
    // 路径长度不超过“满速 × 移动时间”，也不因加速度/边界停留缩水过多。
    expect(pathLength).toBeLessThanOrEqual(PLAYER_MOVE_SPEED * movingSeconds + 1e-6);
    expect(pathLength).toBeGreaterThan(PLAYER_MOVE_SPEED * movingSeconds * 0.6);
    expect(movingSeconds).toBeGreaterThan(240);
  });
});
