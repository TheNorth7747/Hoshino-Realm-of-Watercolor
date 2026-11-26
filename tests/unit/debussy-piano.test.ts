import { describe, expect, it } from "vitest";
import {
  ARABESQUE_SCORE,
  DebussyPiano,
  midiToHz,
  noteToMidi,
} from "../../src/effects/DebussyPiano";
import { AudioSystem } from "../../src/effects/AudioSystem";
import { createFakeGameContext } from "./helpers/fake-game-context";

describe("V0.3 德彪西 L.66 第一号阿拉伯风格曲 Web Audio 钢琴", () => {
  it("音高与频率换算精确（A4 = 440Hz, E4 ≈ 329.63Hz）", () => {
    expect(noteToMidi("A4")).toBe(69);
    expect(midiToHz(69)).toBeCloseTo(440, 4);
    expect(noteToMidi("E4")).toBe(64);
    expect(midiToHz(64)).toBeCloseTo(329.6276, 3);
    expect(noteToMidi("C#5")).toBe(73);
  });

  it("乐谱数据合法且时长 > 20s，所有音符频率有限", () => {
    expect(ARABESQUE_SCORE.notes.length).toBeGreaterThan(80);
    expect(ARABESQUE_SCORE.duration).toBeGreaterThan(20);
    for (const n of ARABESQUE_SCORE.notes) {
      expect(Number.isFinite(n.time)).toBe(true);
      expect(n.time).toBeGreaterThanOrEqual(0);
      expect(n.duration).toBeGreaterThan(0);
      expect(n.velocity).toBeGreaterThan(0);
      expect(n.velocity).toBeLessThanOrEqual(1);
      expect(midiToHz(n.midi)).toBeGreaterThan(20);
    }
  });

  it("无头环境下静默降级、支持静音切换/重置与释放", () => {
    const piano = new DebussyPiano();
    expect(piano.isMuted).toBe(false);
    expect(() => piano.unlock()).not.toThrow();
    expect(() => piano.update()).not.toThrow();
    expect(piano.toggleMute()).toBe(true);
    expect(piano.isMuted).toBe(true);
    expect(() => piano.playBloomChord()).not.toThrow();
    expect(() => piano.reset()).not.toThrow();
    expect(() => piano.dispose()).not.toThrow();
  });

  it("AudioSystem 挂载与重置不抛错", () => {
    const context = createFakeGameContext();
    const audio = new AudioSystem();
    audio.init(context);
    audio.update();
    expect(audio.toggleMute()).toBe(true);
    context.events.emit("story:completed", { nodeId: "tree" });
    context.events.emit("game:reset");
    audio.dispose();
  });
});
