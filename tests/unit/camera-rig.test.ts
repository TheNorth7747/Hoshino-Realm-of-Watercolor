import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { CameraRig } from "../../src/player/CameraRig";
import { InputState } from "../../src/player/InputState";
import type {
  GameContext,
  PlayerSnapshot,
  PlayerSource,
} from "../../src/core/contracts";
import {
  createFakeGameContext,
  hillyTerrain,
  runFrames,
} from "./helpers/fake-game-context";

/** 可控玩家替身：实现共享契约 PlayerSource。 */
class FakePlayer implements PlayerSource {
  readonly position = new Vector3(0, 0, 32);
  headingRadians = 0;
  speed = 0;
  grounded = true;

  getPlayerSnapshot(): PlayerSnapshot {
    return {
      position: this.position,
      headingRadians: this.headingRadians,
      speed: this.speed,
      grounded: this.grounded,
    };
  }
}

interface RigHarness {
  readonly context: GameContext;
  readonly player: FakePlayer;
  readonly input: InputState;
  readonly rig: CameraRig;
}

function createRig(sampleHeight: (x: number, z: number) => number = () => 0): RigHarness {
  const context = createFakeGameContext({ sampleHeight });
  const player = new FakePlayer();
  const input = new InputState();
  const rig = new CameraRig({ playerSource: player, input });
  rig.init(context);
  return { context, player, input, rig };
}

/** 跟随点（玩家位置 + 1.5m 头部偏移）。 */
function expectedFollowPoint(player: FakePlayer): Vector3 {
  return new Vector3(player.position.x, player.position.y + 1.5, player.position.z);
}

describe("CameraRig · 初始化与初始摆位", () => {
  it("init 后镜头在目标 +Z 侧、距离 8m，朝向跟随点", () => {
    const { context, player, rig } = createRig();
    const follow = expectedFollowPoint(player);
    const camera = context.camera;

    expect(camera.position.z).toBeGreaterThan(follow.z); // 在 +Z 侧
    const offset = camera.position.clone().sub(follow);
    expect(offset.length()).toBeCloseTo(8, 5);
    expect(rig.getDistance()).toBeCloseTo(8, 5);
    expect(rig.getYaw()).toBeCloseTo(0, 6);
    expect(rig.getPitch()).toBeCloseTo(0.42, 6);

    // 视线指向跟随点。
    const view = camera.getWorldDirection(new Vector3());
    const toTarget = follow.clone().sub(camera.position).normalize();
    expect(view.dot(toTarget)).toBeGreaterThan(0.999);
  });
});

describe("CameraRig · 平滑跟随", () => {
  it("玩家瞬移后跟随点阻尼收敛，不跳变", () => {
    const { context, player, rig } = createRig();
    player.position.set(0, 0, 0);
    const startDist = rig.getFollowPoint().distanceTo(expectedFollowPoint(player));
    expect(startDist).toBeGreaterThan(20);

    const distances: number[] = [];
    for (let i = 0; i < 180; i += 1) {
      rig.update(1 / 60, context);
      distances.push(rig.getFollowPoint().distanceTo(expectedFollowPoint(player)));
    }
    // 单调收敛（允许浮点抖动 1e-9）且最终贴近目标。
    for (let i = 1; i < distances.length; i += 1) {
      expect(distances[i]).toBeLessThanOrEqual((distances[i - 1] ?? 0) + 1e-9);
    }
    expect(distances[distances.length - 1]).toBeLessThan(0.02);

    // 镜头与跟随点保持标称距离。
    const camera = context.camera;
    expect(camera.position.distanceTo(rig.getFollowPoint())).toBeCloseTo(8, 2);
  });

  it("跟随移动中的玩家：有滞后但不脱离标称距离", () => {
    const { context, player, rig } = createRig();
    // 玩家以 4.2m/s 向 -Z 匀速移动，镜头每帧跟随。
    for (let i = 0; i < 300; i += 1) {
      player.position.z -= 4.2 / 60;
      rig.update(1 / 60, context);
    }
    // 玩家向 -Z 匀速走：稳态滞后 ≈ v / followRate = 4.2 / 8 ≈ 0.53m（followPoint 在身后）。
    const lag = rig.getFollowPoint().z - player.position.z;
    expect(lag).toBeGreaterThan(0.05);
    expect(lag).toBeLessThan(1.0);
    expect(context.camera.position.distanceTo(rig.getFollowPoint())).toBeCloseTo(8, 1);
  });
});

describe("CameraRig · 鼠标拖拽旋转（PRD 9.3）", () => {
  it("右拖 → yaw 减小（视线右转），下拖 → 俯角增大", () => {
    const { context, input, rig } = createRig();
    const yaw0 = rig.getYaw();
    const pitch0 = rig.getPitch();

    input.setDragging(true);
    input.addMouseDelta(100, 60);
    rig.update(1 / 60, context);

    expect(rig.getYaw()).toBeCloseTo(yaw0 - 0.5, 5); // 100px × 0.005
    expect(rig.getPitch()).toBeCloseTo(pitch0 + 0.3, 5); // 60px × 0.005
  });

  it("未按下拖拽时增量不生效", () => {
    const { context, input, rig } = createRig();
    const yaw0 = rig.getYaw();
    input.addMouseDelta(200, 200); // 未 setDragging
    rig.update(1 / 60, context);
    expect(rig.getYaw()).toBeCloseTo(yaw0, 6);
  });

  it("俯仰钳制在 [0.08, 1.15]", () => {
    const { context, input, rig } = createRig();
    input.setDragging(true);
    input.addMouseDelta(0, 100000);
    rig.update(1 / 60, context);
    expect(rig.getPitch()).toBeCloseTo(1.15, 6);

    input.addMouseDelta(0, -200000);
    rig.update(1 / 60, context);
    expect(rig.getPitch()).toBeCloseTo(0.08, 6);
  });

  it("旋转后镜头仍保持标称距离并看向跟随点", () => {
    const { context, input, rig } = createRig();
    input.setDragging(true);
    input.addMouseDelta(300, 150);
    rig.update(1 / 60, context);

    const camera = context.camera;
    expect(camera.position.distanceTo(rig.getFollowPoint())).toBeCloseTo(8, 5);
    const view = camera.getWorldDirection(new Vector3());
    const toTarget = rig.getFollowPoint().clone().sub(camera.position).normalize();
    expect(view.dot(toTarget)).toBeGreaterThan(0.999);
  });
});

