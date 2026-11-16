/**
 * A3 场景散布工具：确定性伪随机（mulberry32）。
 *
 * 所有散布（草、花、远山、岩石）必须可复现——同一构建参数得到同一场景，
 * 单元测试与集成截图才稳定（PRD 11.3 自动测试最低集）。
 */

export type SeededRandom = () => number;

/** mulberry32：32 位种子 → [0, 1) 均匀分布。 */
export function mulberry32(seed: number): SeededRandom {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max) 均匀取值。 */
export function uniformRange(random: SeededRandom, min: number, max: number): number {
  return min + (max - min) * random();
}

/** 近似高斯（3 次均匀和 - 1.5），均值 0、σ≈1，用于花丛聚拢。 */
export function gaussianApprox(random: SeededRandom, sigma: number): number {
  return ((random() + random() + random()) / 1.5 - 1) * sigma;
}
