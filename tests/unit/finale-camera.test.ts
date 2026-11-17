import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  CameraRig,
  CAMERA_DEFAULT_DISTANCE,
  CAMERA_DEFAULT_PITCH,
  CAMERA_FINALE_DISTANCE,
  CAMERA_FINALE_PITCH,
} from "../../src/player/CameraRig";
import { InputState } from "../../src/player/InputState";
import type { GameContext, PlayerSnapshot, PlayerSource } from "../../src/core/contracts";
import { createFakeGameContext, hillyTerrain, runFrames } from "./helpers/fake-game-context";

/** 可控玩家替身（共享契约 PlayerSource）。 */
class FakePlayer implements PlayerSource {
  readonly position = new Vector3(0, 0, -22); // 花树根下（PRD 5.3）
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

interface FinaleHarness {
  readonly context: GameContext;
  readonly player: FakePlayer;
  readonly input: InputState;
  readonly rig: CameraRig;
}

function createRig(sampleHeight: (x: number, z: number) => number = () => 0): FinaleHarness {
  const context = createFakeGameContext({ sampleHeight });
  const player = new FakePlayer();
  const input = new InputState();
  const rig = new CameraRig({ playerSource: player, input });
  rig.init(context);
  return { context, player, input, rig };
}

/** 逐步推进并记录距离序列，用于判定“平滑无瞬移”。 */
function advance(rig: CameraRig, context: GameContext, frames: number, dt = 1 / 60): number[] {
  const distances: number[] = [];
  for (let i = 0; i < frames; i += 1) {
    rig.update(dt, context);
    distances.push(rig.getDistance());
  }
  return distances;
}

describe("结局运镜 · 触发时机（PRD P0 花树开花后拉远）", () => {
  it("story:completed(tree) 立即开始运镜，不等 game:finished", () => {
    const { context, rig } = createRig();
    expect(rig.isFinaleActive()).toBe(false);

    context.events.emit("story:completed", { nodeId: "tree" });
    expect(rig.isFinaleActive()).toBe(true);

    // 尚未收到 game:finished，镜头已经开始拉远。
    rig.update(1 / 60, context);
    expect(rig.getDistance()).toBeGreaterThan(CAMERA_DEFAULT_DISTANCE);
  });

  it("其他节点（flower / stream）不触发运镜", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "flower" });
    expect(rig.isFinaleActive()).toBe(false);
    context.events.emit("story:completed", { nodeId: "stream" });
    expect(rig.isFinaleActive()).toBe(false);

    runFrames(rig, context, 30);
    expect(rig.getDistance()).toBeCloseTo(CAMERA_DEFAULT_DISTANCE, 6);
    expect(rig.getPitch()).toBeCloseTo(CAMERA_DEFAULT_PITCH, 6);
  });

  it("重复触发幂等：不会把运镜进度拉回起点", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 60);
    const midwayDistance = rig.getDistance();
    expect(midwayDistance).toBeGreaterThan(CAMERA_DEFAULT_DISTANCE);

    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 1);
    // 继续朝目标推进，而不是重置回默认距离。
    expect(rig.getDistance()).toBeGreaterThan(midwayDistance);
  });

  it("game:finished（结局 UI）不会二次触发或打断运镜", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 30);
    const before = rig.getDistance();

    context.events.emit("game:finished", { elapsedSeconds: 420 });
    runFrames(rig, context, 1);
    expect(rig.isFinaleActive()).toBe(true);
    expect(rig.getDistance()).toBeGreaterThan(before);
  });
});

