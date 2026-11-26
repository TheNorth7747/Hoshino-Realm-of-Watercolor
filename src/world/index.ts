/**
 * A3 / V0.3 世界模块出口。
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
export { buildMountainGroup } from "./Mountains";
export { buildPropsGroup, type PropsBuildResult } from "./Props";
export {
  buildVegetationGroup,
  isInStreamWaterZone,
  GRASS_INSTANCE_COUNT,
  FLOWER_INSTANCE_COUNT,
  GRASS_CHUNK_GRID,
  GRASS_LOD_DISTANCE,
  type GrassLodChunk,
  type VegetationBuild,
} from "./Vegetation";
export { buildPathGroup, distanceToPath, pathSurfaceHeight, PATH_WIDTH, PATH_LIFT } from "./Path";
export { buildOrdinaryTreeGroup, ORDINARY_TREE_COUNT, TREE_TYPE_COUNTS } from "./Trees";
export {
  buildLandmarkGroup,
  TREE_TRUNK_COLLIDER_RADIUS,
  type LandmarkBuildResult,
} from "./Landmarks";
export { mulberry32, uniformRange, gaussianApprox, type SeededRandom } from "./scatter";
export {
  WorldSystem,
  createWorldSystem,
  type WorldSystemOptions,
  type BrushPackProvider,
} from "./World";
