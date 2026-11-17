/**
 * 可选音频管理器（A5，PRD 4.2 P1 / 9.7）。
 *
 * 硬约束：音频属于 P1，默认关闭，不得阻塞 P0。
 * - 不修改 main.ts、不自动注册系统、不自动播放。
 * - AudioContext 只在显式 enable() 且首次用户交互后才创建；浏览器拒绝时静默降级。
 * - 任何 Web Audio 失败都不抛给游戏循环，全部吞掉并记录到 onError。
 * - 无外部资产：音效为程序化合成，不存在来源/许可证问题。
 */
export type AudioCue = "shard" | "bloom" | "unlock";

export interface AudioManagerOptions {
  /** 默认 false：P0 阶段保持静音。 */
  readonly enabled?: boolean;
  readonly masterGain?: number;
  readonly onError?: (error: unknown) => void;
}

export interface AudioManager {
  readonly enabled: boolean;
  readonly started: boolean;
  /** 首次用户交互后调用；仅在 enabled 时创建 AudioContext。 */
  unlock(): void;
  enable(): void;
  disable(): void;
  play(cue: AudioCue): void;
  dispose(): void;
}

interface ToneSpec {
  readonly frequency: number;
  readonly durationSeconds: number;
  readonly type: OscillatorType;
}

const TONES: Readonly<Record<AudioCue, ToneSpec>> = {
  shard: { frequency: 880, durationSeconds: 0.18, type: "sine" },
  bloom: { frequency: 523.25, durationSeconds: 0.5, type: "triangle" },
  unlock: { frequency: 659.25, durationSeconds: 0.3, type: "sine" },
};

export function createAudioManager(options: AudioManagerOptions = {}): AudioManager {
  let enabled = options.enabled ?? false;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let disposed = false;

  const report = (error: unknown): void => {
    options.onError?.(error);
  };

  const ensureContext = (): AudioContext | null => {
    if (!enabled || disposed || context) return context;
    try {
      const audioWindow = window as typeof window & {
        readonly webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = window.AudioContext ?? audioWindow.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = options.masterGain ?? 0.18;
      master.connect(context.destination);
    } catch (error) {
      context = null;
      master = null;
      report(error);
    }
    return context;
  };

  return {
    get enabled(): boolean {
      return enabled;
    },
    get started(): boolean {
      return context !== null;
    },
    enable(): void {
      enabled = true;
    },
    disable(): void {
      enabled = false;
    },
    unlock(): void {
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        if (ctx.state === "suspended") void ctx.resume().catch(report);
      } catch (error) {
        report(error);
      }
    },
    play(cue: AudioCue): void {
      const ctx = ensureContext();
      if (!ctx || !master || ctx.state !== "running") return;
      const spec = TONES[cue];
      try {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        oscillator.type = spec.type;
        oscillator.frequency.setValueAtTime(spec.frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(1, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.durationSeconds);
        oscillator.connect(gain).connect(master);
        oscillator.start(now);
        oscillator.stop(now + spec.durationSeconds + 0.02);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      } catch (error) {
        report(error);
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      enabled = false;
      try {
        void context?.close().catch(report);
      } catch (error) {
        report(error);
      }
      context = null;
      master = null;
    },
  };
}
