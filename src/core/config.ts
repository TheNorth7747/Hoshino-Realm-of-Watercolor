/**
 * 引擎常量与运行时设置（A0 独占）。
 * 数值来自 PRD 7.3 / 9.1 / 11.1，改动前先改 PRD 再改这里。
 */
import type { EngineSettings } from "./contracts";

export const APP_NAME = "Hoshino: Realm of Watercolor";
export const APP_VERSION = "0.1.0-rc.1";

/** 单帧 delta 上限（PRD 7.3：0.05s）。 */
export const MAX_DELTA_SECONDS = 0.05;

/** 渲染 DPR 上限（PRD 11.1：1.5）。 */
export const DPR_CAP = 1.5;

/** 染色遮罩分辨率（PRD 9.1 / 11.1：512²，未经性能评估不得提升）。 */
export const MASK_RESOLUTION = 512;

/** 遮罩更新频率上限（PRD 9.1：24～30Hz）。 */
export const MASK_UPDATE_HZ = 30;

/** 玩家笔刷半径建议区间（PRD 9.1：1.4～1.8m），A1 使用。 */
export const PLAYER_BRUSH_RADIUS_MIN = 1.4;
export const PLAYER_BRUSH_RADIUS_MAX = 1.8;

/** 纸张底色：空场景的 clear color，A1 的水彩 Pass 会在此基础上叠加质感。 */
export const PAPER_CLEAR_COLOR = 0xf2ede4;

/** 默认摄像机参数，A2 会用 CameraRig 覆盖。 */
export const CAMERA_FOV = 50;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 500;

/**
 * 解析 `?debug=1`。只认 `1` 与 `true`，避免 `?debug=0` 被误判为开启。
 */
export function parseDebugFlag(search: string): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const value = params.get("debug");
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

/** 读取运行时引擎设置；默认读取浏览器地址栏。 */
export function readEngineSettings(search?: string): EngineSettings {
  const query = search ?? (typeof window === "undefined" ? "" : window.location.search);

  return {
    appName: APP_NAME,
    maxDeltaSeconds: MAX_DELTA_SECONDS,
    dprCap: DPR_CAP,
    maskResolution: MASK_RESOLUTION,
    clearColor: PAPER_CLEAR_COLOR,
    debugEnabled: parseDebugFlag(query),
  };
}

/**
 * 截断单帧 delta。负数、NaN、Infinity 一律归零，避免污染位置积分。
 */
export function clampDelta(seconds: number, maxSeconds: number = MAX_DELTA_SECONDS): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, maxSeconds);
}

/** DPR 收敛到 [1, cap] 区间。 */
export function applyDprCap(devicePixelRatio: number, cap: number = DPR_CAP): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.min(Math.max(devicePixelRatio, 1), cap);
}
