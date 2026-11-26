import { describe, expect, it } from "vitest";
import {
  InstancedMesh,
  MeshStandardMaterial,
  Texture,
  type BufferAttribute,
  type Mesh,
} from "three";
import { LANDMARKS, STREAM, WORLD_BOUNDS } from "../../../src/config/world";
import { createRevealUniforms, getRevealUniforms } from "../../../src/rendering/WatercolorMaterial";
import {
  sampleTerrainHeight,
  steppingStonePositions,
  STREAM_WATER_LEVEL,
} from "../../../src/world/terrainHeight";
import { WORLD_MATERIAL_APPEARANCE, WORLD_MATERIAL_KINDS } from "../../../src/world/worldMaterials";
import { TREE_TRUNK_COLLIDER_RADIUS } from "../../../src/world/Landmarks";
import { createWorldSystem } from "../../../src/world/World";
import { createFakeGameContext } from "../helpers/fake-game-context";

function createContext() {
  // 测试上下文使用真实地形采样器（与集成后的 config/world.ts 同一函数）。
  return createFakeGameContext({ sampleHeight: sampleTerrainHeight });
}

/** noUncheckedIndexedAccess 安全的 position 属性读取。 */
function positionAttribute(mesh: Mesh): BufferAttribute {
  const attribute = mesh.geometry.attributes["position"];
  if (!attribute) throw new Error("mesh 缺少 position 属性");
  return attribute as BufferAttribute;
}

describe("WorldSystem · 场景构建", () => {
  it("init 后地形/水面/植被/地标挂入 worldRoot 并正确命名", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const names = context.worldRoot.children.map((child) => child.name);
    expect(names).toContain("world-terrain-group");
    expect(names).toContain("world-vegetation-group");
    expect(names).toContain("world-landmark-group");
    expect(names).toContain("world-path-group");
    expect(names).toContain("world-ordinary-tree-group");

    const terrain = context.worldRoot.getObjectByName("terrain-mesh");
    expect(terrain).toBeDefined();
    const water = context.worldRoot.getObjectByName("stream-water");
    expect(water).toBeDefined();
    const tree = context.worldRoot.getObjectByName("flower-tree");
    expect(tree).toBeDefined();
    const grass = context.worldRoot.getObjectByName("grass-chunk-1-1-near");
    expect(grass).toBeInstanceOf(InstancedMesh);
    const path = context.worldRoot.getObjectByName("world-path");
    expect(path).toBeDefined();

    world.dispose();
    expect(context.worldRoot.children.length).toBe(0);
  });

  it("地形网格顶点高度与采样函数一致（顶点坐标即世界坐标）", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const terrain = context.worldRoot.getObjectByName("terrain-mesh") as Mesh;
    const positions = positionAttribute(terrain);
    expect(positions.count).toBeGreaterThan(10000);

    // 抽查若干顶点：局部坐标 = 世界坐标（网格无变换）
    for (let i = 0; i < positions.count; i += 500) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      expect(positions.getY(i)).toBeCloseTo(sampleTerrainHeight(x, z), 5);
    }
    world.dispose();
  });

  it("水面高度等于 STREAM_WATER_LEVEL，宽度来自 config 的 STREAM", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const water = context.worldRoot.getObjectByName("stream-water") as Mesh;
    const positions = positionAttribute(water);
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < positions.count; i += 1) {
      minY = Math.min(minY, positions.getY(i));
      minZ = Math.min(minZ, positions.getZ(i));
      maxZ = Math.max(maxZ, positions.getZ(i));
    }
    expect(minY).toBeCloseTo(STREAM_WATER_LEVEL, 6);
    // 水面几何 z 范围 = centerZ ± widthMeters/2
    expect(minZ).toBeCloseTo(8 - 2, 6);
    expect(maxZ).toBeCloseTo(8 + 2, 6);
    world.dispose();
  });

  it("性能预算：V0.2 三角面≤300k、草/花密度达标、world draw call≤150", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    // V0.2 预算（PRD 11.1 上限 350k，本轮目标 ≤300k）。
    expect(world.getTriangles()).toBeGreaterThan(0);
    expect(world.getTriangles()).toBeLessThanOrEqual(300_000);
    // 密度：草 1.2万～2万簇、花 1200～2000 朵。
    expect(world.getGrassPlaced()).toBeGreaterThanOrEqual(12_000);
    expect(world.getGrassPlaced()).toBeLessThanOrEqual(20_000);
    expect(world.getFlowerPlaced()).toBeGreaterThanOrEqual(1_200);
    expect(world.getFlowerPlaced()).toBeLessThanOrEqual(2_000);
    // 实例数 = 可见草簇 + 花茎/花头 + 树/山实例（LOD 隐藏层不重复计）。
    expect(world.getInstances()).toBeGreaterThanOrEqual(world.getGrassPlaced());
    expect(world.getInstances()).toBeLessThan(60_000);
    // world 可见网格数（draw call 代理）≤150。
    let visibleMeshes = 0;
    context.worldRoot.traverse((object) => {
      if ((object as Mesh).isMesh && object.visible) visibleMeshes += 1;
    });
    expect(visibleMeshes).toBeLessThanOrEqual(150);
    world.dispose();
  });

  it("dispose 幂等：重复释放不抛错", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);
    world.dispose();
    expect(() => world.dispose()).not.toThrow();
  });
});