describe("CameraRig · 滚轮缩放（PRD 9.3）", () => {
  it("向下滚拉远、向上滚拉近，实际距离平滑追踪", () => {
    const { context, input, rig } = createRig();
    input.addWheelDelta(120); // e^{0.18} ≈ 1.197
    rig.update(1 / 60, context);
    const afterOneFrame = rig.getDistance();
    expect(afterOneFrame).toBeGreaterThan(8);
    expect(afterOneFrame).toBeLessThan(8 * Math.exp(0.18)); // 平滑，未一步到位

    runFrames(rig, context, 120);
    expect(rig.getDistance()).toBeCloseTo(8 * Math.exp(0.18), 1);

    input.addWheelDelta(-240); // 目标 = 8·e^{0.18-0.36} = 8·e^{-0.18}
    runFrames(rig, context, 120);
    expect(rig.getDistance()).toBeCloseTo(8 * Math.exp(-0.18), 1);
  });

  it("持续滚动缩放钳制在 [3, 14] 米", () => {
    const { context, input, rig } = createRig();
    for (let i = 0; i < 240; i += 1) {
      input.addWheelDelta(500);
      rig.update(1 / 60, context);
    }
    expect(rig.getDistance()).toBeCloseTo(14, 3);

    for (let i = 0; i < 240; i += 1) {
      input.addWheelDelta(-500);
      rig.update(1 / 60, context);
    }
    expect(rig.getDistance()).toBeCloseTo(3, 3);
  });
});

describe("CameraRig · 地形避让（PRD 9.3）", () => {
  it("镜头始终高于地形 clearance（平台高度 10m）", () => {
    const { context, player, rig } = createRig(() => 10);
    player.position.set(0, 0, 0);
    runFrames(rig, context, 60);
    expect(context.camera.position.y).toBeGreaterThanOrEqual(10.8 - 1e-6);
  });

  it("缓起伏地形上逐帧验证避让", () => {
    const { context, player, rig } = createRig(hillyTerrain);
    // 玩家斜穿山地，镜头逐帧不低于地面 + 0.8m。
    player.position.set(-20, 0, 20);
    for (let i = 0; i < 240; i += 1) {
      player.position.z -= 0.1;
      player.position.x += 0.05;
      rig.update(1 / 60, context);
      const cam = context.camera.position;
      const ground = hillyTerrain(cam.x, cam.z);
      expect(cam.y).toBeGreaterThanOrEqual(ground + 0.8 - 1e-6);
    }
  });
});

describe("CameraRig · delta 截断与 reset", () => {
  it("超长 delta 不让镜头跳变（跟随阻尼用截断后的步长）", () => {
    const { context, player, rig } = createRig();
    player.position.set(0, 0, 0);
    const startZ = rig.getFollowPoint().z; // 32
    rig.update(10, context); // 10 秒 delta → 按 0.05s 截断
    const afterZ = rig.getFollowPoint().z;
    // 一步 lerp 混合 1 - e^{-8×0.05} ≈ 0.33：从 32 移向 1.5，不会跳到目标。
    expect(afterZ).toBeGreaterThan(10);
    expect(afterZ).toBeLessThan(startZ);
  });

  it("game:reset 后镜头回出生点、视角与距离复原", () => {
    const { context, player, input, rig } = createRig();
    input.setDragging(true);
    input.addMouseDelta(400, 100);
    input.addWheelDelta(500);
    player.position.set(20, 0, -30);
    runFrames(rig, context, 60);
    expect(rig.getDistance()).not.toBeCloseTo(8, 2);

    // 真实集成顺序：player 阶段先复位到出生点，camera 阶段随后读取快照。
    player.position.set(0, 0, 32);
    context.events.emit("game:reset");
    expect(rig.getYaw()).toBeCloseTo(0, 6);
    expect(rig.getPitch()).toBeCloseTo(0.42, 6);
    expect(rig.getDistance()).toBeCloseTo(8, 5);
    expect(rig.getFollowPoint().x).toBeCloseTo(0, 5);
    expect(rig.getFollowPoint().y).toBeCloseTo(0 + 1.5, 5); // 头部偏移在 Y 轴（出生点 y=0）
    expect(rig.getFollowPoint().z).toBeCloseTo(32, 5);
    expect(context.camera.position.distanceTo(rig.getFollowPoint())).toBeCloseTo(8, 5);
  });

  it("注册 camera 调试 stat source（AC-11）", () => {
    const { context } = createRig();
    const stats = context.debug.readStats();
    expect(stats["camera.cameraYaw"]).toBe(0);
    expect(stats["camera.cameraDistance"]).toBeCloseTo(8, 5);
  });
});
