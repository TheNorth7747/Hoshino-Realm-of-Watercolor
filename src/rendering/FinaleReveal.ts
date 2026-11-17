/**
 * 最终章远景显色（A1，PRD 5.4「远景染色」/ 3.1 步骤 6）。
 *
 * 为什么需要它：远山环带在可玩边界（±48m）之外，世界遮罩的 UV 只覆盖 0～1，
 * 界外片段的 `wcInBounds = 0`，再大的 bloom 半径也染不到远山。
 * 这里用**同一份 uniforms** 增加一个「整片显色」标量 `uFinaleReveal`，
 * 由既有的 `story:completed({nodeId:"tree"})` 事件驱动，不引入第二套故事状态。
 *
 * 纯逻辑（无 DOM / 无 three 依赖），便于单测触发、渐进与重置。
 */

/** 远景显色时长：与花树 bloom（约 1.1s）同步开始，整体略长，收尾更慢。 */
export const FINALE_REVEAL_SECONDS = 2.6;

export interface FinaleRevealOptions {
  readonly durationSeconds?: number;
}

export class FinaleReveal {
  private readonly duration: number;
  private elapsed = 0;
  private playing = false;
  private current = 0;

  constructor(options: FinaleRevealOptions = {}) {
    this.duration = Math.max(0.2, options.durationSeconds ?? FINALE_REVEAL_SECONDS);
  }

  /** 当前显色程度 0..1。0 = 远山保持线稿，1 = 完全显色。 */
  get value(): number {
    return this.current;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * 幂等触发：播放中重复触发不重置进度，已完成则保持 1。
   * 只有 reset() 之后才会重新开始。
   */
  trigger(): void {
    if (this.playing || this.current >= 1) return;
    this.playing = true;
  }

  /** 推进一帧，返回当前值。未触发时始终返回 0。 */
  update(deltaSeconds: number): number {
    if (!this.playing) return this.current;

    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    // ease-out cubic：与 ColorRevealMask 的 bloom 节奏一致，先快后慢
    this.current = 1 - Math.pow(1 - t, 3);
    if (t >= 1) {
      this.current = 1;
      this.playing = false;
    }
    return this.current;
  }

  reset(): void {
    this.elapsed = 0;
    this.playing = false;
    this.current = 0;
  }
}
