/**
 * V0.2 场景美术专项测试（Agent 3）：散布确定性、密度/预算、分块剔除与 LOD、
 * 小径连通/宽度、普通树三类与安全避让、花树伞形、新材质种类共享 A1 uniforms。
 * 安全断言（碰撞=7、溪流带无碰撞、路线走通）保留在 world-scene / world-route。
 */
import { describe, expect, it } from "vitest";
import {
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Texture,
  Vector3,
  type Material,
} from "three";
import { LANDMARKS, STREAM, WORLD_BOUNDS } from "../../../src/config/world";
import { createRevealUniforms, getRevealUniforms } from "../../../src/rendering/WatercolorMaterial";
import {
  GRASS_CHUNK_GRID,
  ORDINARY_TREE_COUNT,
  PATH_WIDTH,
  TREE_TYPE_COUNTS,
  buildOrdinaryTreeGroup,
  buildPathGroup,
  buildVegetationGroup,
  distanceToPath,
  pathSurfaceHeight,
} from "../../../src/world";
import { createWorldSystem } from "../../../src/world/World";
import { STREAM_WATER_LEVEL, sampleTerrainHeight } from "../../../src/world/terrainHeight";
import type { WorldMaterialKind } from "../../../src/world/worldMaterials";
import { createFakeGameContext } from "../helpers/fake-game-context";

function makeAccessor(): (kind: WorldMaterialKind) => Material {
  const cache = new Map<WorldMaterialKind, Material>();
  return (kind) => {
    let material = cache.get(kind);
    if (!material) {
      material = new MeshStandardMaterial();
      cache.set(kind, material);
    }
    return material;
  };
}

function instancePosition(mesh: InstancedMesh, index: number): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

describe("V0.2 · 散布确定性", () => {
  it("同种子两次构建：草/花数量与实例矩阵完全一致", () => {
    const a = buildVegetationGroup(makeAccessor());
    const b = buildVegetationGroup(makeAccessor());
    expect(a.grassPlaced).toBe(b.grassPlaced);
    expect(a.flowerPlaced).toBe(b.flowerPlaced);

    const chunkA = a.group.getObjectByName("grass-chunk-1-1-near") as InstancedMesh;
    const chunkB = b.group.getObjectByName("grass-chunk-1-1-near") as InstancedMesh;
    const ma = new Matrix4();
    const mb = new Matrix4();
    for (const i of [0, 17, 120]) {
      chunkA.getMatrixAt(i, ma);
      chunkB.getMatrixAt(i, mb);
      expect(ma.elements).toEqual(mb.elements);
    }
    const bloomA = a.group.getObjectByName("flower-blooms-flower") as InstancedMesh;
    const bloomB = b.group.getObjectByName("flower-blooms-flower") as InstancedMesh;
    bloomA.getMatrixAt(3, ma);
    bloomB.getMatrixAt(3, mb);
    expect(ma.elements).toEqual(mb.elements);
  });
});

describe("V0.2/V0.3 · 密度与分块", () => {
  it("草 1.2万～2万簇、花 1200～2000 朵，四色花带均非空", () => {
    const build = buildVegetationGroup(makeAccessor());
    expect(build.grassPlaced).toBeGreaterThanOrEqual(12_000);
    expect(build.grassPlaced).toBeLessThanOrEqual(20_000);
    expect(build.flowerPlaced).toBeGreaterThanOrEqual(1_200);
    expect(build.flowerPlaced).toBeLessThanOrEqual(2_000);
    let sum = 0;
    for (const kind of ["flower", "flowerRed", "flowerMagenta", "flowerYellow"] as const) {
      const blooms = build.group.getObjectByName(`flower-blooms-${kind}`) as InstancedMesh;
      expect(blooms.count).toBeGreaterThan(0);
      sum += blooms.count;
    }
    expect(sum).toBe(build.flowerPlaced);
  });

  it("草按 4×4 分块，近/远成对且包围球已计算（视锥剔除就绪）", () => {
    const build = buildVegetationGroup(makeAccessor());
    expect(build.grassLod.length).toBe(GRASS_CHUNK_GRID * GRASS_CHUNK_GRID);
    for (const chunk of build.grassLod) {
      expect(chunk.near.boundingSphere).not.toBeNull();
      expect(chunk.far.boundingSphere).not.toBeNull();
      expect(chunk.near.count).toBe(chunk.far.count);
      expect(chunk.far.visible).toBe(false);
    }
  });

  it("LOD：相机靠近用近景三叶簇，远离切远景单叶", () => {
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const world = createWorldSystem();
    world.init(context);
    const near = context.worldRoot.getObjectByName("grass-chunk-1-1-near") as InstancedMesh;
    const far = context.worldRoot.getObjectByName("grass-chunk-1-1-far") as InstancedMesh;

    context.camera.position.set(-11, 3, -11); // 块 (1,1) 中心
    world.update(1 / 60, context);
    expect(near.visible).toBe(true);
    expect(far.visible).toBe(false);

    context.camera.position.set(43, 3, 43); // 远离该块
    world.update(1 / 60, context);
    expect(near.visible).toBe(false);
    expect(far.visible).toBe(true);
    world.dispose();
  });
});

