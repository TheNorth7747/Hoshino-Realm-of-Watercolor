/**
 * 固定容量槽池：A5 粒子数量上限的通用底座（PRD 9.7 / 11.1）。
 *
 * - 用空闲索引栈实现 O(1) 分配 / 回收，槽位总数在构造时固定，永不增长。
 * - 池满时 acquire 返回 null，由调用方丢弃新粒子；这是“不无限增长”的硬保证。
 * - 重复 release 同一索引会被忽略，避免计数被减成负数。
 */
export class SlotPool {
  readonly capacity: number;

  private readonly free: number[] = [];
  private readonly active = new Set<number>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`SlotPool capacity 必须是正整数，收到：${capacity}`);
    }
    this.capacity = capacity;
    // 倒序入栈，使 pop() 从 0 号槽开始分配，便于调试。
    for (let i = capacity - 1; i >= 0; i -= 1) this.free.push(i);
  }

  /** 取一个空闲槽；池满返回 null。 */
  acquire(): number | null {
    const slot = this.free.pop();
    if (slot === undefined) return null;
    this.active.add(slot);
    return slot;
  }

  /** 归还槽位；非法索引或重复归还均被忽略。 */
  release(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.capacity) return;
    if (!this.active.delete(slot)) return;
    this.free.push(slot);
  }

  get activeCount(): number {
    return this.active.size;
  }

  get isFull(): boolean {
    return this.active.size === this.capacity;
  }

  /** 遍历活跃槽位；迭代期间允许 release（基于副本遍历）。 */
  forEachActive(visit: (slot: number) => void): void {
    for (const slot of [...this.active]) visit(slot);
  }

  clear(): void {
    this.active.clear();
    this.free.length = 0;
    for (let i = this.capacity - 1; i >= 0; i -= 1) this.free.push(i);
  }
}