describe("结局运镜 · 平滑变化（禁止瞬移/硬切）", () => {
  it("逐帧单调推进，无单帧跳跃", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });

    const distances = advance(rig, context, 180);
    for (let i = 1; i < distances.length; i += 1) {
      const prev = distances[i - 1] ?? 0;
      const curr = distances[i] ?? 0;
      expect(curr).toBeGreaterThanOrEqual(prev - 1e-9); // 单调拉远
      // 指数阻尼首帧步进 ≈ 跨度(5m) × (1-e^{-2.2/60}) ≈ 0.18m，远小于硬切。
      expect(curr - prev).toBeLessThan(0.2);
    }
    // 首帧不会一步到位。
    expect(distances[0]).toBeLessThan(CAMERA_FINALE_DISTANCE - 1);
  });

  it("最终收敛到目标距离与俯角", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 600); // 10 秒足够收敛

    expect(rig.getDistance()).toBeCloseTo(CAMERA_FINALE_DISTANCE, 2);
    expect(rig.getPitch()).toBeCloseTo(CAMERA_FINALE_PITCH, 3);
  });

  it("距离拉远、俯角提高，且都在合法范围内", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 600);

    expect(CAMERA_FINALE_DISTANCE).toBeGreaterThan(CAMERA_DEFAULT_DISTANCE);
    expect(CAMERA_FINALE_PITCH).toBeGreaterThan(CAMERA_DEFAULT_PITCH);
    expect(rig.getDistance()).toBeLessThanOrEqual(14); // CAMERA_MAX_DISTANCE
    expect(rig.getPitch()).toBeLessThanOrEqual(1.15); // CAMERA_MAX_PITCH
  });

  it("俯角同样单调平滑，无单帧跳变", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });

    let previous = rig.getPitch();
    for (let i = 0; i < 180; i += 1) {
      rig.update(1 / 60, context);
      const current = rig.getPitch();
      expect(current).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(current - previous).toBeLessThan(0.02);
      previous = current;
    }
  });
});

describe("结局运镜 · 保留朝向（花树/玩家/染色路径留在画面）", () => {
  it("yaw 在运镜全程保持不变", () => {
    const { context, input, rig } = createRig();
    // 先把朝向转到一个非默认角度。
    input.setDragging(true);
    input.addMouseDelta(200, 0); // yaw 减小
    rig.update(1 / 60, context);
    input.setDragging(false);
    const yawBefore = rig.getYaw();
    expect(yawBefore).not.toBeCloseTo(0, 3);

    context.events.emit("story:completed", { nodeId: "tree" });
    for (let i = 0; i < 300; i += 1) {
      rig.update(1 / 60, context);
      expect(rig.getYaw()).toBeCloseTo(yawBefore, 9);
    }
  });

  it("镜头始终看向跟随点（玩家），玩家留在画面中心", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 240);

    const camera = context.camera;
    const view = camera.getWorldDirection(new Vector3());
    const toFollow = rig.getFollowPoint().clone().sub(camera.position).normalize();
    expect(view.dot(toFollow)).toBeGreaterThan(0.999);
  });
});

