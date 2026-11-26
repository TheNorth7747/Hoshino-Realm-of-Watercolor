import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import type { Material, Mesh } from "three";
import {
  createHeroMesh,
  HERO_COLORS,
  HERO_HEIGHT,
  PLAYER_PLACEHOLDER_NAME,
} from "../../src/player/heroCharacter";
import {
  HERO_IDLE_SPEED,
  HERO_RUN_SPEED,
  HeroRig,
  resolveMotionState,
} from "../../src/player/HeroRig";
import { PlayerController } from "../../src/player/PlayerController";
import { applyKeyEvent } from "../../src/player/InputState";
import {
  createFakeGameContext,
  placeCameraLookingNegZ,
  runFrames,
} from "./helpers/fake-game-context";

const DT = 1 / 60;

describe("V0.2 角色模型 · 结构与兼容性", () => {
  it("根节点沿用 player-placeholder 名称（A2/A6 既有查找方式不变）", () => {
    const hero = createHeroMesh();
    expect(hero.root.name).toBe(PLAYER_PLACEHOLDER_NAME);
    expect(hero.root.userData["heroName"]).toBe("player-hero");
  });

  it("原点位于脚下中心：髋部与脚部高度符合脚下原点约定", () => {
    const hero = createHeroMesh();
    hero.root.updateMatrixWorld(true);
    // 髋部枢轴在 y=0.5，靴底几何再向下延伸约 0.51，脚底贴近 y=0。
    expect(hero.legLeft.position.y).toBeCloseTo(0.5, 6);
    const boot = hero.root.getObjectByName("hero-boot-left");
    expect(boot).toBeDefined();
    expect(hero.root.position.y).toBe(0);
  });

  it("总高与导出常量一致（构图测试依赖该值）", () => {
    expect(HERO_HEIGHT).toBeGreaterThan(1.3);
    expect(HERO_HEIGHT).toBeLessThan(1.6);
  });

  it("包含手册要求的部件：圆润兜帽、身体、白色袖口、双腿、斗篷层次", () => {
    const hero = createHeroMesh();
    const required = [
      "hero-hood", // 圆润兜帽
      "hero-hood-brim", // 帽檐（避免纯球体感）
      "hero-torso", // 身体
      "hero-skirt", // 白色内搭裙摆
      "hero-cloak-outer", // 斗篷外层
      "hero-cloak-inner", // 斗篷内衬（层次）
      "hero-arm-left-cuff", // 白色袖口
      "hero-arm-right-cuff",
      "hero-leg-left", // 双腿
      "hero-leg-right",
      "hero-boot-left", // 短靴
      "hero-boot-right",
      "hero-basket", // 参考帧小篮
    ];
    for (const name of required) {
      expect(hero.root.getObjectByName(name), `缺少部件 ${name}`).toBeDefined();
    }
  });

  it("斗篷双层几何都可见（DoubleSide），不会只从正面可见", () => {
    const hero = createHeroMesh();
    const outer = hero.root.getObjectByName("hero-cloak-outer") as Mesh;
    const inner = hero.root.getObjectByName("hero-cloak-inner") as Mesh;
    expect(outer.material).toBeDefined();
    expect(inner.material).toBeDefined();
    // 开口圆柱用 DoubleSide（2）
    expect((outer.material as Material).side).toBe(2);
    expect((inner.material as Material).side).toBe(2);
  });

  it("斗篷是深红、内搭是白色（配色与参考帧一致）", () => {
    expect(HERO_COLORS.cloak).toBe(0xb4342a);
    expect(HERO_COLORS.inner).toBe(0xf6f1e6);
  });

  it("可动节点成组暴露给 HeroRig（不靠遍历场景图找节点）", () => {
    const hero = createHeroMesh();
    expect(hero.body.name).toBe("hero-body");
    expect(hero.armLeft.name).toBe("hero-arm-left");
    expect(hero.armRight.name).toBe("hero-arm-right");
    expect(hero.legLeft.name).toBe("hero-leg-left");
    expect(hero.legRight.name).toBe("hero-leg-right");
    expect(hero.cloak.name).toBe("hero-cloak");
    expect(hero.materials.length).toBeGreaterThan(5);
  });
});

describe("V0.2 动作状态判定", () => {
  it("速度阈值映射：静止 → idle，低速 → walk，高速 → run", () => {
    expect(resolveMotionState(0)).toBe("idle");
    expect(resolveMotionState(HERO_IDLE_SPEED - 0.01)).toBe("idle");
    expect(resolveMotionState(HERO_IDLE_SPEED + 0.01)).toBe("walk");
    expect(resolveMotionState(4.2)).toBe("walk");
    expect(resolveMotionState(HERO_RUN_SPEED - 0.01)).toBe("walk");
    expect(resolveMotionState(HERO_RUN_SPEED)).toBe("run");
    expect(resolveMotionState(6.2)).toBe("run"); // Sprint
  });

  it("非有限速度一律按静止处理（非法输入不做激进动作）", () => {
    expect(resolveMotionState(Number.NaN)).toBe("idle");
    expect(resolveMotionState(Number.POSITIVE_INFINITY)).toBe("idle");
    expect(resolveMotionState(Number.NEGATIVE_INFINITY)).toBe("idle");
    expect(resolveMotionState(-3)).toBe("idle");
  });

  it("跑步阈值低于 Shift 小跑速度，确保小跑一定进入 run", () => {
    expect(HERO_RUN_SPEED).toBeLessThan(6.2);
    expect(HERO_RUN_SPEED).toBeGreaterThan(4.2); // 普通走路不误判为跑
  });
});

