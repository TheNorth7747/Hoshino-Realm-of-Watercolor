/**
 * 德彪西《第一号阿拉伯风格曲》(Première Arabesque in E major, L. 66) Web Audio 独奏钢琴引擎（V0.3）。
 *
 * - 公版乐谱（1888–1891 创作）：以 E 大调四升号流动性三连音琶音与抒情右手旋律编排，
 *   配合柔音毡槌钢琴音色包络与轻微室内延迟混响，营造温暖绘本沉浸感。
 * - 零外部音频文件、零网络请求；无头环境或浏览器自动播放策略拦截时静默降级，不报错。
 */

export interface PianoNoteEvent {
  /** 相对循环起点的触发时刻（秒）。 */
  readonly time: number;
  /** MIDI 音高编号（如 64 = E4，69 = A4）。 */
  readonly midi: number;
  /** 持续时长（秒）。 */
  readonly duration: number;
  /** 力度 0..1。 */
  readonly velocity: number;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 音名转 MIDI（如 "E4" -> 64, "C#5" -> 73）。 */
export function noteToMidi(name: string): number {
  const match = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!match) throw new Error(`无效音名: ${name}`);
  const letter = match[1]!.toUpperCase();
  const accidental = match[2];
  const octave = Number(match[3]);
  const baseMap: Readonly<Record<string, number>> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = baseMap[letter]!;
  const offset = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (octave + 1) * 12 + base + offset;
}

/**
 * 构建德彪西 L.66 E 大调主段落循环乐谱（Andantino con moto，约 32 秒无缝循环）。
 * 包含标志性的开篇流水三连音琶音级进与后续抒情“二对三”主旋律。
 */
