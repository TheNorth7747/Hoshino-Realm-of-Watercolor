import { describe, expect, it } from "vitest";
import {
  applyDprCap,
  clampDelta,
  MAX_DELTA_SECONDS,
  parseDebugFlag,
  readEngineSettings,
} from "../../src/core/config";
import { SYSTEM_PHASES, systemPhaseIndex } from "../../src/core/contracts";

describe("parseDebugFlag", () => {
  it("识别 ?debug=1 与 ?debug=true", () => {
    expect(parseDebugFlag("?debug=1")).toBe(true);
    expect(parseDebugFlag("?debug=true")).toBe(true);
    expect(parseDebugFlag("debug=TRUE")).toBe(true);
    expect(parseDebugFlag("?foo=bar&debug=1")).toBe(true);
  });

  it("其余取值一律视为关闭", () => {
    expect(parseDebugFlag("")).toBe(false);
    expect(parseDebugFlag("?debug=0")).toBe(false);
    expect(parseDebugFlag("?debug=")).toBe(false);
    expect(parseDebugFlag("?debug=yes")).toBe(false);
    expect(parseDebugFlag("?debugger=1")).toBe(false);
  });
});

describe("clampDelta", () => {
  it("正常帧长原样返回", () => {
    expect(clampDelta(0.016)).toBeCloseTo(0.016, 5);
  });

  it("超长帧被截断到 0.05s，避免切回页面瞬移", () => {
    expect(clampDelta(1.5)).toBe(MAX_DELTA_SECONDS);
  });

  it("负数、0、NaN、Infinity 归零", () => {
    expect(clampDelta(-1)).toBe(0);
    expect(clampDelta(0)).toBe(0);
    expect(clampDelta(Number.NaN)).toBe(0);
    expect(clampDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("applyDprCap", () => {
  it("DPR 上限 1.5", () => {
    expect(applyDprCap(3)).toBe(1.5);
    expect(applyDprCap(1.25)).toBe(1.25);
    expect(applyDprCap(1)).toBe(1);
  });

  it("非法或过小的 DPR 收敛到 1", () => {
    expect(applyDprCap(0)).toBe(1);
    expect(applyDprCap(-2)).toBe(1);
    expect(applyDprCap(Number.NaN)).toBe(1);
  });
});

describe("readEngineSettings", () => {
  it("默认值与 PRD 预算一致", () => {
    const settings = readEngineSettings("");
    expect(settings.maxDeltaSeconds).toBe(0.05);
    expect(settings.dprCap).toBe(1.5);
    expect(settings.maskResolution).toBe(512);
    expect(settings.debugEnabled).toBe(false);
  });

  it("?debug=1 打开调试", () => {
    expect(readEngineSettings("?debug=1").debugEnabled).toBe(true);
  });
});

describe("SYSTEM_PHASES", () => {
  it("顺序与 PRD 7.3 的每帧更新顺序一致", () => {
    expect([...SYSTEM_PHASES]).toEqual([
      "input",
      "player",
      "companion",
      "story",
      "reveal",
      "effects",
      "camera",
    ]);
  });

  it("阶段索引单调递增，未知阶段返回 -1", () => {
    expect(systemPhaseIndex("input")).toBe(0);
    expect(systemPhaseIndex("camera")).toBe(SYSTEM_PHASES.length - 1);
    expect(systemPhaseIndex("input")).toBeLessThan(systemPhaseIndex("reveal"));
    expect(systemPhaseIndex("nope" as never)).toBe(-1);
  });
});