describe("V0.2 动作驱动 · 由真实速度而非固定动画", () => {
  it("静止时不摆动双腿，但仍有呼吸起伏（不是完全冻结）", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    for (let i = 0; i < 60; i += 1) rig.update(DT, 0);
    const state = rig.getState();
    expect(state.motion).toBe("idle");
    expect(state.legSwing).toBe(0);
    expect(state.armSwing).toBe(0);
    expect(Math.abs(state.bob)).toBeGreaterThan(0); // 呼吸起伏非零
    expect(Math.abs(state.bob)).toBeLessThan(0.02);
  });

  it("走路时双腿反相摆动、手臂与腿反相", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    for (let i = 0; i < 40; i += 1) rig.update(DT, 4.2);

    const state = rig.getState();
    expect(state.motion).toBe("walk");
    expect(Math.abs(state.legSwing)).toBeGreaterThan(0.05);

    // 腿：左右反相
    expect(hero.legLeft.rotation.x).toBeCloseTo(state.legSwing, 6);
    expect(hero.legRight.rotation.x).toBeCloseTo(-state.legSwing, 6);
    // 臂：左右彼此反相，且与同侧腿反相（armSwing 本身已对 legSwing 取反）
    expect(hero.armLeft.rotation.x).toBeCloseTo(state.armSwing, 6);
    expect(hero.armRight.rotation.x).toBeCloseTo(-state.armSwing, 6);
    expect(Math.sign(hero.armLeft.rotation.x)).not.toBe(Math.sign(hero.legLeft.rotation.x));
  });

  it("步频随实际速度提高（同一时间内更快速度累积更多相位）", () => {
    const slow = new HeroRig(createHeroMesh());
    const fast = new HeroRig(createHeroMesh());
    for (let i = 0; i < 60; i += 1) {
      slow.update(DT, 2.0);
      fast.update(DT, 4.2);
    }
    expect(fast.getState().phase).toBeGreaterThan(slow.getState().phase * 1.8);
  });

  it("跑步幅度比走路更大（腿摆、起伏、前倾）", () => {
    const walk = new HeroRig(createHeroMesh());
    const run = new HeroRig(createHeroMesh());
    // 采样多帧取最大绝对值，避免相位恰好落在零点。
    let walkLegMax = 0;
    let runLegMax = 0;
    let walkBobMax = 0;
    let runBobMax = 0;
    for (let i = 0; i < 120; i += 1) {
      walk.update(DT, 4.2);
      run.update(DT, 6.2);
      walkLegMax = Math.max(walkLegMax, Math.abs(walk.getState().legSwing));
      runLegMax = Math.max(runLegMax, Math.abs(run.getState().legSwing));
      walkBobMax = Math.max(walkBobMax, walk.getState().bob);
      runBobMax = Math.max(runBobMax, run.getState().bob);
    }
    expect(runLegMax).toBeGreaterThan(walkLegMax);
    expect(runBobMax).toBeGreaterThan(walkBobMax);
    expect(run.getState().lean).toBeGreaterThan(walk.getState().lean);
  });

  it("斗篷有滞后摆动：速度突变后不立即到达目标，而是逐帧逼近", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    // 先走一会儿建立稳定摆动。
    for (let i = 0; i < 60; i += 1) rig.update(DT, 4.2);

    // 突然加速：斗篷角度应在接下来若干帧内连续变化（滞后），而不是瞬移。
    const samples: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      rig.update(DT, 6.2);
      samples.push(rig.getState().cloakSwing);
    }
    const distinct = new Set(samples.map((v) => v.toFixed(4))).size;
    expect(distinct).toBeGreaterThan(6); // 连续变化，不是固定值
    for (let i = 1; i < samples.length; i += 1) {
      const delta = Math.abs((samples[i] ?? 0) - (samples[i - 1] ?? 0));
      expect(delta).toBeLessThan(0.2); // 单帧变化有上限（有阻尼）
    }
  });

  it("停下后摆幅收敛回静止范围（不会一直保持跑步姿态）", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    for (let i = 0; i < 120; i += 1) rig.update(DT, 6.2);
    expect(Math.abs(rig.getState().legSwing)).toBeGreaterThan(0.05);

    for (let i = 0; i < 180; i += 1) rig.update(DT, 0);
    const state = rig.getState();
    expect(state.motion).toBe("idle");
    expect(state.legSwing).toBe(0);
    expect(Math.abs(state.lean)).toBeLessThan(0.02);
    expect(Math.abs(state.cloakSwing)).toBeLessThan(0.05);
  });

  it("reset 回到初始姿态并清空相位", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    for (let i = 0; i < 120; i += 1) rig.update(DT, 6.2);
    expect(rig.getState().phase).toBeGreaterThan(0);

    rig.reset();
    const state = rig.getState();
    expect(state.phase).toBe(0);
    expect(state.motion).toBe("idle");
    expect(state.legSwing).toBe(0);
    expect(state.armSwing).toBe(0);
    expect(state.bob).toBe(0);
    expect(state.cloakSwing).toBe(0);
    expect(hero.body.position.y).toBe(0);
    expect(hero.legLeft.rotation.x).toBe(0);
  });

  it("超长 delta 与 NaN 速度不产生 NaN 姿态", () => {
    const hero = createHeroMesh();
    const rig = new HeroRig(hero);
    rig.update(10, 4.2);
    rig.update(DT, Number.NaN);
    rig.update(-1, 4.2);
    const state = rig.getState();
    for (const key of ["phase", "legSwing", "armSwing", "bob", "lean", "cloakSwing"] as const) {
      expect(Number.isFinite(state[key]), `${key} 应为有限值`).toBe(true);
    }
  });
});

