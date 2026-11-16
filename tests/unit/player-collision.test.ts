import { describe, expect, it } from "vitest";
import {
  CollisionWorld,
  circlePushOut,
  resolveCircleCollisions,
  type CollisionCircle,
} from "../../src/player/collision";

describe("circlePushOut（圆形推出）", () => {
  it("重叠时沿连线方向推出到两半径之和", () => {
    // 玩家 (0.5, 0) r=0.4，障碍 (0,0) r=1.0 → 应被推到距离 1.4 处。
    const push = circlePushOut(0.5, 0, 0.4, { x: 0, z: 0, radius: 1 });
    expect(push).not.toBeNull();
    const x = 0.5 + (push?.dx ?? 0);
    const z = 0 + (push?.dz ?? 0);
    expect(Math.hypot(x, z)).toBeCloseTo(1.4, 6);
  });

  it("未重叠时返回 null", () => {
    expect(circlePushOut(0, 5, 0.4, { x: 0, z: 0, radius: 1 })).toBeNull();
    // 恰好相切：不推出。
    expect(circlePushOut(1.4, 0, 0.4, { x: 0, z: 0, radius: 1 })).toBeNull();
  });

  it("圆心重合时沿 +X 推出，避免死锁", () => {
    const push = circlePushOut(0, 0, 0.4, { x: 0, z: 0, radius: 1 });
    expect(push?.dz).toBeCloseTo(0, 6);
    expect(push?.dx).toBeCloseTo(1.4, 6);
  });
});

describe("resolveCircleCollisions（多圆解算）", () => {
  const leftWall: CollisionCircle = { x: -0.2, z: 0, radius: 1.2 };
  const rightWall: CollisionCircle = { x: 0.2, z: 0, radius: 1.2 };

  it("玩家不会被推进障碍，最终停在两圆之外", () => {
    const resolved = resolveCircleCollisions(0, 0, 0.4, [leftWall, rightWall]);
    const minDist = 0.4 + 1.2;
    expect(Math.hypot(resolved.x - leftWall.x, resolved.z - leftWall.z)).toBeGreaterThanOrEqual(
      minDist - 1e-6,
    );
    expect(Math.hypot(resolved.x - rightWall.x, resolved.z - rightWall.z)).toBeGreaterThanOrEqual(
      minDist - 1e-6,
    );
  });

  it("空障碍列表返回原位置", () => {
    expect(resolveCircleCollisions(3, 4, 0.4, [])).toEqual({ x: 3, z: 4 });
  });
});

describe("CollisionWorld（A3 障碍注册表）", () => {
  it("add / remove / clear / count", () => {
    const world = new CollisionWorld();
    const tree: CollisionCircle = { x: 10, z: -20, radius: 1.2 };
    world.add(tree);
    expect(world.count).toBe(1);
    world.remove(tree);
    expect(world.count).toBe(0);
    world.addAll([tree, { x: 0, z: 8, radius: 2 }]);
    expect(world.count).toBe(2);
    world.clear();
    expect(world.count).toBe(0);
  });

  it("非法碰撞体（半径≤0 / NaN 坐标）被忽略", () => {
    const world = new CollisionWorld();
    world.add({ x: 0, z: 0, radius: 0 });
    world.add({ x: Number.NaN, z: 0, radius: 1 });
    world.add({ x: 0, z: Number.NaN, radius: 1 });
    expect(world.count).toBe(0);
  });

  it("resolve 推出玩家并返回是否发生位移", () => {
    const world = new CollisionWorld();
    world.add({ x: 0, z: 0, radius: 1 });
    const position = { x: 0.3, z: 0 };
    const moved = world.resolve(position, 0.4);
    expect(moved).toBe(true);
    expect(Math.hypot(position.x, position.z)).toBeGreaterThanOrEqual(1.4 - 1e-6);

    const outside = { x: 10, z: 10 };
    expect(world.resolve(outside, 0.4)).toBe(false);
    expect(outside).toEqual({ x: 10, z: 10 });
  });
});
