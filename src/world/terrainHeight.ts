/**
 * A3 真实地形高度采样（PRD 9.4「缓起伏地形」/ 5.3 坐标基线）。
 *
 * 规则：
 * - 签名与 config/world.ts 的 `TerrainHeightSampler` 完全一致；1 单位 = 1 米，Y 向上。
 * - 所有地标坐标从 config/world.ts 读取，本文件不复制另一套数字。
 * - 界外也返回有限数值：镜头跟随点在玩家身后最多 14m，XZ 会越出 WORLD_BOUNDS，
 *   采样器必须对任意 (x, z) 给出确定值（A2 的镜头避让依赖这一点）。
 * - 接线方式：由集成者把 config/world.ts 的平坦占位替换为 re-export 本函数
 *   （`export { sampleTerrainHeight } from "../world/terrainHeight"`），玩家贴地、
 *   镜头避让、出生点高度自动跟随真实地形。本文件用函数声明导出，循环引用安全。
 *
 * 地形构成（全部平缓，最大坡度约 10°~19°，可自由步行）：
 *   1. 大尺度缓起伏基底（波长 ~190m，振幅小）
 *   2. 蓝花坡隆起（以 flower 地标为中心的高斯丘）
 *   3. 瞭望点缓台（结局回望的高地）
 *   4. 溪流：|z-8|<9m 内混合到固定断面的下切河槽（两岸高度一致，水面永不悬空）
 *   5. 踏石凸起（河槽内可以踩着过的干石）
 */
import { LANDMARKS, STREAM } from "../config/world";

/** 水面高度：低于两岸 (+0.12)、高于河槽底部 (-0.5)，落水即浅滩，可直接蹚过（PRD 5.3 无软锁）。 */
export const STREAM_WATER_LEVEL = -0.15;

/** 河槽两岸的统一高度（混合区内），保证全 X 跨度上水面都在地形之下。 */
const STREAM_BANK_TOP = 0.12;
/** 河槽下切深度（相对岸顶）。 */
const STREAM_BED_DEPTH = 0.62;
/** 河槽断面高斯 σ：水面宽 4m，岸线（地形与水面相交处）约在中心两侧 ±1.8m。 */
const STREAM_BED_SIGMA = 1.4;
/** 河槽混合区：距中心线 9m 处完全混回基底地形。 */
const STREAM_BLEND_RANGE = 9;
/** 踏石凸起参数：顶面约 -0.5+0.55 ≈ +0.05，高于水面；σ 收窄让石与石保持独立（中心留出蹚水口）。 */
const STEPPING_STONE_HEIGHT = 0.55;
const STEPPING_STONE_SIGMA = 0.8;
/** 蓝花坡隆起。 */
const FLOWER_MOUND_HEIGHT = 1.3;
const FLOWER_MOUND_SIGMA = 8;
/** 瞭望点缓台。 */
const LOOKOUT_RISE_HEIGHT = 1.1;
const LOOKOUT_RISE_SIGMA = 11;

export interface StonePosition {
  readonly x: number;
  readonly z: number;
}

/**
 * 踏石位置：由 config/world.ts 的数量与间距推导，沿 X 轴对称跨在主路线（x=0）上。
 * count=4、spacing=3 → x = [-4.5, -1.5, 1.5, 4.5]，z = 溪流中心线。
 */
export function steppingStonePositions(): readonly StonePosition[] {
  const stones: StonePosition[] = [];
  const offset = ((STREAM.steppingStoneCount - 1) / 2) * STREAM.steppingStoneSpacing;
  for (let i = 0; i < STREAM.steppingStoneCount; i += 1) {
    stones.push({
      x: -offset + i * STREAM.steppingStoneSpacing,
      z: STREAM.centerZ,
    });
  }
  return stones;
}

/** 高斯隆起：中心 amplitude，向四周按 σ 平滑衰减。 */
function gaussianBump(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  sigma: number,
  amplitude: number,
): number {
  const dx = x - centerX;
  const dz = z - centerZ;
  return amplitude * Math.exp(-(dx * dx + dz * dz) / (2 * sigma * sigma));
}

/** 0→1→0 的平滑混合：d ≤ inner 完全生效，d ≥ outer 完全不生效。 */
function smoothInner(d: number, inner: number, outer: number): number {
  const t = Math.min(1, Math.max(0, (outer - d) / (outer - inner)));
  return t * t * (3 - 2 * t);
}

/** 溪流固定断面：两岸 bankTop，中心下切 bedDepth。 */
function streamChannelProfile(z: number): number {
  const d = z - STREAM.centerZ;
  return STREAM_BANK_TOP - STREAM_BED_DEPTH * Math.exp(-(d * d) / (2 * STREAM_BED_SIGMA * STREAM_BED_SIGMA));
}

/**
 * 真实地形高度（米）。任意 (x, z)（含界外）都返回有限数值。
 * 用函数声明导出：config/world.ts re-export 本函数时形成循环引用，
 * 函数提升保证两个方向的模块求值都安全。
 */
export function sampleTerrainHeight(x: number, z: number): number {
  // 1) 大尺度缓起伏基底。
  let h = 0.22 * Math.sin(x / 29 + 0.8) * Math.cos(z / 31) + 0.15 * Math.sin(z / 41 + 0.5);

  // 2) 蓝花坡隆起（中心 = flower 地标）。
  h += gaussianBump(x, z, LANDMARKS.flower.x, LANDMARKS.flower.z, FLOWER_MOUND_SIGMA, FLOWER_MOUND_HEIGHT);

  // 3) 瞭望点缓台（结局回望高地，中心 = lookout 地标）。
  h += gaussianBump(x, z, LANDMARKS.lookout.x, LANDMARKS.lookout.z, LOOKOUT_RISE_SIGMA, LOOKOUT_RISE_HEIGHT);

  // 4) 溪流：靠近中心线时混入固定断面（两岸齐平，水面不悬空），远离时混回基底。
  const blend = smoothInner(Math.abs(z - STREAM.centerZ), 5, STREAM_BLEND_RANGE);
  if (blend > 0) {
    h = h * (1 - blend) + streamChannelProfile(z) * blend;
  }

  // 5) 踏石凸起（叠加在河槽断面上）。
  for (const stone of steppingStonePositions()) {
    const dx = x - stone.x;
    const dz = z - stone.z;
    h += STEPPING_STONE_HEIGHT * Math.exp(-(dx * dx + dz * dz) / (2 * STEPPING_STONE_SIGMA * STEPPING_STONE_SIGMA));
  }

  return h;
}
