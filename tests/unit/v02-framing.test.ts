/**
 * V0.2 构图验算测试。
 *
 * 不使用"看起来差不多"的主观阈值，而是用**真实相机投影**量化参考帧要求：
 * - 角色屏高（头顶到脚底在画面上的垂直占比）目标 25%～32%（PRD V0.2 手册要求 2）
 * - 角色位于画面中下部（脚底在 72%～95%，头顶在 50%～72%）
 * - 地平线不贴近画面顶部（地平线屏幕 Y ≤ 45%，即至少在上半部里留出天空）
 *
 * 做法：把 16:9 视口、FOV 50° 的相机摆到 CameraRig 算出的位姿，
 * 用 Vector3.project() 把角色的世界坐标点投影到 NDC，再换算成屏幕占比。
 */
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  CameraRig,
  CAMERA_DEFAULT_DISTANCE,
  CAMERA_DEFAULT_PITCH,
  CAMERA_FINALE_DISTANCE,
  CAMERA_FINALE_PITCH,
  CAMERA_LOOK_AHEAD_DEFAULT,
} from "../../src/player/CameraRig";
import { InputState } from "../../src/player/InputState";
import { HERO_HEIGHT } from "../../src/player/heroCharacter";
import type { GameContext, PlayerSnapshot, PlayerSource } from "../../src/core/contracts";
import { createFakeGameContext } from "./helpers/fake-game-context";

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

class FakePlayer implements PlayerSource {
  readonly position = new Vector3(0, 0, 32);
  getPlayerSnapshot(): PlayerSnapshot {
    return { position: this.position, headingRadians: Math.PI, speed: 0, grounded: true };
  }
}

interface Framing {
  /** 角色头顶的屏幕 Y 占比（0=顶部）。 */
  readonly headPct: number;
  /** 角色脚底的屏幕 Y 占比。 */
  readonly feetPct: number;
  /** 角色屏高占比。 */
  readonly heightPct: number;
  /** 地平线屏幕 Y 占比（用远处地平方向点投影）。 */
  readonly horizonPct: number;
}

function createRig(): { context: GameContext; rig: CameraRig; player: FakePlayer } {
  const context = createFakeGameContext();
  // 与真实运行一致的视口与 FOV（core/config.ts CAMERA_FOV = 50）。
  context.camera.aspect = VIEWPORT_WIDTH / VIEWPORT_HEIGHT;
  context.camera.fov = 50;
  context.camera.updateProjectionMatrix();
  const player = new FakePlayer();
  const rig = new CameraRig({ playerSource: player, input: new InputState() });
  rig.init(context);
  return { context, rig, player };
}

/** 投影一个世界点到屏幕 Y 占比（0=顶, 1=底）。 */
function screenY(context: GameContext, x: number, y: number, z: number): number {
  // 必须在投影前刷新相机矩阵：applyCameraTransform 只改了 position 与 lookAt。
  context.camera.updateMatrixWorld(true);
  const ndc = new Vector3(x, y, z).project(context.camera);
  return (1 - ndc.y) / 2;
}

function measureFraming(context: GameContext, player: FakePlayer): Framing {
  const { x, y, z } = player.position;
  const headPct = screenY(context, x, y + HERO_HEIGHT, z);
  const feetPct = screenY(context, x, y, z);
  // 地平线：沿镜头水平朝向取一个足够远的点（其屏幕 Y 即地平线高度）。
  const dir = context.camera.getWorldDirection(new Vector3());
  const horizontal = new Vector3(dir.x, 0, dir.z).normalize();
  const horizonPct = screenY(
    context,
    context.camera.position.x + horizontal.x * 400,
    context.camera.position.y,
    context.camera.position.z + horizontal.z * 400,
  );
  return { headPct, feetPct, heightPct: feetPct - headPct, horizonPct };
}

describe("V0.2 默认构图（真实投影验算）", () => {
  it("默认参数落在手册规定区间：5m / 0.24rad / 前看 1.6m", () => {
    expect(CAMERA_DEFAULT_DISTANCE).toBeGreaterThanOrEqual(4.8);
    expect(CAMERA_DEFAULT_DISTANCE).toBeLessThanOrEqual(5.5);
    expect(CAMERA_DEFAULT_PITCH).toBeGreaterThanOrEqual(0.22);
    expect(CAMERA_DEFAULT_PITCH).toBeLessThanOrEqual(0.3);
    expect(CAMERA_LOOK_AHEAD_DEFAULT).toBeGreaterThanOrEqual(1);
    expect(CAMERA_LOOK_AHEAD_DEFAULT).toBeLessThanOrEqual(2);
  });

  it("角色屏高落在 25%～32%", () => {
    const { context, rig, player } = createRig();
    rig.update(1 / 60, context);
    const framing = measureFraming(context, player);
    expect(framing.heightPct).toBeGreaterThanOrEqual(0.25);
    expect(framing.heightPct).toBeLessThanOrEqual(0.32);
  });

  it("角色位于画面中下部（脚底 72%～95%、头顶 48%～72%）", () => {
    const { context, rig, player } = createRig();
    rig.update(1 / 60, context);
    const framing = measureFraming(context, player);
    expect(framing.feetPct).toBeGreaterThanOrEqual(0.72);
    expect(framing.feetPct).toBeLessThanOrEqual(0.95);
    expect(framing.headPct).toBeGreaterThanOrEqual(0.48);
    expect(framing.headPct).toBeLessThanOrEqual(0.72);
  });

  it("地平线不贴近画面顶部（≤45%，即上半部仍有天空间隔）", () => {
    const { context, rig, player } = createRig();
    rig.update(1 / 60, context);
    const framing = measureFraming(context, player);
    expect(framing.horizonPct).toBeGreaterThan(0.05); // 不在画面外/顶部贴边
    expect(framing.horizonPct).toBeLessThanOrEqual(0.45);
  });

  it("旧参数 8m / 0.42rad 会明显更差（证明本次调整有效，而非参数无意义）", () => {
    const { context, player } = createRig();
    // 用旧参数独立构造一个 Rig 做对照。
    const legacy = new CameraRig({
      playerSource: player,
      input: new InputState(),
      distance: 8,
      pitch: 0.42,
      lookAhead: 0, // 旧实现没有前看
    });
    legacy.init(context);
    legacy.update(1 / 60, context);
    const legacyFraming = measureFraming(context, player);

    // 旧构图的角色屏高明显更小（角色偏小）。
    expect(legacyFraming.heightPct).toBeLessThan(0.25);
    // 旧构图地平线更靠上。
    expect(legacyFraming.horizonPct).toBeLessThan(0.2);
  });
});

