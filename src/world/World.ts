/**
 * 世界系统（A3，PRD 9.4 / 12.2 A3）。
 *
 * 职责：
 * - init：用默认普通材质构建地形、水面、远山、植被、地标物，挂到 context.worldRoot；
 *   构建「未接入染色也能独立运行」的完整场景（PRD：染色材质通过接口注入，未接入前用占位材质）。
 * - update：仅首帧做一次性材质绑定——把 A1 的 RevealUniforms 注入各类材质
 *   （createWatercolorMaterial 同款外观重建），之后每帧 no-op。
 *   uniforms 由 RevealSystem 在 init 阶段创建，而 Game.start() 先跑完全部 init
 *   再进入更新循环，所以首帧 update 时 provider 必然可取到（若 A1 未挂载则保持普通材质）。
 * - 碰撞数据：花树 / 枯树 / 岩石的圆形碰撞体，由集成者接到
 *   `PlayerController.addColliders(world.getColliders())`；踏石不设碰撞（可直接蹚过）。
 * - 地形高度：`terrainHeight.sampleTerrainHeight`，由集成者把 config/world.ts 的
 *   平坦占位替换为 re-export 本实现（一行），玩家贴地 / 镜头避让 / 出生点自动跟随。
 * - dispose：释放全部几何体与材质（PRD 7.3 / 11.1）。
 *
 * phase 选择：世界无逐帧逻辑（首帧绑定后 no-op），取 "reveal" 并在集成顺序中
 * 排在 RevealSystem 之后，保证绑定发生在 reveal 更新之后的同一帧渲染前。
 */
import {
  MeshStandardMaterial,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
} from "three";
import type { DebugStatSource, GameContext, GameSystem, SystemPhase } from "../core/contracts";
import { disposeMaterial, disposeObject3D } from "../core/dispose";
import { createWatercolorMaterial, type RevealUniforms } from "../rendering/WatercolorMaterial";
import type { CollisionCircle } from "../player/collision";
import { buildTerrainGroup } from "./Terrain";
import { buildVegetationGroup, GRASS_LOD_DISTANCE, type GrassLodChunk } from "./Vegetation";
import { buildLandmarkGroup } from "./Landmarks";
import { buildPathGroup } from "./Path";
import { buildOrdinaryTreeGroup } from "./Trees";
import { STREAM_WATER_LEVEL } from "./terrainHeight";
import {
  WORLD_MATERIAL_APPEARANCE,
  WORLD_MATERIAL_KINDS,
  type RevealUniformsProvider,
  type WorldMaterialKind,
} from "./worldMaterials";

export interface WorldSystemOptions {
  /** A1 uniforms 提供者（注入染色材质）；缺省时世界保持普通材质。 */
  readonly revealUniformsProvider?: RevealUniformsProvider;
}

export class WorldSystem implements GameSystem {
  readonly id = "world";
  readonly phase: SystemPhase = "reveal";

  private readonly revealUniformsProvider: RevealUniformsProvider | null;
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
  }

  init(context: GameContext): void {
    const accessor = (kind: WorldMaterialKind): Material => this.materialFor(kind);

    const terrainBuild = buildTerrainGroup(accessor);
    const vegetationBuild = buildVegetationGroup(accessor);
    const landmarkBuild = buildLandmarkGroup(accessor);
    const pathBuild = buildPathGroup(accessor);
    const treeBuild = buildOrdinaryTreeGroup(accessor);

    this.triangleCount =
      terrainBuild.triangleCount +
      vegetationBuild.triangleCount +
      landmarkBuild.triangleCount +
      pathBuild.triangleCount +
      treeBuild.triangleCount;
    this.colliders = landmarkBuild.colliders;
    this.grassLod = vegetationBuild.grassLod;
    this.grassPlaced = vegetationBuild.grassPlaced;
    this.flowerPlaced = vegetationBuild.flowerPlaced;

    this.topGroups.push(
      terrainBuild.group,
      vegetationBuild.group,
      landmarkBuild.group,
      pathBuild.group,
      treeBuild.group,
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
      if (uniforms) this.bindRevealMaterials(uniforms);
    }
    this.updateGrassLod(context.camera.position);
  }

  /** 草分块 LOD：相机近的块用三叶簇，远的块用单叶；视锥剔除由包围球承担。 */
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

  /** A2 的碰撞入口：花树 / 枯树 / 岩石的圆形碰撞体。 */
  getColliders(): readonly CollisionCircle[] {
    return this.colliders;
  }

  /** 是否已完成水彩材质绑定（调试与测试用）。 */
  isRevealBound(): boolean {
    return this.materialsBound;
  }

  getTriangles(): number {
    return this.triangleCount;
  }

  getInstances(): number {
    return this.instanceCount;
  }

  /** 实际放置的草簇数（V0.2 密度验收）。 */
  getGrassPlaced(): number {
    return this.grassPlaced;
  }

  /** 实际放置的花头数（V0.2 密度验收）。 */
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
        if (!mesh.visible) continue; // LOD 隐藏层不重复计数
        const instanced = mesh as InstancedMesh;
        if (typeof instanced.count === "number" && instanced.isInstancedMesh) {
          this.instanceCount += instanced.count;
        }
      }
    }
  }

  /** 一次性：把 A1 uniforms 注入全部种类（同款外观重建 + 替换网格材质 + 释放普通材质）。 */
  private bindRevealMaterials(uniforms: RevealUniforms): void {
    for (const kind of WORLD_MATERIAL_KINDS) {
      const meshes = this.kindMeshes.get(kind);
      if (!meshes || meshes.length === 0) continue;

      const appearance = WORLD_MATERIAL_APPEARANCE[kind];
      const watercolor = createWatercolorMaterial({
        color: appearance.color,
        uniforms,
        ...(appearance.roughness === undefined ? {} : { roughness: appearance.roughness }),
        ...(appearance.flatShading === undefined ? {} : { flatShading: appearance.flatShading }),
        name: `world-${kind}-reveal`,
      });
      if (appearance.transparent) {
        watercolor.transparent = true;
        watercolor.opacity = appearance.opacity ?? 1;
        watercolor.depthWrite = false;
      }

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

/** 供集成者构造：`const world = createWorldSystem({ revealUniformsProvider: () => reveal.revealUniforms })`。 */
export function createWorldSystem(options: WorldSystemOptions = {}): WorldSystem {
  return new WorldSystem(options);
}