describe("WorldSystem · 溪流踏石（PRD 5.3）", () => {
  it("石块数量与位置来自 config 推导（steppingStonePositions）", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const stones = steppingStonePositions();
    expect(stones.length).toBe(STREAM.steppingStoneCount);

    for (let i = 0; i < stones.length; i += 1) {
      const expected = stones[i];
      if (!expected) continue;
      const slab = context.worldRoot.getObjectByName(`stepping-stone-${i}`);
      expect(slab).toBeDefined();
      expect(slab?.position.x).toBeCloseTo(expected.x, 6);
      expect(slab?.position.z).toBeCloseTo(expected.z, 6);
    }
    world.dispose();
  });

  it("石块贴地摆放且顶面高于水面（视觉可踩）", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const stones = steppingStonePositions();
    for (let i = 0; i < stones.length; i += 1) {
      const stone = stones[i];
      if (!stone) continue;
      const slab = context.worldRoot.getObjectByName(`stepping-stone-${i}`) as Mesh;
      const ground = sampleTerrainHeight(stone.x, stone.z);
      expect(slab.position.y).toBeGreaterThan(ground); // 微微露出地面
      expect(slab.position.y).toBeGreaterThan(STREAM_WATER_LEVEL); // 高于水面
    }
    world.dispose();
  });

  it("踏石使用 rock 材质种类，随染色一起被注入", () => {
    const context = createContext();
    const uniforms = createRevealUniforms(new Texture(), WORLD_BOUNDS);
    const world = createWorldSystem({ revealUniformsProvider: () => uniforms });
    world.init(context);
    world.update(1 / 60, context);

    const slab = context.worldRoot.getObjectByName("stepping-stone-0") as Mesh;
    expect(slab.userData["worldMaterialKind"]).toBe("rock");
    expect(getRevealUniforms(slab.material as MeshStandardMaterial)).not.toBeNull();
    world.dispose();
  });
});

describe("WorldSystem · 碰撞数据（PRD 9.3 圆形碰撞）", () => {
  it("包含花树树干碰撞，位置取自 config 地标", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const colliders = world.getColliders();
    const trunk = colliders.find((c) => c.x === LANDMARKS.tree.x && c.z === LANDMARKS.tree.z);
    expect(trunk).toBeDefined();
    expect(trunk?.radius).toBe(TREE_TRUNK_COLLIDER_RADIUS);
    world.dispose();
  });

  it("碰撞体数量 = 花树 1 + 倒木 1 + 岩石 5，且全部在可玩边界内", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);

    const colliders = world.getColliders();
    expect(colliders.length).toBe(7);
    for (const collider of colliders) {
      expect(collider.x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
      expect(collider.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX);
      expect(collider.z).toBeGreaterThanOrEqual(WORLD_BOUNDS.minZ);
      expect(collider.z).toBeLessThanOrEqual(WORLD_BOUNDS.maxZ);
      expect(collider.radius).toBeGreaterThan(0);
    }
    world.dispose();
  });

  it("踏石与水面带内不设碰撞（可直接通行，无软锁）", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);
    for (const collider of world.getColliders()) {
      // 水面宽度 ±2m + 安全余量 0.4m 内不允许有碰撞体
      expect(Math.abs(collider.z - 8)).toBeGreaterThanOrEqual(2.4);
    }
    world.dispose();
  });
});

