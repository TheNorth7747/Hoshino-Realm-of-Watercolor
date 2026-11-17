import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { PetalEmitter } from "../../src/effects/Petals";
import { RippleEmitter } from "../../src/effects/Ripples";
import { SlotPool } from "../../src/effects/SlotPool";

const fixedRandom = { next: () => 0.5 };

describe("SlotPool（粒子数量上限底座）", () => {
  it("容量固定，池满时 acquire 返回 null", () => {
    const pool = new SlotPool(3);
    expect([pool.acquire(), pool.acquire(), pool.acquire()]).toEqual([0, 1, 2]);
    expect(pool.isFull).toBe(true);
    expect(pool.acquire()).toBeNull();
    expect(pool.activeCount).toBe(3);
  });

  it("重复 release 同一槽位被忽略，计数不会变负", () => {
    const pool = new SlotPool(2);
    const slot = pool.acquire();
    expect(slot).not.toBeNull();
    pool.release(slot as number);
    pool.release(slot as number);
    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(slot);
  });

  it("非法索引 release 安全；clear 恢复全部可用槽位", () => {
    const pool = new SlotPool(2);
    pool.acquire();
    pool.acquire();
    expect(() => pool.release(-1)).not.toThrow();
    expect(() => pool.release(99)).not.toThrow();
    pool.clear();
    expect(pool.activeCount).toBe(0);
    expect(pool.acquire()).toBe(0);
  });

  it("capacity 非正整数时抛 RangeError", () => {
    expect(() => new SlotPool(0)).toThrow(RangeError);
    expect(() => new SlotPool(-1)).toThrow(RangeError);
    expect(() => new SlotPool(1.5)).toThrow(RangeError);
  });
});

describe("PetalEmitter（花树花瓣）", () => {
  it("burst 生成花瓣且永不超过 capacity", () => {
    const emitter = new PetalEmitter({ capacity: 10, random: fixedRandom });
    const created = emitter.burst(new Vector3(0, 0, -22), 50);
    expect(created).toBe(10);
    expect(emitter.counts.active).toBe(10);
    expect(emitter.counts.peak).toBe(10);
    expect(emitter.counts.spawned).toBe(10);
    emitter.dispose();
  });

  it("生命周期结束后自动回收，dispose 后不再生成", () => {
    const onDispose = vi.fn();
    const emitter = new PetalEmitter({
      capacity: 8,
      lifetimeSeconds: 1,
      random: fixedRandom,
    });
    emitter.mesh.geometry.addEventListener("dispose", onDispose);

    emitter.burst(new Vector3(0, 0, 0), 4);
    emitter.update(0.5);
    expect(emitter.counts.active).toBe(4);
    emitter.update(0.6);
    expect(emitter.counts.active).toBe(0);
    expect(emitter.counts.reclaimed).toBe(4);

    emitter.dispose();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(emitter.isDisposed).toBe(true);
    expect(emitter.burst(new Vector3(), 4)).toBe(0);
  });

  it("clear 清空全部活跃粒子", () => {
    const emitter = new PetalEmitter({ capacity: 6, random: fixedRandom });
    emitter.burst(new Vector3(), 6);
    emitter.clear();
    expect(emitter.counts.active).toBe(0);
    emitter.dispose();
  });
});

describe("RippleEmitter（染色涟漪）", () => {
  it("emit 受容量上限约束，生命周期后回收", () => {
    const emitter = new RippleEmitter({ capacity: 2, lifetimeSeconds: 0.5 });
    expect(emitter.emit(new Vector3(), 5, 0.5)).toBe(1);
    expect(emitter.emit(new Vector3(), 5, 0.5)).toBe(1);
    expect(emitter.emit(new Vector3(), 5, 0.5)).toBe(0);
    expect(emitter.counts.active).toBe(2);
    emitter.update(0.6);
    expect(emitter.counts.active).toBe(0);
    expect(emitter.counts.reclaimed).toBe(2);
    emitter.dispose();
  });

  it("dispose 幂等且释放几何体", () => {
    const onDispose = vi.fn();
    const emitter = new RippleEmitter({ capacity: 2 });
    emitter.mesh.geometry.addEventListener("dispose", onDispose);
    emitter.emit(new Vector3(), 4);
    emitter.dispose();
    emitter.dispose();
    expect(onDispose).toHaveBeenCalledTimes(1);
    expect(emitter.isDisposed).toBe(true);
    expect(emitter.emit(new Vector3(), 4)).toBe(0);
  });
});
