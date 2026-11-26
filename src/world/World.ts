/**
 * 世界系统（A3 / V0.3 视觉重构）。
 *
 * - init：先用默认普通材质构建地形/远山/植被/地标/小径/普通树/叙事小景，确保无染色也能运行。
 * - update：首帧获取 `revealUniformsProvider` 与可选 `brushPackProvider`，
 *   将全部分类的材质替换为共用同一 `RevealUniforms` 的 V0.3 水彩材质；每帧更新草块 LOD。
 */
import {
  MeshStandardMaterial,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Texture,
} from "three";
import type { DebugStatSource, GameContext, GameSystem, SystemPhase } from "../core/contracts";
import { disposeMaterial, disposeObject3D } from "../core/dispose";
import type { ProceduralBrushPack } from "../rendering/ProceduralBrushes";
import { createWatercolorMaterial, type RevealUniforms } from "../rendering/WatercolorMaterial";
import type { CollisionCircle } from "../player/collision";
import { buildTerrainGroup } from "./Terrain";
import { buildVegetationGroup, GRASS_LOD_DISTANCE, type GrassLodChunk } from "./Vegetation";
import { buildLandmarkGroup } from "./Landmarks";
import { buildPathGroup } from "./Path";
import { buildPropsGroup } from "./Props";
import { buildOrdinaryTreeGroup } from "./Trees";
import { STREAM_WATER_LEVEL } from "./terrainHeight";
import {
  WORLD_MATERIAL_APPEARANCE,
  WORLD_MATERIAL_KINDS,
  type RevealUniformsProvider,
  type WorldMaterialAppearance,
  type WorldMaterialKind,
} from "./worldMaterials";

export type BrushPackProvider = () => ProceduralBrushPack | null;

export interface WorldSystemOptions {
  /** A1 uniforms 提供者（注入染色材质）；缺省时世界保持普通材质。 */
  readonly revealUniformsProvider?: RevealUniformsProvider;
  /** V0.3 程序化水彩笔触贴图包提供者。 */
  readonly brushPackProvider?: BrushPackProvider;
}

export class WorldSystem implements GameSystem {
  readonly id = "world";
  readonly phase: SystemPhase = "reveal";

  private readonly revealUniformsProvider: RevealUniformsProvider | null;
  private readonly brushPackProvider: BrushPackProvider | null;
  private readonly materials = new Map<WorldMaterialKind, Material>();
  private readonly kindMeshes = new Map<WorldMaterialKind, Array<Mesh | InstancedMesh>>();
  private readonly topGroups: Array<Group> = [];

  private triangleCount = 0;
  private instanceCount = 0;
  private grassPlaced = 0;
  private flowerPlaced = 0;
  private grassLod: readonly GrassLodChunk[] = [];
  private colliders: readonly CollisionCircle[] = [];
  private materialsBound = false;
  private statSource: DebugStatSource | null = null;
  private readonly unsubscribeFns: Array<() => void> = [];

  constructor(options: WorldSystemOptions = {}) {
    this.revealUniformsProvider = options.revealUniformsProvider ?? null;
    this.brushPackProvider = options.brushPackProvider ?? null;
  }

  init(context: GameContext): void {
    const accessor = (kind: WorldMaterialKind): Material => this.materialFor(kind);

    const terrainBuild = buildTerrainGroup(accessor);
    const vegetationBuild = buildVegetationGroup(accessor);
    const landmarkBuild = buildLandmarkGroup(accessor);
    const pathBuild = buildPathGroup(accessor);
    const treeBuild = buildOrdinaryTreeGroup(accessor);
    const propsBuild = buildPropsGroup(accessor);

    this.triangleCount =
      terrainBuild.triangleCount +
      vegetationBuild.triangleCount +
      landmarkBuild.triangleCount +
      pathBuild.triangleCount +
      treeBuild.triangleCount +
      propsBuild.triangleCount;
    this.colliders = [...landmarkBuild.colliders, ...propsBuild.colliders];
    this.grassLod = vegetationBuild.grassLod;
    this.grassPlaced = vegetationBuild.grassPlaced;
    this.flowerPlaced = vegetationBuild.flowerPlaced;

    this.topGroups.push(
      terrainBuild.group,
      vegetationBuild.group,
      landmarkBuild.group,
      pathBuild.group,
      treeBuild.group,
      propsBuild.group,
    );
    for (const group of this.topGroups) {
      context.worldRoot.add(group);
      this.collectKindMeshes(group);
    }
    this.countInstances();

    this.statSource = this.createStatSource();
    this.unsubscribeFns.push(context.debug.registerStatSource(this.statSource));
  }

  update(_deltaSeconds: number, context: GameContext): void {
    if (!this.materialsBound) {
      const uniforms = this.revealUniformsProvider?.() ?? null;
      if (uniforms) {
        const brushes = this.brushPackProvider?.() ?? null;
        this.bindRevealMaterials(uniforms, brushes);
      }
    }
    this.updateGrassLod(context.camera.position);
  }

  private updateGrassLod(cameraPosition: { x: number; y: number; z: number }): void {
    let changed = false;
    for (const chunk of this.grassLod) {
      const dx = cameraPosition.x - chunk.center.x;
      const dz = cameraPosition.z - chunk.center.z;
      const near = Math.hypot(dx, dz) < GRASS_LOD_DISTANCE;
      if (chunk.near.visible !== near) {
        chunk.near.visible = near;
        chunk.far.visible = !near;
        changed = true;
      }
    }
    if (changed) this.countInstances();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribeFns) unsubscribe();
    this.unsubscribeFns.length = 0;