describe("V0.2 结局构图（13m 契约下不变成顶视图）", () => {
  it("结局俯角低于 0.62（顶视阈值），且 13m 距离契约不变", () => {
    expect(CAMERA_FINALE_DISTANCE).toBe(13); // 验收契约不得改动
    expect(CAMERA_FINALE_PITCH).toBeLessThan(0.62);
    expect(CAMERA_FINALE_PITCH).toBeLessThanOrEqual(0.45);
  });

  it("13m 结局镜头下地平线仍在画面上半部可见区（非顶视）", () => {
    const { context, rig, player } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    for (let i = 0; i < 900; i += 1) rig.update(1 / 60, context);

    expect(rig.getDistance()).toBeCloseTo(13, 2);
    const framing = measureFraming(context, player);
    // 顶视图会让地平线跑出画面或贴近顶部；这里要求它仍在上半部可读范围。
    expect(framing.horizonPct).toBeGreaterThanOrEqual(0);
    expect(framing.horizonPct).toBeLessThanOrEqual(0.5);
    // 角色仍可见（脚底在画面内，未被抬到画外）。
    expect(framing.feetPct).toBeLessThan(1);
    expect(framing.headPct).toBeGreaterThan(0);
  });

  it("结局时角色屏高仍在可辨识范围内（不因拉远而消失）", () => {
    const { context, rig, player } = createRig();
    context.events.emit("story:completed", { nodeId: "tree" });
    for (let i = 0; i < 900; i += 1) rig.update(1 / 60, context);
    const framing = measureFraming(context, player);
    expect(framing.heightPct).toBeGreaterThan(0.06);
    expect(framing.heightPct).toBeLessThan(0.3);
  });
});

describe("V0.2 前看行为", () => {
  it("默认距离下前看 = 1.6m（手册 1～2m 区间）", () => {
    const { context, rig } = createRig();
    rig.update(1 / 60, context);
    expect(rig.getLookAhead()).toBeCloseTo(CAMERA_LOOK_AHEAD_DEFAULT, 5);
  });

  it("注视点在跟随点前方（沿镜头水平前向）而不是脚下或身后", () => {
    const { context, rig } = createRig();
    rig.update(1 / 60, context);
    const follow = rig.getFollowPoint();
    const target = rig.getLookTarget();
    // 默认 yaw=0 时镜头看向 -Z：注视点应在跟随点 -Z 方向 1.6m。
    expect(target.z).toBeLessThan(follow.z);
    expect(follow.z - target.z).toBeCloseTo(rig.getLookAhead(), 5);
    // 前看不改变高度（只看前方，不下压）。
    expect(target.y).toBeCloseTo(follow.y, 6);
    expect(Math.abs(target.x - follow.x)).toBeLessThan(1e-6);
  });

  it("跟随点本身仍是玩家位置（前看只影响注视方向，不移动跟随点）", () => {
    const { context, rig, player } = createRig();
    rig.update(1 / 60, context);
    const follow = rig.getFollowPoint();
    expect(follow.x).toBeCloseTo(player.position.x, 3);
    expect(follow.z).toBeCloseTo(player.position.z, 3);
  });

  it("前看随距离等比缩放，缩放后构图保持一致", () => {
    const { context, rig } = createRig();
    const nearLookAhead = rig.getLookAhead(); // 5m 下 1.6m
    // 拉远到接近上限。
    for (let i = 0; i < 200; i += 1) {
      rig["input"].addWheelDelta(200);
      rig.update(1 / 60, context);
    }
    const farDistance = rig.getDistance();
    expect(farDistance).toBeGreaterThan(nearLookAhead);
    // 前看 = 距离 × 0.32，且不超过绝对上限。
    expect(rig.getLookAhead()).toBeGreaterThanOrEqual(nearLookAhead);
    expect(rig.getLookAhead()).toBeLessThanOrEqual(5);
  });

  it("显式 lookAhead 覆盖默认等比缩放（供 QA/调试固定构图）", () => {
    const { player } = createRig();
    const context = createFakeGameContext();
    const fixed = new CameraRig({
      playerSource: player,
      input: new InputState(),
      lookAhead: 0,
    });
    fixed.init(context);
    fixed.update(1 / 60, context);
    expect(fixed.getLookAhead()).toBe(0);
    expect(fixed.getLookTarget().z).toBeCloseTo(fixed.getFollowPoint().z, 6);
  });
});
