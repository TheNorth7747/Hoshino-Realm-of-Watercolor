/**
 * A3 世界材质种类与注入接口（PRD 12.2 A3「可染色材质通过接口注入」）。
 *
 * 约定：
 * - 本模块**不创建水彩材质**，只描述“世界需要哪些材质、默认外观是什么”。
 * - 世界系统先以默认（普通 MeshStandardMaterial）构建场景——A3 在染色未接入时
 *   也能独立运行（PRD：未接入前使用普通占位材质）。
 * - 注入路径：集成者把 A1 的 `reveal.revealUniforms` 以 provider 形式交给
 *   WorldSystem；世界系统在首帧把每个种类的材质替换为
 *   `rendering.createWatercolorMaterial({ uniforms, ...同款外观 })`。
 *   地形/草/花/水/树由此共享 A1 的同一份 uniforms（AC-05）。
 */
import type { ColorRepresentation } from "three";
import type { RevealUniforms } from "../rendering/WatercolorMaterial";

/** 世界可染色材质的种类（与世界网格一一对应）。 */
export type WorldMaterialKind =
  | "terrain"
  | "grass"
  | "flower"
  | "flowerRed"
  | "flowerYellow"
  | "path"
  | "water"
  | "treeTrunk"
  | "treeTrunkWhite"
  | "treeCanopy"
  | "treeCanopyGreen"
  | "treeWillow"
  | "rock"
  | "mountain";

export const WORLD_MATERIAL_KINDS: readonly WorldMaterialKind[] = [
  "terrain",
  "grass",
  "flower",
  "flowerRed",
  "flowerYellow",
  "path",
  "water",
  "treeTrunk",
  "treeTrunkWhite",
  "treeCanopy",
  "treeCanopyGreen",
  "treeWillow",
  "rock",
  "mountain",
];

/** 单个种类的默认外观；注入水彩材质时按同款外观重建。 */
export interface WorldMaterialAppearance {
  readonly color: ColorRepresentation;
  readonly roughness?: number;
  readonly flatShading?: boolean;
  /** 透水/半透明（仅水面使用）。 */
  readonly transparent?: boolean;
  readonly opacity?: number;
}

export const WORLD_MATERIAL_APPEARANCE: Readonly<
  Record<WorldMaterialKind, WorldMaterialAppearance>
> = Object.freeze({
  // 已显色后的目标色（未显色外观由 A1 shader 的纸色+排线决定）。
  terrain: { color: 0x9ec98a, roughness: 0.96 },
  grass: { color: 0x86b873, roughness: 0.95, flatShading: true },
  flower: { color: 0x6f8fd6, roughness: 0.8, flatShading: true },
  flowerRed: { color: 0xc84a36, roughness: 0.8, flatShading: true },
  flowerYellow: { color: 0xdcb944, roughness: 0.8, flatShading: true },
  path: { color: 0xc7ad72, roughness: 0.97 },
  water: { color: 0x7fa8c9, roughness: 0.35, transparent: true, opacity: 0.55 },
  treeTrunk: { color: 0x8a6f5c, roughness: 0.92, flatShading: true },
  treeTrunkWhite: { color: 0xe6e3da, roughness: 0.9, flatShading: true },
  treeCanopy: { color: 0xe8a7bd, roughness: 0.85, flatShading: true },
  treeCanopyGreen: { color: 0x7fa25a, roughness: 0.9, flatShading: true },
  treeWillow: { color: 0x9cb86a, roughness: 0.9, flatShading: true },
  rock: { color: 0x8d8f95, roughness: 0.9, flatShading: true },
  mountain: { color: 0xa9b8c6, roughness: 0.95, flatShading: true },
});

/**
 * A1 uniforms 提供者：返回 null 表示染色尚未就绪（世界保持普通材质）。
 * 集成者传入 `() => reveal.revealUniforms`；RevealSystem 在 init 时创建 uniforms，
 * 因此世界系统的首帧 update 一定能拿到非空值。
 */
export type RevealUniformsProvider = () => RevealUniforms | null;