function buildArabesqueScore(): {
  readonly notes: readonly PianoNoteEvent[];
  readonly duration: number;
} {
  const notes: PianoNoteEvent[] = [];
  const step3 = 0.255; // 轻柔流动性三连音时值（约 Andantino con moto）
  let cursor = 0.08;

  const push = (name: string, time: number, duration: number, velocity: number): void => {
    notes.push({ time, midi: noteToMidi(name), duration, velocity });
  };

  const pushTripletArp = (
    chord: readonly string[],
    start: number,
    vel: number,
    dur = 1.65,
  ): number => {
    chord.forEach((n, idx) => {
      push(n, start + idx * step3, dur, vel * (0.86 + (idx % 3) * 0.06));
    });
    return start + chord.length * step3;
  };

  // 第 1-4 小节：开篇标志性流动性三连音上行琶音与柔和下行级进
  // Bar 1: A major 7 / E bass 色彩（A3-C#4-E4-A4-C#5-E5）
  push("E2", cursor, 2.4, 0.34);
  cursor = pushTripletArp(["A3", "C#4", "E4", "A4", "C#5", "E5"], cursor, 0.44, 1.9);

  // Bar 2: G#m / E（G#3-B3-E4-G#4-B4-E5）
  push("E2", cursor, 2.4, 0.32);
  cursor = pushTripletArp(["G#3", "B3", "E4", "G#4", "B4", "E5"], cursor, 0.42, 1.9);

  // Bar 3: F#m7 / B（F#3-A3-D#4-F#4-A4-D#5）
  push("B2", cursor, 2.3, 0.33);
  cursor = pushTripletArp(["F#3", "A3", "D#4", "F#4", "A4", "D#5"], cursor, 0.42, 1.85);

  // Bar 4: 温柔回落下行级进
  push("E2", cursor, 2.5, 0.35);
  cursor = pushTripletArp(["E3", "G#3", "B3", "E4", "G#4", "B4"], cursor, 0.4, 1.9);

  // 第 5-6 小节：右手指尖波浪式下行与回旋
  push("E3", cursor, 2.2, 0.3);
  cursor = pushTripletArp(["C#5", "B4", "A4", "G#4", "F#4", "E4"], cursor, 0.46, 1.6);
  push("B2", cursor, 2.2, 0.32);
  cursor = pushTripletArp(["D#4", "E4", "F#4", "G#4", "A4", "B4"], cursor, 0.41, 1.7);

  // 第 7-10 小节：抒情主旋律（右手歌唱性长音 + 左手三连音流水伴奏）
  const phrases: ReadonlyArray<{
    readonly bass: string;
    readonly lh: readonly [string, string, string, string, string, string];
    readonly melody: ReadonlyArray<{
      readonly note: string;
      readonly offset: number;
      readonly dur: number;
      readonly vel: number;
    }>;
  }> = [
    {
      bass: "E2",
      lh: ["B2", "E3", "G#3", "B3", "G#3", "E3"],
      melody: [
        { note: "C#5", offset: 0, dur: 1.1, vel: 0.56 },
        { note: "B4", offset: step3 * 3, dur: 0.9, vel: 0.48 },
      ],
    },
    {
      bass: "C#3",
      lh: ["G#3", "C#4", "E4", "G#4", "E4", "C#4"],
      melody: [
        { note: "A4", offset: 0, dur: 0.85, vel: 0.52 },
        { note: "G#4", offset: step3 * 2, dur: 0.85, vel: 0.48 },
        { note: "F#4", offset: step3 * 4, dur: 0.95, vel: 0.46 },
      ],
    },
    {
      bass: "A2",
      lh: ["E3", "A3", "C#4", "E4", "C#4", "A3"],
      melody: [
        { note: "G#4", offset: 0, dur: 1.0, vel: 0.52 },
        { note: "A4", offset: step3 * 3, dur: 0.9, vel: 0.5 },
      ],
    },
    {
      bass: "B2",
      lh: ["F#3", "B3", "D#4", "F#4", "D#4", "B3"],
      melody: [
        { note: "B4", offset: 0, dur: 1.4, vel: 0.54 },
        { note: "G#4", offset: step3 * 4, dur: 0.8, vel: 0.44 },
      ],
    },
    {
      bass: "E2",
      lh: ["B2", "E3", "G#3", "B3", "E4", "G#4"],
      melody: [
        { note: "E5", offset: 0, dur: 1.2, vel: 0.58 },
        { note: "D#5", offset: step3 * 3, dur: 0.9, vel: 0.5 },
      ],
    },
    {
      bass: "C#3",
      lh: ["G#3", "C#4", "E4", "G#4", "E4", "C#4"],
      melody: [
        { note: "C#5", offset: 0, dur: 1.0, vel: 0.54 },
        { note: "B4", offset: step3 * 2, dur: 0.8, vel: 0.48 },
        { note: "A4", offset: step3 * 4, dur: 0.95, vel: 0.46 },
      ],
    },
    {
      bass: "F#2",
      lh: ["C#3", "F#3", "A3", "C#4", "A3", "F#3"],
      melody: [
        { note: "G#4", offset: 0, dur: 0.95, vel: 0.5 },
        { note: "F#4", offset: step3 * 3, dur: 1.05, vel: 0.45 },
      ],
    },
    {
      bass: "B2",
      lh: ["F#3", "B3", "D#4", "B3", "F#3", "B3"],
      melody: [{ note: "E4", offset: 0, dur: 1.8, vel: 0.48 }],
    },
  ];

  for (const bar of phrases) {
    push(bar.bass, cursor, 2.2, 0.34);
    for (const m of bar.melody) {
      push(m.note, cursor + m.offset, m.dur, m.vel);
    }
    cursor = pushTripletArp(bar.lh, cursor, 0.36, 1.5);
  }

  // 第 15-16 小节：水彩尾奏渐缓呼吸感，自然衔回开篇
  push("E2", cursor, 2.8, 0.32);
  cursor = pushTripletArp(["B2", "E3", "G#3", "B3", "E4", "G#4"], cursor, 0.35, 2.2);
  push("E5", cursor, 2.4, 0.42);
  cursor += 1.4;

  notes.sort((a, b) => a.time - b.time);
  return { notes, duration: cursor };
}

export const ARABESQUE_SCORE = buildArabesqueScore();

export interface DebussyPianoOptions {
  readonly masterGain?: number;
  readonly muted?: boolean;
}

export class DebussyPiano {
  private readonly masterGainValue: number;
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted: boolean;
  private disposed = false;
  private playing = false;

  private loopOffset = 0;
  private nextIndex = 0;
  private lastScheduledTime = 0;

