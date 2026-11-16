/**
 * 类型安全事件总线（A0 独占实现）。
 * - 事件名与载荷由 contracts.ts 的 GameEvents 唯一约束，禁止另起同义事件。
 * - 单个监听器抛错不影响其他监听器，错误交给 onHandlerError 上报。
 */
import type { EmitArgs, EventBusLike, EventHandler, GameEvents, Unsubscribe } from "./contracts";

type EventType = keyof GameEvents;
type AnyHandler = (payload: unknown) => void;

export interface EventBusOptions {
  readonly onHandlerError?: (error: unknown, type: EventType) => void;
}

export class EventBus implements EventBusLike {
  private readonly handlers = new Map<EventType, Set<AnyHandler>>();
  private readonly onHandlerError: ((error: unknown, type: EventType) => void) | undefined;

  constructor(options: EventBusOptions = {}) {
    this.onHandlerError = options.onHandlerError;
  }

  on<K extends EventType>(type: K, handler: EventHandler<K>): Unsubscribe {
    this.setFor(type).add(handler as AnyHandler);
    return () => {
      this.off(type, handler);
    };
  }

  once<K extends EventType>(type: K, handler: EventHandler<K>): Unsubscribe {
    const wrapped: EventHandler<K> = (payload) => {
      this.off(type, wrapped);
      handler(payload);
    };
    this.setFor(type).add(wrapped as AnyHandler);
    return () => {
      this.off(type, wrapped);
    };
  }

  off<K extends EventType>(type: K, handler: EventHandler<K>): void {
    const set = this.handlers.get(type);
    if (!set) return;
    set.delete(handler as AnyHandler);
    if (set.size === 0) this.handlers.delete(type);
  }

  emit<K extends EventType>(type: K, ...args: EmitArgs<K>): void {
    const set = this.handlers.get(type);
    if (!set) return;

    const payload = args[0] as GameEvents[K];
    // 复制一份：允许监听器在回调里 off/once 而不破坏本次遍历。
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        this.onHandlerError?.(error, type);
      }
    }
  }

  listenerCount(type?: EventType): number {
    if (type === undefined) {
      let total = 0;
      for (const set of this.handlers.values()) total += set.size;
      return total;
    }
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }

  private setFor(type: EventType): Set<AnyHandler> {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set<AnyHandler>();
      this.handlers.set(type, set);
    }
    return set;
  }
}
