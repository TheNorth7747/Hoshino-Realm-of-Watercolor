import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { EventBus } from "../../src/core/EventBus";
import type { GameContext } from "../../src/core/contracts";
import { VfxSystem, type VfxSystemOptions } from "../../src/effects/VfxSystem";
import { createAudioManager } from "../../src/effects/AudioManager";

/**
 * 测试替身策略：用共享契约的 EventBus 发真实事件载荷驱动 VFX，
 * 断言只针对 VFX 自己的粒子统计，不读取也不写死故事系统的内部状态。
 */
function makeHarness(overrides: Partial<VfxSystemOptions> = {}) {
  const bus = new EventBus();
  const treePos = overrides.treePosition ?? new Vector3(0, 0, -22);
  const vfx = new VfxSystem({
    bus,
    treePosition: treePos,
    petalCapacity: 50,
    rippleCapacity: 10,
    petalsPerBloom: 20,
    random: { next: () => 0.5 },
    ...overrides,
  });
  return { bus, vfx, treePos };
}

function stubContext(): GameContext {
  // VFX 的 init 只用 worldRoot 与 debug.registerStatSource；这里给最小测试替身。
  const noop = (): void => undefined;
  return {
    worldRoot: { add: noop } as unknown as GameContext["worldRoot"],
    debug: { registerStatSource: () => noop } as unknown as GameContext["debug"],
  } as unknown as GameContext;
}

describe("VfxSystem（事件驱动）", () => {
  it("story:completed(tree) 生成花瓣，其他节点不生成", () => {
    const { bus, vfx } = makeHarness();
    expect(vfx.stats.petals.active).toBe(0);

    bus.emit("story:completed", { nodeId: "flower" });
    expect(vfx.stats.petals.active).toBe(0);
    expect(vfx.stats.treeBursts).toBe(0);

    bus.emit("story:completed", { nodeId: "tree" });
    expect(vfx.stats.petals.active).toBeGreaterThan(0);
    expect(vfx.stats.petals.active).toBeLessThanOrEqual(50);
    expect(vfx.stats.treeBursts).toBe(1);
    vfx.dispose();
  });

  it("color:bloom 生成涟漪，载荷半径/时长透传给粒子", () => {
    const { bus, vfx } = makeHarness();
    bus.emit("color:bloom", { position: new Vector3(-8, 0, 20), radius: 5, duration: 1.5 });
    expect(vfx.stats.ripples.active).toBe(1);
    expect(vfx.stats.ripples.spawned).toBe(1);
    vfx.dispose();
  });

  it("update 推进生命周期；粒子到期后回收，不无限增长", () => {
    const { bus, vfx } = makeHarness({ petalLifetimeSeconds: 1, rippleLifetimeSeconds: 0.5 });
    bus.emit("story:completed", { nodeId: "tree" });
    bus.emit("color:bloom", { position: new Vector3(), radius: 4, duration: 0.5 });
    const ctx = stubContext();

    vfx.update(0.3, ctx);
    expect(vfx.stats.petals.active).toBeGreaterThan(0);
    expect(vfx.stats.ripples.active).toBe(1);

    vfx.update(1.5, ctx);
    expect(vfx.stats.petals.active).toBe(0);
    expect(vfx.stats.ripples.active).toBe(0);
    vfx.dispose();
  });

  it("大量事件反复触发仍受上限约束", () => {
    const { bus, vfx } = makeHarness();
    for (let i = 0; i < 100; i += 1) {
      bus.emit("story:completed", { nodeId: "tree" });
      bus.emit("color:bloom", { position: new Vector3(), radius: 5, duration: 10 });
    }
    expect(vfx.stats.petals.active).toBeLessThanOrEqual(50);
    expect(vfx.stats.ripples.active).toBeLessThanOrEqual(10);
    expect(vfx.stats.treeBursts).toBe(100);
    vfx.dispose();
  });

  it("game:reset 通过共享事件清空粒子并计数", () => {
    const { bus, vfx } = makeHarness();
    bus.emit("story:completed", { nodeId: "tree" });
    bus.emit("color:bloom", { position: new Vector3(), radius: 5, duration: 10 });
    expect(vfx.stats.petals.active).toBeGreaterThan(0);
    expect(vfx.stats.ripples.active).toBe(1);

    bus.emit("game:reset");
    expect(vfx.stats.petals.active).toBe(0);
    expect(vfx.stats.ripples.active).toBe(0);
    expect(vfx.stats.resets).toBe(1);
    vfx.dispose();
  });

  it("dispose 解绑所有监听并释放场景对象，事件不再生效", () => {
    const bus = new EventBus();
    const vfx = new VfxSystem({ bus, treePosition: new Vector3(), petalsPerBloom: 5 });
    expect(bus.listenerCount("story:completed")).toBe(1);
    expect(bus.listenerCount("color:bloom")).toBe(1);
    expect(bus.listenerCount("game:reset")).toBe(1);

    vfx.dispose();
    vfx.dispose(); // 幂等
    expect(bus.listenerCount()).toBe(0);

    bus.emit("story:completed", { nodeId: "tree" });
    bus.emit("color:bloom", { position: new Vector3(), radius: 5, duration: 1 });
    expect(vfx.stats.petals.active).toBe(0);
    expect(vfx.stats.ripples.active).toBe(0);
  });

  it("init 把场景对象挂到 worldRoot 并注册调试统计源", () => {
    const added: unknown[] = [];
    const registered: string[] = [];
    const context = {
      worldRoot: { add: (...objs: unknown[]) => added.push(...objs) },
      debug: {
        registerStatSource: (source: { id: string }) => {
          registered.push(source.id);
          return () => undefined;
        },
      },
    } as unknown as GameContext;

    const bus = new EventBus();
    const vfx = new VfxSystem({ bus, treePosition: new Vector3() });
    vfx.init(context);
    vfx.init(context); // 重复 init 不重复挂载
    expect(added).toHaveLength(2);
    expect(registered).toEqual(["vfx"]);
    vfx.dispose();
  });
});

describe("createAudioManager（P1 不阻塞 P0）", () => {
  it("默认关闭：不创建 AudioContext、play/unlock 无副作用也不抛错", () => {
    const audio = createAudioManager();
    expect(audio.enabled).toBe(false);
    expect(audio.started).toBe(false);
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.play("shard")).not.toThrow();
    expect(audio.started).toBe(false);
    audio.dispose();
  });

  it("浏览器拒绝 AudioContext 时静默降级，不抛出", () => {
    const onError = (() => undefined) as (error: unknown) => void;
    const audio = createAudioManager({ enabled: true, onError });
    // Node 环境无 window.AudioContext：ensureContext 返回 null，play 安全返回。
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.play("bloom")).not.toThrow();
    audio.dispose();
  });
});