describe("WorldSystem · A1 染色材质注入（接口注入，AC-05）", () => {
  it("未提供 uniforms 时保持普通材质（独立可运行）", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);
    world.update(1 / 60, context);
    world.update(1 / 60, context);

    const terrain = context.worldRoot.getObjectByName("terrain-mesh") as Mesh;
    expect(terrain.material).toBeInstanceOf(MeshStandardMaterial);
    expect(getRevealUniforms(terrain.material as MeshStandardMaterial)).toBeNull();
    expect(world.isRevealBound()).toBe(false);
    world.dispose();
  });

  it("提供 uniforms 后首帧把全部种类替换为水彩材质（共享同一 uniforms）", () => {
    const context = createContext();
    const uniforms = createRevealUniforms(new Texture(), WORLD_BOUNDS);
    const world = createWorldSystem({ revealUniformsProvider: () => uniforms });
    world.init(context);
    world.update(1 / 60, context);
    expect(world.isRevealBound()).toBe(true);

    // 收集所有带种类标记的网格（山体实例在二级嵌套，用 traverse 全量收集）
    const tagged: Mesh[] = [];
    context.worldRoot.traverse((object) => {
      if (object.userData["worldMaterialKind"] !== undefined) tagged.push(object as Mesh);
    });

    let checkedKinds = 0;
    for (const kind of WORLD_MATERIAL_KINDS) {
      const meshes = tagged.filter((mesh) => mesh.userData["worldMaterialKind"] === kind);
      if (meshes.length === 0) continue;
      checkedKinds += 1;
      for (const mesh of meshes) {
        const material = mesh.material as MeshStandardMaterial;
        const bound = getRevealUniforms(material);
        expect(bound).not.toBeNull();
        expect(bound?.uRevealMask).toBe(uniforms.uRevealMask); // 同一 uniforms 引用（AC-05）
        expect(material.name).toBe(`world-${kind}-reveal`);
      }
    }
    expect(checkedKinds).toBe(WORLD_MATERIAL_KINDS.length);
    world.dispose();
  });

  it("绑定幂等：重复 update 不会重建材质", () => {
    const context = createContext();
    const uniforms = createRevealUniforms(new Texture(), WORLD_BOUNDS);
    const world = createWorldSystem({ revealUniformsProvider: () => uniforms });
    world.init(context);
    world.update(1 / 60, context);
    const terrain = context.worldRoot.getObjectByName("terrain-mesh") as Mesh;
    const materialAfterFirst = terrain.material;
    world.update(1 / 60, context);
    world.update(1 / 60, context);
    expect(terrain.material).toBe(materialAfterFirst);
    world.dispose();
  });

  it("每个种类的默认外观与 worldMaterials 声明一致", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);
    const terrain = context.worldRoot.getObjectByName("terrain-mesh") as Mesh;
    const material = terrain.material as MeshStandardMaterial;
    expect(material.name).toBe("world-terrain");
    expect(material.color.getHex()).toBe(WORLD_MATERIAL_APPEARANCE.terrain.color);
    world.dispose();
  });
});

describe("WorldSystem · 调试统计（AC-11）", () => {
  it("注册 world stat source，暴露三角面/实例/碰撞/水位", () => {
    const context = createContext();
    const world = createWorldSystem();
    world.init(context);
    const stats = context.debug.readStats();
    expect(stats["world.worldTriangles"]).toBeGreaterThan(0);
    expect(stats["world.worldInstances"]).toBeGreaterThan(0);
    expect(stats["world.worldColliders"]).toBe(7);
    expect(stats["world.streamWaterLevel"]).toBe(STREAM_WATER_LEVEL);
    expect(stats["world.revealBound"]).toBe(false);
    world.dispose();
  });
});
