import { describe, expect, it } from "vitest";
import { InstancedMesh, Mesh, MeshStandardMaterial, Texture, type BufferAttribute } from "three";
import { WORLD_BOUNDS } from "../../../src/config/world";
import { createProceduralBrushPack } from "../../../src/rendering/ProceduralBrushes";
import { createRevealUniforms, getRevealUniforms } from "../../../src/rendering/WatercolorMaterial";
import {
  buildMountainGroup,
  buildPropsGroup,
  createWorldSystem,
  sampleTerrainHeight,
} from "../../../src/world";
import { createFakeGameContext } from "../helpers/fake-game-context";

describe("V0.3 · 三层连绵远山与叙事小景", () => {
  it("三层远山环带均存在、有完整 UV 且严格在可玩边界外", () => {
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const world = createWorldSystem();
    world.init(context);

    for (const name of ["mountain-ridge-near", "mountain-ridge-mid", "mountain-ridge-far"]) {
      const ridge = context.worldRoot.getObjectByName(name) as Mesh;
      expect(ridge).toBeInstanceOf(Mesh);
      const pos = ridge.geometry.attributes["position"] as BufferAttribute;
      const uv = ridge.geometry.attributes["uv"] as BufferAttribute;
      expect(pos.count).toBeGreaterThan(200);
      expect(uv.count).toBe(pos.count);
      for (let i = 0; i < pos.count; i += 10) {
        const outside =
          Math.abs(pos.getX(i)) > WORLD_BOUNDS.maxX || Math.abs(pos.getZ(i)) > WORLD_BOUNDS.maxZ;
        expect(outside).toBe(true);
      }
    }
    world.dispose();
  });

  it("Props 包含倒木、苔藓、红蘑菇与黄色开花灌木", () => {
    const built = buildPropsGroup(() => new MeshStandardMaterial());
    expect(built.group.getObjectByName("fallen-log-trunk")).toBeDefined();
    expect(built.group.getObjectByName("fallen-log-moss")).toBeDefined();
    expect(built.group.getObjectByName("fallen-log-mushroom-caps")).toBeInstanceOf(InstancedMesh);
    expect(built.group.getObjectByName("meadow-yellow-bushes")).toBeInstanceOf(InstancedMesh);
    expect(built.colliders.length).toBe(1);
  });

  it("buildMountainGroup 单次构建三角面轻量", () => {
    const built = buildMountainGroup(() => new MeshStandardMaterial());
    expect(built.triangleCount).toBeGreaterThan(300);
    expect(built.triangleCount).toBeLessThan(6000);
  });

  it("WorldSystem 接入 brushPackProvider 后，所有水彩材质仍共享同一 RevealUniforms", () => {
    const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
    const uniforms = createRevealUniforms(new Texture(), WORLD_BOUNDS);
    const brushes = createProceduralBrushPack();
    const world = createWorldSystem({
      revealUniformsProvider: () => uniforms,
      brushPackProvider: () => brushes,
    });
    world.init(context);
    world.update(1 / 60, context);

    const canopy = context.worldRoot.getObjectByName("flower-tree-canopy") as InstancedMesh;
    expect(canopy.instanceColor).not.toBeNull();
    expect(getRevealUniforms(canopy.material as MeshStandardMaterial)).toBe(uniforms);

    const willow = context.worldRoot.getObjectByName(
      "ordinary-tree-willow-strands",
    ) as InstancedMesh;
    expect(willow.instanceColor).not.toBeNull();
    expect(getRevealUniforms(willow.material as MeshStandardMaterial)).toBe(uniforms);

    brushes.dispose();
    world.dispose();
  });
});
