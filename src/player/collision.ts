/**
 * 基础碰撞（A2，PRD 9.3 / 4.3）。
 *
 * 首版不引入物理引擎：只用“圆形碰撞体 + 推出滑动”解决大型树木等障碍。
 * A3 场景通过 PlayerController.getColliders() 注册圆形碰撞体；
 * 地图边界不在本文件——统一使用 config/world.ts 的 clampToWorldBounds，
 * 玩家更新顺序为“先推出障碍、再夹回边界”，保证永不穿出地图。
 */

export interface CollisionCircle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface ResolvedPoint {
  readonly x: number;
  readonly z: number;
}

/** 单个圆的推出量：若重叠，返回沿连线方向的位移向量。 */
export function circlePushOut(
  px: number,
  pz: number,
  playerRadius: number,
  circle: CollisionCircle,
): { dx: number; dz: number } | null {
  const minDist = playerRadius + circle.radius;
  const dx = px - circle.x;
  const dz = pz - circle.z;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) return null;

  if (distSq <= 1e-12) {
    // 玩家圆心与障碍圆心重合：沿 +X 推出，避免死锁在原点。
    return { dx: minDist, dz: 0 };
  }
  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / dist;
  return { dx: dx * push, dz: dz * push };
}

/** 对一组圆依次推出（多次迭代让角落也稳定）。 */
export function resolveCircleCollisions(
  px: number,
  pz: number,
  playerRadius: number,
  circles: readonly CollisionCircle[],
  iterations = 2,
): ResolvedPoint {
  let x = px;
  let z = pz;
  for (let i = 0; i < iterations; i += 1) {
    let moved = false;
    for (const circle of circles) {
      const push = circlePushOut(x, z, playerRadius, circle);
      if (push) {
        x += push.dx;
        z += push.dz;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

/** 障碍注册表。A3 在场景构建时调用 add；game:reset 时可 clear。 */
export class CollisionWorld {
  private circles: CollisionCircle[] = [];

  add(circle: CollisionCircle): void {
    if (!Number.isFinite(circle.x) || !Number.isFinite(circle.z) || circle.radius <= 0) return;
    this.circles.push(circle);
  }

  addAll(circles: readonly CollisionCircle[]): void {
    for (const circle of circles) this.add(circle);
  }

  remove(circle: CollisionCircle): void {
    const index = this.circles.indexOf(circle);
    if (index >= 0) this.circles.splice(index, 1);
  }

  clear(): void {
    this.circles.length = 0;
  }

  get count(): number {
    return this.circles.length;
  }

  get all(): readonly CollisionCircle[] {
    return this.circles;
  }

  /** 解算玩家位置（XZ），返回是否发生位移。 */
  resolve(position: { x: number; z: number }, playerRadius: number): boolean {
    const before = { x: position.x, z: position.z };
    const resolved = resolveCircleCollisions(position.x, position.z, playerRadius, this.circles);
    position.x = resolved.x;
    position.z = resolved.z;
    return resolved.x !== before.x || resolved.z !== before.z;
  }
}
