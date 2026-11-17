/**
 * A3 世界模块出口。
 *
 * 集成者（Agent 1）接线示例（main.ts，独占文件）：
 *
 *   import { createWorldSystem } from "./world";
 *   import { createPlayerSystems } from "./player";
 *   import { RevealSystem } from "./rendering";
 *
 *   function createSystems(): GameSystem[] {
 *     const { player, camera } = createPlayerSystems();
 *     const reveal = new RevealSystem({ playerSource: player, enableBench: false });
 *     const world = createWorldSystem({ revealUniformsProvider: () => reveal.revealUniforms });
 *     player.addColliders(world.getColliders());
 *     return [player, reveal, world, camera];
 *   }
 *
 * 并在 config/world.ts 把平坦占位替换为：
 *   export { sampleTerrainHeight } from "../world/terrainHeight";
 * （本模块的 terrainHeight 用函数声明导出，循环引用安全；签名与契约一致。）
 */
export { sampleTerrainHeight, steppingStonePositions, STREAM_WATER_LEVEL } from "./terrainHeight";
export type { StonePosition } from "./terrainHeight";
export {
  WORLD_MATERIAL_KINDS,
  WORLD_MATERIAL_APPEARANCE,
  type WorldMaterialKind,
  type WorldMaterialAppearance,
  type RevealUniformsProvider,
} from "./worldMaterials";
export {
  buildTerrainGroup,
  geometryTriangleCount,
  type MaterialAccessor,
  type WorldMeshBuild,
} from "./Terrain";
export {
  buildVegetationGroup,
  isInStreamWaterZone,
  GRASS_INSTANCE_COUNT,
  FLOWER_INSTANCE_COUNT,
} from "./Vegetation";
export {
  buildLandmarkGroup,
  TREE_TRUNK_COLLIDER_RADIUS,
  type LandmarkBuildResult,
} from "./Landmarks";
export { mulberry32, uniformRange, gaussianApprox, type SeededRandom } from "./scatter";
export { WorldSystem, createWorldSystem, type WorldSystemOptions } from "./World";
