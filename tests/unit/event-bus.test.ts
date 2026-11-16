import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../../src/core/EventBus";

describe("EventBus", () => {
  it("按注册顺序把载荷交给所有监听器", () => {
    const bus = new EventBus();
    const calls: string[] = [];

    bus.on("story:completed", (payload) => calls.push(`a:${payload.nodeId}`));
    bus.on("story:completed", (payload) => calls.push(`b:${payload.nodeId}`));

    bus.emit("story:completed", { nodeId: "flower" });

    expect(calls).toEqual(["a:flower", "b:flower"]);
  });

  it("once 只触发一次，之后自动解绑", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.once("game:finished", handler);
    bus.emit("game:finished", { elapsedSeconds: 1 });
    bus.emit("game:finished", { elapsedSeconds: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ elapsedSeconds: 1 });
    expect(bus.listenerCount("game:finished")).toBe(0);
  });

  it("on 返回的取消函数立即生效", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    const unsubscribe = bus.on("shard:collected", handler);
    bus.emit("shard:collected", { shardId: "shard-flower", total: 1 });
    unsubscribe();
    bus.emit("shard:collected", { shardId: "shard-flower", total: 1 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("shard:collected")).toBe(0);
  });

  it("off 只移除指定处理器", () => {
    const bus = new EventBus();
    const first = vi.fn();
    const second = vi.fn();

    bus.on("game:reset", first);
    bus.on("game:reset", second);
    bus.off("game:reset", first);
    bus.emit("game:reset");

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("无载荷事件的监听器收到 undefined", () => {
    const bus = new EventBus();
    const handler = vi.fn();

    bus.on("game:reset", handler);
    bus.emit("game:reset");

    expect(handler).toHaveBeenCalledWith(undefined);
  });

  it("单个监听器抛错不影响其他监听器，并上报错误", () => {
    const onHandlerError = vi.fn();
    const bus = new EventBus({ onHandlerError });
    const after = vi.fn();

    bus.on("color:bloom", () => {
      throw new Error("boom");
    });
    bus.on("color:bloom", after);

    bus.emit("color:bloom", {
      position: new Vector3(0, 0, 0),
      radius: 4,
      duration: 1,
    });

    expect(after).toHaveBeenCalledTimes(1);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect(onHandlerError.mock.calls[0]?.[1]).toBe("color:bloom");
  });

  it("监听器在回调里解绑自己不会打断本次派发", () => {
    const bus = new EventBus();
    const second = vi.fn();

    const unsubscribe = bus.on("story:completed", () => unsubscribe());
    bus.on("story:completed", second);

    expect(() => bus.emit("story:completed", { nodeId: "stream" })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("story:completed")).toBe(1);
  });

  it("clear 清空所有监听器，且重复 clear 安全", () => {
    const bus = new EventBus();
    bus.on("game:reset", () => undefined);
    bus.on("story:completed", () => undefined);

    expect(bus.listenerCount()).toBe(2);
    bus.clear();
    bus.clear();

    expect(bus.listenerCount()).toBe(0);
  });
});