  constructor(options: DebussyPianoOptions = {}) {
    this.masterGainValue = options.masterGain ?? 0.22;
    this.muted = options.muted ?? false;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  get isPlaying(): boolean {
    return this.playing && !this.muted && this.context?.state === "running";
  }

  /** 首次用户交互时调用：安全创建/恢复 AudioContext 并开启排程。 */
  unlock(): void {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      if (!this.playing) {
        this.playing = true;
        this.loopOffset = ctx.currentTime + 0.05;
        this.nextIndex = 0;
        this.lastScheduledTime = ctx.currentTime;
      }
    } catch {
      // 静默忽略浏览器自动播放策略受限
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.context) {
      const target = muted ? 0.0001 : this.masterGainValue;
      this.masterGain.gain.setTargetAtTime(target, this.context.currentTime, 0.06);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** 每帧调用：前瞻 0.28s 排程钢琴音符，保证节奏如流水般平滑无卡顿。 */
  update(): void {
    if (this.disposed || !this.playing || this.muted) return;
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;

    const now = ctx.currentTime;
    // 页面切出恢复后避免一次性补发积压音符
    if (now - this.lastScheduledTime > 0.6) {
      this.loopOffset = now - (this.loopElapsed(now) % ARABESQUE_SCORE.duration);
    }
    this.lastScheduledTime = now;

    const horizon = now + 0.28;
    const score = ARABESQUE_SCORE;
    while (true) {
      const note = score.notes[this.nextIndex];
      if (!note) break;
      const playAt = this.loopOffset + note.time;
      if (playAt > horizon) break;
      if (playAt >= now - 0.04) {
        this.triggerPianoVoice(ctx, Math.max(now, playAt), note);
      }
      this.nextIndex += 1;
      if (this.nextIndex >= score.notes.length) {
        this.nextIndex = 0;
        this.loopOffset += score.duration;
      }
    }
  }

  /** 樱花树绽放时的柔美 E 大调竖琴/钢琴琶音点缀。 */
  playBloomChord(): void {
    if (this.disposed || this.muted) return;
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    const chord = ["E4", "G#4", "B4", "E5", "G#5"];
    const base = ctx.currentTime + 0.02;
    chord.forEach((n, i) => {
      this.triggerPianoVoice(ctx, base + i * 0.09, {
        time: 0,
        midi: noteToMidi(n),
        duration: 2.6,
        velocity: 0.42,
      });
    });
  }

  reset(): void {
    if (!this.context) return;
    this.loopOffset = this.context.currentTime + 0.08;
    this.nextIndex = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playing = false;
    try {
      void this.context?.close().catch(() => undefined);
    } catch {
      // ignore
    }
    this.context = null;
    this.masterGain = null;
  }

  private loopElapsed(now: number): number {
    return Math.max(0, now - this.loopOffset);
  }

  private ensureContext(): AudioContext | null {
    if (this.context || this.disposed || typeof window === "undefined") return this.context;
    try {
      const w = window as typeof window & { readonly webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0.0001 : this.masterGainValue;

      // 柔和沙龙立体声延迟混响总线
      const delayL = ctx.createDelay(1.0);
      delayL.delayTime.value = 0.19;
      const delayR = ctx.createDelay(1.0);
      delayR.delayTime.value = 0.29;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 1550;

      master.connect(ctx.destination);
      master.connect(delayL);
      delayL.connect(damp);
      damp.connect(delayR);
      delayR.connect(feedback);
      feedback.connect(delayL);
      damp.connect(ctx.destination);

      this.context = ctx;
      this.masterGain = master;
    } catch {
      this.context = null;
      this.masterGain = null;
    }
    return this.context;
  }

  private triggerPianoVoice(ctx: AudioContext, startTime: number, note: PianoNoteEvent): void {
    if (!this.masterGain) return;
    const freq = midiToHz(note.midi);
    const vel = Math.min(1, Math.max(0.05, note.velocity));

    // 柔音毡槌钢琴音色：基频正弦 + 暖二倍泛音三角波
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, startTime);

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2, startTime);

    const osc2Gain = ctx.createGain();
    osc2Gain.gain.setValueAtTime(0.18 * vel, startTime);
    osc2Gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration * 0.45);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(3200, freq * 5.2), startTime);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(420, freq * 1.4),
      startTime + note.duration,
    );

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(0.45 * vel, startTime + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + note.duration);

    osc1.connect(filter);
    osc2.connect(osc2Gain).connect(filter);
    filter.connect(env).connect(this.masterGain);

    const stopTime = startTime + note.duration + 0.04;
    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    osc1.onended = () => {
      osc1.disconnect();
      osc2.disconnect();
      osc2Gain.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }
}