describe("V0.2 · 小径", () => {
  it("宽度 1～1.4m，中心线串联地标，贴地抬升防 z-fighting", () => {
    expect(PATH_WIDTH).toBeGreaterThanOrEqual(1);
    expect(PATH_WIDTH).toBeLessThanOrEqual(1.4);
    for (const id of ["spawn", "flower", "stream", "tree"] as const) {
      const landmark = LANDMARKS[id];
      expect(distanceToPath(landmark.x, landmark.z)).toBeLessThan(0.6);
      expect(pathSurfaceHeight(landmark.x, landmark.z)).toBeGreaterThanOrEqual(
        sampleTerrainHeight(landmark.x, landmark.z),
      );
    }
    // 溪流带内小径不低于水面（浅滩 ford）。
    expect(pathSurfaceHeight(0, STREAM.centerZ)).toBeGreaterThanOrEqual(STREAM_WATER_LEVEL);
    const build = buildPathGroup(makeAccessor());
    expect(build.group.getObjectByName("world-path")).toBeDefined();
    expect(build.triangleCount).toBeGreaterThan(0);
  });
});

describe("V0.2 · 普通树森林", () => {
  it("25～40 棵、三类齐备、实例化共享几何", () => {
    expect(ORDINARY_TREE_COUNT).toBeGreaterThanOrEqual(25);
    expect(ORDINARY_TREE_COUNT).toBeLessThanOrEqual(40);
    expect(TREE_TYPE_COUNTS.darkGreen + TREE_TYPE_COUNTS.birch + TREE_TYPE_COUNTS.weeping).toBe(
      ORDINARY_TREE_COUNT,
    );
    const build = buildOrdinaryTreeGroup(makeAccessor());
    for (const name of [
      "ordinary-tree-trunk-brown",
      "ordinary-tree-trunk-white",
      "ordinary-tree-canopy-green",
      "ordinary-tree-willow-strands",
    ]) {
      const mesh = build.group.getObjectByName(name) as InstancedMesh;
      expect(mesh).toBeInstanceOf(InstancedMesh);
      expect(mesh.count).toBeGreaterThan(0);
    }
  });

  it("树木避让路面/溪流/花树净空，且不新增碰撞体（路线安全零回归）", () => {
    const build = buildOrdinaryTreeGroup(makeAccessor());
    const trunks = build.group.getObjectByName("ordinary-tree-trunk-brown") as InstancedMesh;
    const white = build.group.getObjectByName("ordinary-tree-trunk-white") as InstancedMesh;
    for (const mesh of [trunks, white]) {
      for (let i = 0; i < mesh.count; i += 1) {
        const p = instancePosition(mesh, i);
        expect(Math.abs(p.z - STREAM.centerZ)).toBeGreaterThanOrEqual(3);
        expect(distanceToPath(p.x, p.z)).toBeGreaterThanOrEqual(3.5);
        expect(Math.hypot(p.x - LANDMARKS.tree.x, p.z - LANDMARKS.tree.z)).toBeGreaterThanOrEqual(
          6,
        );
        expect(Math.abs(p.x)).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ);
      }
    }
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const world = createWorldSystem();
    world.init(context);
    expect(world.getColliders().length).toBe(7); // 花树1+枯树3+岩石3，普通树不增碰撞
    world.dispose();
  });
});

describe("V0.2 · 花树伞形与材质共享", () => {
  it("花树冠为多小叶簇实例（非四球拼接），主枝实例化，树干碰撞保留", () => {
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const world = createWorldSystem();
    world.init(context);
    const canopy = context.worldRoot.getObjectByName("flower-tree-canopy") as InstancedMesh;
    expect(canopy).toBeInstanceOf(InstancedMesh);
    expect(canopy.count).toBeGreaterThanOrEqual(40);
    const branches = context.worldRoot.getObjectByName("flower-tree-branches") as InstancedMesh;
    expect(branches.count).toBeGreaterThanOrEqual(5);
    const trunkCollider = world
      .getColliders()
      .find((c) => c.x === LANDMARKS.tree.x && c.z === LANDMARKS.tree.z);
    expect(trunkCollider?.radius).toBe(0.7);
    world.dispose();
  });

  it("新增种类（小径/红黄花/白干/绿树冠/垂枝）共享同一 A1 uniforms", () => {
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const uniforms = createRevealUniforms(new Texture(), WORLD_BOUNDS);
    const world = createWorldSystem({ revealUniformsProvider: () => uniforms });
    world.init(context);
    world.update(1 / 60, context);
    expect(world.isRevealBound()).toBe(true);

    const probes: Array<[string, WorldMaterialKind]> = [
      ["world-path", "path"],
      ["flower-blooms-flowerRed", "flowerRed"],
      ["flower-blooms-flowerYellow", "flowerYellow"],
      ["ordinary-tree-trunk-white", "treeTrunkWhite"],
      ["ordinary-tree-canopy-green", "treeCanopyGreen"],
      ["ordinary-tree-willow-strands", "treeWillow"],
    ];
    for (const [name, kind] of probes) {
      const mesh = context.worldRoot.getObjectByName(name) as InstancedMesh;
      expect(mesh.userData["worldMaterialKind"]).toBe(kind);
      const bound = getRevealUniforms(mesh.material as MeshStandardMaterial);
      expect(bound?.uRevealMask).toBe(uniforms.uRevealMask);
    }
    world.dispose();
  });
});