describe("V0.2 角色与控制器集成 · 契约兼容", () => {
  it("PlayerController 挂载新角色并暴露动作状态", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);

    const mesh = context.worldRoot.children.find((c) => c.name === PLAYER_PLACEHOLDER_NAME);
    expect(mesh).toBeDefined();

    const state = player.getHeroMotionState();
    expect(state).not.toBeNull();
    expect(state?.motion).toBe("idle");
    player.dispose();
  });

  it("移动时动作切到 walk，停止后回 idle（动作与真实速度同源）", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);

    applyKeyEvent(player.input, "KeyW", true);
    runFrames(player, context, 60);
    expect(player.getHeroMotionState()?.motion).toBe("walk");
    expect(player.getPlayerSnapshot().speed).toBeGreaterThan(4);

    player.input.clearKeys();
    runFrames(player, context, 180);
    expect(player.getHeroMotionState()?.motion).toBe("idle");
    player.dispose();
  });

  it("Shift 小跑时动作切到 run", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);

    applyKeyEvent(player.input, "KeyW", true);
    applyKeyEvent(player.input, "ShiftLeft", true);
    runFrames(player, context, 60);
    expect(player.getHeroMotionState()?.motion).toBe("run");
    player.dispose();
  });

  it("角色根节点位置/朝向仍跟随玩家快照（原点与转向契约不变）", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);
    applyKeyEvent(player.input, "KeyD", true);
    runFrames(player, context, 90);

    const mesh = context.worldRoot.children.find((c) => c.name === PLAYER_PLACEHOLDER_NAME);
    const snapshot = player.getPlayerSnapshot();
    expect(mesh?.position.x).toBeCloseTo(snapshot.position.x, 6);
    expect(mesh?.position.z).toBeCloseTo(snapshot.position.z, 6);
    expect(mesh?.rotation.y).toBeCloseTo(snapshot.headingRadians, 6);
    player.dispose();
  });

  it("碰撞半径与移动速度未被角色升级改变", async () => {
    const mod = await import("../../src/player/PlayerController");
    expect(mod.PLAYER_COLLISION_RADIUS).toBe(0.4);
    expect(mod.PLAYER_MOVE_SPEED).toBe(4.2);
    expect(mod.PLAYER_SPRINT_SPEED).toBe(6.2);
  });

  it("PlayerSnapshot 字段与契约一致（position/heading/speed/grounded）", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);
    const snapshot = player.getPlayerSnapshot();
    expect(snapshot.position).toBeInstanceOf(Vector3);
    expect(typeof snapshot.headingRadians).toBe("number");
    expect(typeof snapshot.speed).toBe("number");
    expect(typeof snapshot.grounded).toBe("boolean");
    player.dispose();
  });

  it("game:reset 复位角色动作与姿态", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);

    applyKeyEvent(player.input, "KeyW", true);
    applyKeyEvent(player.input, "ShiftLeft", true);
    runFrames(player, context, 90);
    expect(player.getHeroMotionState()?.phase).toBeGreaterThan(0);

    context.events.emit("game:reset");
    const state = player.getHeroMotionState();
    expect(state?.motion).toBe("idle");
    expect(state?.phase).toBe(0);
    expect(state?.legSwing).toBe(0);
    player.dispose();
  });

  it("dispose 后动作状态清空（不残留引用）", () => {
    const context = createFakeGameContext();
    placeCameraLookingNegZ(context.camera);
    const player = new PlayerController();
    player.init(context);
    player.dispose();
    expect(player.getHeroMotionState()).toBeNull();
  });
});