describe("结局运镜 · 输入隔离（滚轮/拖拽不与动画争状态）", () => {
  it("运镜期间滚轮被忽略，距离仍按运镜目标推进", () => {
    const { context, input, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 30);
    const before = rig.getDistance();

    input.addWheelDelta(-100_000); // 强力拉近
    runFrames(rig, context, 30);
    expect(rig.getDistance()).toBeGreaterThan(before); // 依旧拉远，未被滚轮夺权
    expect(rig.getTargetDistance()).toBeCloseTo(rig.getDistance(), 6);
    // 增量被消费丢弃，不会残留到运镜之后。
    expect(input.consumeWheelDelta()).toBe(0);
  });

  it("运镜期间拖拽被忽略，yaw/pitch 只由动画驱动", () => {
    const { context, input, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    const yawBefore = rig.getYaw();

    input.setDragging(true);
    input.addMouseDelta(500, 500);
    runFrames(rig, context, 60);

    expect(rig.getYaw()).toBeCloseTo(yawBefore, 9);
    // pitch 只朝运镜目标变化（600px 拖拽本应使 pitch 顶到上限 1.15）。
    expect(rig.getPitch()).toBeLessThanOrEqual(CAMERA_FINALE_PITCH + 1e-6);
    expect(input.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  it("触发瞬间清空残留输入，避免旧增量在运镜结束瞬间生效", () => {
    const { context, input, rig } = createRig();
    input.setDragging(true);
    input.addMouseDelta(300, 300);
    input.addWheelDelta(500);

    context.events.emit("story:completed", { nodeId: "tree" });
    expect(input.isDragging()).toBe(false);
    expect(input.consumeMouseDelta()).toEqual({ x: 0, y: 0 });
    expect(input.consumeWheelDelta()).toBe(0);
    expect(rig.isFinaleActive()).toBe(true);
  });
});

describe("结局运镜 · game:reset 恢复", () => {
  it("reset 清除运镜并恢复默认距离、俯角与朝向", () => {
    const { context, input, rig } = createRig();
    input.setDragging(true);
    input.addMouseDelta(180, 0);
    rig.update(1 / 60, context);
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 120);
    expect(rig.getDistance()).toBeGreaterThan(CAMERA_DEFAULT_DISTANCE);

    context.events.emit("game:reset");

    expect(rig.isFinaleActive()).toBe(false);
    expect(rig.getDistance()).toBeCloseTo(CAMERA_DEFAULT_DISTANCE, 6);
    expect(rig.getPitch()).toBeCloseTo(CAMERA_DEFAULT_PITCH, 6);
    expect(rig.getYaw()).toBeCloseTo(0, 6);
  });

  it("reset 后输入可用：滚轮与拖拽恢复生效", () => {
    const { context, input, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 120);
    context.events.emit("game:reset");

    const distanceBefore = rig.getDistance();
    input.addWheelDelta(120);
    runFrames(rig, context, 120);
    expect(rig.getDistance()).toBeGreaterThan(distanceBefore);

    const yawBefore = rig.getYaw();
    input.setDragging(true);
    input.addMouseDelta(100, 0);
    rig.update(1 / 60, context);
    expect(rig.getYaw()).not.toBeCloseTo(yawBefore, 6);
  });

  it("reset 后不会回弹到运镜目标值", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 120);
    context.events.emit("game:reset");

    runFrames(rig, context, 240);
    expect(rig.getDistance()).toBeCloseTo(CAMERA_DEFAULT_DISTANCE, 2);
    expect(rig.getPitch()).toBeCloseTo(CAMERA_DEFAULT_PITCH, 3);
  });

  it("reset 后可再次触发运镜（第二次游玩）", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 120);
    context.events.emit("game:reset");
    expect(rig.isFinaleActive()).toBe(false);

    context.events.emit("story:completed", { nodeId: "tree" });
    expect(rig.isFinaleActive()).toBe(true);
    runFrames(rig, context, 600);
    expect(rig.getDistance()).toBeCloseTo(CAMERA_FINALE_DISTANCE, 2);
  });
});

describe("结局运镜 · dispose", () => {
  it("dispose 后清除运镜状态", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 30);
    expect(rig.isFinaleActive()).toBe(true);

    rig.dispose();
    expect(rig.isFinaleActive()).toBe(false);
  });

  it("dispose 后事件不再驱动镜头（监听已解绑）", () => {
    const { context, rig } = createRig();
    rig.dispose();
    context.events.emit("story:completed", { nodeId: "tree" });
    expect(rig.isFinaleActive()).toBe(false);
    expect(context.events.listenerCount("story:completed")).toBe(0);
  });

  it("dispose 幂等：重复调用不抛错", () => {
    const { rig } = createRig();
    rig.dispose();
    expect(() => rig.dispose()).not.toThrow();
  });

  it("运镜中 dispose 不抛错", () => {
    const { context, rig } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    runFrames(rig, context, 10);
    expect(() => rig.dispose()).not.toThrow();
  });
});

describe("结局运镜 · 与地形避让共存", () => {
  it("缓起伏地形上运镜全程镜头高于地面 clearance", () => {
    const { context, rig } = createRig(hillyTerrain);
    context.events.emit("story:completed", { nodeId: "tree" });
    for (let i = 0; i < 240; i += 1) {
      rig.update(1 / 60, context);
      const cam = context.camera.position;
      expect(cam.y).toBeGreaterThanOrEqual(hillyTerrain(cam.x, cam.z) + 0.8 - 1e-6);
    }
  });

  it("运镜后调试 stat source 反映运镜状态（AC-11）", () => {
    const { context } = createRig();
    expect(context.debug.readStats()["camera.cameraFinale"]).toBe(false);

    context.events.emit("story:completed", { nodeId: "tree" });
    expect(context.debug.readStats()["camera.cameraFinale"]).toBe(true);
  });
});