    for (const group of this.topGroups) disposeObject3D(group);
    this.topGroups.length = 0;

    for (const material of this.materials.values()) disposeMaterial(material);
    this.materials.clear();
    this.kindMeshes.clear();
    this.colliders = [];
    this.grassLod = [];
    this.grassPlaced = 0;
    this.flowerPlaced = 0;
    this.materialsBound = false;
    this.statSource = null;
  }

  getColliders(): readonly CollisionCircle[] {
    return this.colliders;
  }

  isRevealBound(): boolean {
    return this.materialsBound;
  }

  getTriangles(): number {
    return this.triangleCount;
  }

  getInstances(): number {
    return this.instanceCount;
  }

  getGrassPlaced(): number {
    return this.grassPlaced;
  }

  getFlowerPlaced(): number {
    return this.flowerPlaced;
  }

  // ---- 内部 ----

  private materialFor(kind: WorldMaterialKind): Material {
    let material = this.materials.get(kind);
    if (!material) {
      material = this.createPlainMaterial(kind);
      this.materials.set(kind, material);
    }
    return material;
  }

  private createPlainMaterial(kind: WorldMaterialKind): Material {
    const appearance = WORLD_MATERIAL_APPEARANCE[kind];
    const material = new MeshStandardMaterial({
      color: appearance.color,
      roughness: appearance.roughness ?? 0.94,
      flatShading: appearance.flatShading ?? false,
      ...(appearance.side === undefined ? {} : { side: appearance.side }),
    });
    material.name = `world-${kind}`;
    if (appearance.transparent) {
      material.transparent = true;
      material.opacity = appearance.opacity ?? 1;
      material.depthWrite = false;
    }
    return material;
  }

  private collectKindMeshes(root: Group): void {
    root.traverse((object) => {
      const kind = object.userData["worldMaterialKind"] as WorldMaterialKind | undefined;
      if (!kind) return;
      const mesh = object as Mesh;
      let list = this.kindMeshes.get(kind);
      if (!list) {
        list = [];
        this.kindMeshes.set(kind, list);
      }
      list.push(mesh);
    });
  }

  private countInstances(): void {
    this.instanceCount = 0;
    for (const meshes of this.kindMeshes.values()) {
      for (const mesh of meshes) {
        if (!mesh.visible) continue;
        const instanced = mesh as InstancedMesh;
        if (typeof instanced.count === "number" && instanced.isInstancedMesh) {
          this.instanceCount += instanced.count;
        }
      }
    }
  }

  private resolveTextureBindings(
    appearance: WorldMaterialAppearance,
    brushes: ProceduralBrushPack | null,
  ): {
    paintMap?: Texture;
    sketchMap?: Texture;
    waterMap?: Texture;
    barkMap?: Texture;
  } {
    if (!brushes) return {};
    if (appearance.brushKey === "foliage") {
      return { paintMap: brushes.foliagePaint, sketchMap: brushes.foliageSketch };
    }
    if (appearance.brushKey === "water") {
      return { waterMap: brushes.waterStroke };
    }
    if (appearance.brushKey === "birch") {
      return { barkMap: brushes.birchBark };
    }
    return {};
  }

  private bindRevealMaterials(uniforms: RevealUniforms, brushes: ProceduralBrushPack | null): void {
    for (const kind of WORLD_MATERIAL_KINDS) {
      const meshes = this.kindMeshes.get(kind);
      if (!meshes || meshes.length === 0) continue;

      const appearance = WORLD_MATERIAL_APPEARANCE[kind];
      const tex = this.resolveTextureBindings(appearance, brushes);
      const watercolor = createWatercolorMaterial({
        color: appearance.color,
        uniforms,
        ...(appearance.roughness === undefined ? {} : { roughness: appearance.roughness }),
        ...(appearance.flatShading === undefined ? {} : { flatShading: appearance.flatShading }),
        ...(appearance.side === undefined ? {} : { side: appearance.side }),
        ...(appearance.mode === undefined ? {} : { mode: appearance.mode }),
        ...(appearance.windStrength === undefined ? {} : { windStrength: appearance.windStrength }),
        ...(appearance.topColor === undefined ? {} : { topColor: appearance.topColor }),
        ...(appearance.bottomColor === undefined ? {} : { bottomColor: appearance.bottomColor }),
        ...(appearance.alphaCutoff === undefined ? {} : { alphaCutoff: appearance.alphaCutoff }),
        ...(appearance.transparent === undefined ? {} : { transparent: appearance.transparent }),
        ...(appearance.opacity === undefined ? {} : { opacity: appearance.opacity }),
        ...(appearance.transparent ? { depthWrite: false } : {}),
        ...tex,
        name: `world-${kind}-reveal`,
      });

      for (const mesh of meshes) mesh.material = watercolor;
      const plain = this.materials.get(kind);
      if (plain) disposeMaterial(plain);
      this.materials.set(kind, watercolor);
    }
    this.materialsBound = true;
  }

  private createStatSource(): DebugStatSource {
    return {
      id: "world",
      read: () => ({
        worldTriangles: this.triangleCount,
        worldInstances: this.instanceCount,
        worldColliders: this.colliders.length,
        worldGrass: this.grassPlaced,
        worldFlowers: this.flowerPlaced,
        streamWaterLevel: STREAM_WATER_LEVEL,
        revealBound: this.materialsBound,
      }),
    };
  }
}

export function createWorldSystem(options: WorldSystemOptions = {}): WorldSystem {
  return new WorldSystem(options);
}
