import { describe, expect, it } from "vitest";
import { PlayerController } from "../../../src/player/PlayerController";
import { CameraRig } from "../../../src/player/CameraRig";
import { applyKeyEvent, InputState } from "../../../src/player/InputState";
import { createWorldSystem } from "../../../src/world/World";
import { sampleTerrainHeight } from "../../../src/world/terrainHeight";
import { LANDMARKS, WORLD_BOUNDS } from "../../../src/config/world";
import { createFakeGameContext, placeCameraLookingNegZ } from "../helpers/fake-game-context";

const DT = 1 / 60;

/**
 * M2 验收代理（PRD 13）：「玩家可沿主路线顺畅走通，无软锁」。
 * 用 A2 真实控制器 + A3 真实地形采样 + 世界碰撞体 + 镜头避让联测：
 * 出生点 → 蓝花坡方向 → 过溪 → 花树根下。
 */
function createRouteHarness() {
  const context = createFakeGameContext({ sampleHeight: sampleTerrainHeight });
  placeCameraLookingNegZ(context.camera);
  const input = new InputState();
  const player = new PlayerController({ input });
  const camera = new CameraRig({ playerSource: player, input });
  const world = createWorldSystem({ revealUniformsProvider: () => null });
  world.init(context);
  player.init(context);
  camera.init(context);
  // 集成接线：世界碰撞体交给玩家（花树/枯树/岩石）
  player.addColliders(world.getColliders());
  return { context, input, player, camera, world };
}

describe("A3 × A2 联测 · 主路线走通（M2 代理）", () => {
  it("从出生点持续按 W 可抵达花树根下（交互半径内），全程无软锁", () => {
    const { context, input, player, camera, world } = createRouteHarness();
    const colliders = world.getColliders();
    applyKeyEvent(input, "KeyW", true);

    const tree = LANDMARKS.tree;
    let reached = false;
    let crossedStream = false;
    const violations: string[] = [];

    for (let frame = 0; frame < 3600 && !reached; frame += 1) {
      player.update(DT, context);
      camera.update(DT, context);
      const snapshot = player.getPlayerSnapshot();
      const p = snapshot.position;

      if (p.z < 8) crossedStream = true;

      // 全程断言：界内、有限、贴地、不穿碰撞体
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        violations.push(`frame ${frame}: 非有限坐标`);
        break;
      }
      if (Math.abs(p.x) > WORLD_BOUNDS.maxX || Math.abs(p.z) > WORLD_BOUNDS.maxX) {
        violations.push(`frame ${frame}: 越界 (${p.x}, ${p.z})`);
      }
      if (!snapshot.grounded) violations.push(`frame ${frame}: 意外离地`);
      if (Math.abs(p.y - sampleTerrainHeight(p.x, p.z)) > 1e-9) {
        violations.push(`frame ${frame}: 未贴地`);
      }
      for (const collider of colliders) {
        const dist = Math.hypot(p.x - collider.x, p.z - collider.z);
        if (dist < collider.radius + 0.4 - 1e-6) {
          violations.push(`frame ${frame}: 进入碰撞体 (${collider.x}, ${collider.z}) r=${collider.radius}`);
        }
      }
      // 镜头避让：镜头始终高于地形（PRD 9.3）
      const cam = context.camera.position;
      if (cam.y < sampleTerrainHeight(cam.x, cam.z) + 0.8 - 1e-6) {
        violations.push(`frame ${frame}: 镜头穿入地形 y=${cam.y.toFixed(3)}`);
      }

      const distToTree = Math.hypot(p.x - tree.x, p.z - tree.z);
      if (distToTree <= 5) reached = true; // 花树交互半径（config.tree.triggerRadius）
    }

    expect(violations).toEqual([]);
    expect(crossedStream).toBe(true); // 溪流被步行穿过（可通行，无软锁）
    expect(reached).toBe(true); // 抵达花树交互半径
  });

  it("正对花树树干会被挡住但仍在交互半径内（碰撞不锁死流程）", () => {
    const { context, input, player } = createRouteHarness();
    applyKeyEvent(input, "KeyW", true);
    const treeZ = LANDMARKS.tree.z;
    let frames = 0;
    while (frames < 3600) {
      player.update(DT, context);
      frames += 1;
      if (player.getPlayerSnapshot().position.z <= treeZ + 5) break;
    }

    const p = player.getPlayerSnapshot().position;
    const distToTrunk = Math.hypot(p.x - LANDMARKS.tree.x, p.z - LANDMARKS.tree.z);
    expect(distToTrunk).toBeGreaterThanOrEqual(0.7 + 0.4 - 0.05); // 未穿入树干
    expect(distToTrunk).toBeLessThanOrEqual(5); // 仍在交互半径内（AC-06 可触发）
  });
});
