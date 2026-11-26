/**
 * A3 / V0.3 世界材质种类与水彩模式配置。
 */
import { DoubleSide, FrontSide, type ColorRepresentation, type Side } from "three";
import type { RevealUniforms, WatercolorMode } from "../rendering/WatercolorMaterial";

/** 世界可染色材质的种类（与世界网格一一对应）。 */
export type WorldMaterialKind =
  | "terrain"
  | "grass"
  | "flower"
  | "flowerRed"
  | "flowerMagenta"
  | "flowerYellow"
  | "path"
  | "water"
  | "treeTrunk"
  | "treeTrunkWhite"
  | "treeCanopy"
  | "treeCanopyGreen"
  | "treeWillow"
  | "bushYellow"
  | "moss"
  | "mushroomCap"
  | "rock"
  | "mountain"
  | "mountainMid"
  | "mountainFar";

export const WORLD_MATERIAL_KINDS: readonly WorldMaterialKind[] = [
  "terrain",
  "grass",
  "flower",
  "flowerRed",
  "flowerMagenta",
  "flowerYellow",
  "path",
  "water",
  "treeTrunk",
  "treeTrunkWhite",
  "treeCanopy",
  "treeCanopyGreen",
  "treeWillow",
  "bushYellow",
  "moss",
  "mushroomCap",
  "rock",
  "mountain",
  "mountainMid",
  "mountainFar",
];

/** 单个种类的外观与 V0.3 水彩着色参数；注入水彩材质时按此配置重建。 */
export interface WorldMaterialAppearance {
  readonly color: ColorRepresentation;
  readonly roughness?: number;
  readonly flatShading?: boolean;
  readonly transparent?: boolean;
  readonly opacity?: number;
  readonly side?: Side;
  readonly mode?: WatercolorMode;
  readonly windStrength?: number;
  readonly topColor?: ColorRepresentation;
  readonly bottomColor?: ColorRepresentation;
  readonly alphaCutoff?: number;
  readonly brushKey?: "foliage" | "water" | "birch";
}

export const WORLD_MATERIAL_APPEARANCE: Readonly<
  Record<WorldMaterialKind, WorldMaterialAppearance>
> = Object.freeze({
  terrain: { color: 0x91ba6e, roughness: 0.96, mode: "standard" },
  grass: {
    color: 0x89ba61,
    roughness: 0.94,
    side: DoubleSide,
    mode: "grass",
    windStrength: 0.16,
    topColor: 0xb6d668,
    bottomColor: 0x7aa857,
  },
  flower: {
    color: 0x5677d8,
    roughness: 0.85,
    side: DoubleSide,
    mode: "standard",
    windStrength: 0.08,
  },
  flowerRed: {
    color: 0xd63b2c,
    roughness: 0.82,
    side: DoubleSide,
    mode: "standard",
    windStrength: 0.09,
  },
  flowerMagenta: {
    color: 0xb83d82,
    roughness: 0.84,
    side: DoubleSide,
    mode: "standard",
    windStrength: 0.08,
  },
  flowerYellow: {
    color: 0xe7bd3d,
    roughness: 0.84,
    side: DoubleSide,
    mode: "standard",
    windStrength: 0.08,
  },
  path: { color: 0xd8c293, roughness: 0.97, mode: "standard" },
  water: {
    color: 0x6f9ec9,
    roughness: 0.35,
    transparent: true,
    opacity: 0.86,
    side: FrontSide,
    mode: "water",
    brushKey: "water",
  },
  treeTrunk: { color: 0x5c4237, roughness: 0.93, mode: "standard" },
  treeTrunkWhite: {
    color: 0xf1ece2,
    roughness: 0.91,
    mode: "standard",
    brushKey: "birch",
  },
  treeCanopy: {
    color: 0xffffff,
    roughness: 0.88,
    side: DoubleSide,
    mode: "foliage",
    brushKey: "foliage",
    windStrength: 0.05,
    topColor: 0xf6c2d3,
    bottomColor: 0xa14162,
    alphaCutoff: 0.22,
  },
  treeCanopyGreen: {
    color: 0xffffff,
    roughness: 0.9,
    side: DoubleSide,
    mode: "foliage",
    brushKey: "foliage",
    windStrength: 0.06,
    topColor: 0xc4de66,
    bottomColor: 0x588f46,
    alphaCutoff: 0.22,
  },
  treeWillow: {
    color: 0xffffff,
    roughness: 0.9,
    side: DoubleSide,
    mode: "willow",
    brushKey: "foliage",
    windStrength: 0.16,
    topColor: 0xb5d664,
    bottomColor: 0x6fa14a,
    alphaCutoff: 0.2,
  },
  bushYellow: {
    color: 0xcbe068,
    roughness: 0.88,
    side: DoubleSide,
    mode: "foliage",
    brushKey: "foliage",
    windStrength: 0.04,
    topColor: 0xe8e06c,
    bottomColor: 0x86ad4c,
    alphaCutoff: 0.24,
  },
  moss: { color: 0x6b9448, roughness: 0.95, mode: "standard" },
  mushroomCap: { color: 0xc93b2e, roughness: 0.82, mode: "standard" },
  rock: { color: 0xbcb8ae, roughness: 0.92, mode: "standard" },
  mountain: { color: 0x86b37d, roughness: 0.96, side: DoubleSide, mode: "mountain" },
  mountainMid: { color: 0x84a9a4, roughness: 0.96, side: DoubleSide, mode: "mountain" },
  mountainFar: { color: 0x9fa7c5, roughness: 0.96, side: DoubleSide, mode: "mountain" },
});

/** A1 uniforms 提供者：返回 null 表示染色尚未就绪（世界保持普通材质）。 */
export type RevealUniformsProvider = () => RevealUniforms | null;
