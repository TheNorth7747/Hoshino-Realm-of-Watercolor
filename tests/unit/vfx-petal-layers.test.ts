import { Color, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { PETAL_LAYERS, PETAL_OVERLAY_AREA_RATIO_CAP, PetalEmitter } from "../../src/effects/Petals";

/**
 * V0.2 花瓣分层（PRD 9.7 / 11.1 / V02_VISUAL_WORKFLOW 4.4）：
 * - 近/中/远景具有不同大小、旋转、横向风漂移、重力、生命周期与颜色。
 * - 总容量恒等于 capacity，透明叠加面积比受控（≤ 单层全尺寸基准）。
 * - 结局前分层渐次显现，UI 出现前世界与花瓣已被看见。
 * 只做自动结构/状态断言，不做逐像素断言（跨 GPU 不稳）。
 */

const fixedRandom = { next: () => 0.5 };

function specOf(id: "near" | "mid" | "far") {
  const spec = PETAL_LAYERS.find((entry) => entry.id === id);
  if (!spec) throw new Error(`缺少分层 ${id}`);
  return spec;
}

describe("PETAL_LAYERS 分层参数差异", () => {
  it("包含近/中/远三层，且每层大小、旋转、风、重力、生命周期互不相同", () => {
    expect(PETAL_LAYERS.map((layer) => layer.id)).toEqual(["near", "mid", "far"]);
    const near = specOf("near");
    const mid = specOf("mid");
    const far = specOf("far");

    // 近景大而重、落得快；远景小而淡、飘得远且久。
    expect(near.sizeScale).toBeGreaterThan(mid.sizeScale);
    expect(mid.sizeScale).toBeGreaterThan(far.sizeScale);
    expect(near.spinScale).toBeGreaterThan(mid.spinScale);
    expect(mid.spinScale).toBeGreaterThan(far.spinScale);
    expect(far.windScale).toBeGreaterThan(mid.windScale);
    expect(mid.windScale).toBeGreaterThan(near.windScale);
    expect(near.gravityScale).toBeGreaterThan(far.gravityScale);
    expect(far.lifetimeScale).toBeGreaterThan(near.lifetimeScale);
    expect(near.revealDelayMax).toBeLessThan(far.revealDelayMax);

    // 三层颜色互不相同（远景更淡，接近纸色）。
    const colors = new Set(PETAL_LAYERS.map((layer) => layer.color));
    expect(colors.size).toBe(3);
    const luminance = (hex: number): number => {
      const c = new Color(hex);
      return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    };
    expect(luminance(far.color)).toBeGreaterThan(luminance(near.color));
  });

  it("远景显现延迟上限 < 故事结局 UI 延迟 2.5s（世界先被看见）", () => {
    expect(specOf("far").revealDelayMax).toBeLessThan(2.5);
  });

  it("最长生命周期 ≤ 2.4s 游戏时间（不破坏 M4「7s 墙钟后全部回收」验收）", () => {
    // SwiftShader 低帧下 delta 截断到 0.05s，M4 的 7s 墙钟仅推进约 2.58s 游戏时间；
    // A5 原版靠高重力在约 1.5s 落地回收。V0.2 保留滞空观感，因此把生命周期上限
    // 压到 2.4s 游戏时间以内，既长于 A5 实际可见时长，又保证 M4 断言仍成立。
    for (const layer of PETAL_LAYERS) {
      expect(4 * layer.lifetimeScale * 1.25).toBeLessThanOrEqual(2.4);
      expect(layer.revealDelayMax).toBeLessThan(2.5); // UI 延迟窗口内必显现
    }
    // 三层仍有明确的生命周期差异（层次不退化）。
    expect(specOf("near").lifetimeScale).toBeLessThan(specOf("mid").lifetimeScale);
    expect(specOf("mid").lifetimeScale).toBeLessThan(specOf("far").lifetimeScale);
  });
});

describe("PetalEmitter 分层运行时", () => {
  it("burst 后三层同时有活跃粒子，总量不超过 capacity", () => {
    const emitter = new PetalEmitter({ capacity: 120, random: fixedRandom });
    const created = emitter.burst(new Vector3(0, 0, -22), 90);
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThanOrEqual(120);
    const counts = emitter.layerCounts;
    expect(counts.near).toBeGreaterThan(0);
    expect(counts.mid).toBeGreaterThan(0);
    expect(counts.far).toBeGreaterThan(0);
    expect(counts.near + counts.mid + counts.far).toBe(created);
    expect(emitter.counts.peak).toBeLessThanOrEqual(emitter.counts.capacity);
    emitter.dispose();
  });

  it("各层容量之和恒等于 capacity（含小容量边界）", () => {
    for (const capacity of [1, 2, 3, 7, 160]) {
      const emitter = new PetalEmitter({ capacity, random: fixedRandom });
      emitter.burst(new Vector3(), capacity * 3);
      const counts = emitter.layerCounts;
      expect(counts.near + counts.mid + counts.far).toBe(capacity);
      expect(emitter.counts.active).toBe(capacity);
      emitter.dispose();
    }
  });

  it("透明叠加面积比 ≤ 单层同容量全尺寸基准", () => {
    const emitter = new PetalEmitter({ capacity: 160, random: fixedRandom });
    emitter.burst(new Vector3(), 160);
    expect(emitter.overlayAreaRatio()).toBeLessThanOrEqual(PETAL_OVERLAY_AREA_RATIO_CAP);
    expect(emitter.estimatedOverlayArea()).toBeLessThanOrEqual(emitter.counts.capacity);
    emitter.dispose();
  });

  /** 以真实帧步长推进，避免单帧大 delta 触发落地回收而混淆生命周期验证。 */
  function advance(emitter: PetalEmitter, seconds: number): void {
    for (let t = 0; t < seconds; t += 0.05) emitter.update(0.05);
  }

  it("分层生命周期不同：远景存活更久", () => {
    const explicit = new PetalEmitter({ capacity: 90, lifetimeSeconds: 2, random: fixedRandom });
    explicit.burst(new Vector3(), 90);
    const before = explicit.layerCounts;
    expect(before.near + before.mid + before.far).toBe(90);
    // 显式 lifetime 保持 A5 统一语义：三层在同一时刻全部回收。
    advance(explicit, 3);
    expect(explicit.counts.active).toBe(0);
    explicit.dispose();

    // 默认（未显式指定 lifetime）时按层缩放：近景先回收、远景仍存活。
    const layered = new PetalEmitter({
      capacity: 90,
      gravity: 0,
      windSpeed: 0,
      random: fixedRandom,
    });
    layered.burst(new Vector3(), 90);
    advance(layered, 1.6);
    const remaining = layered.layerCounts;
    expect(remaining.far).toBeGreaterThan(remaining.near);
    expect(remaining.near).toBe(0);
    layered.dispose();
  });

  it("渐次显现：初期部分实例隐藏，随后全部显现（不回收、不改变池占用）", () => {
    const emitter = new PetalEmitter({
      capacity: 90,
      gravity: 0,
      windSpeed: 0,
      random: fixedRandom,
    });
    emitter.burst(new Vector3(), 90);
    const total = emitter.counts.active;
    const m = new Matrix4();
    // 第一列长度即该实例的缩放（与旋转无关）；隐藏实例缩放为 0。
    const visibleCount = (): number => {
      let visible = 0;
      for (let i = 0; i < emitter.capacity; i += 1) {
        emitter.mesh.getMatrixAt(i, m);
        const e = m.elements;
        const scale = Math.hypot(e[0] ?? 0, e[1] ?? 0, e[2] ?? 0);
        if (scale > 1e-4) visible += 1;
      }
      return visible;
    };

    // 近景延迟 0.15s、远景 1.4s：0.1s 时只有近/中层的一部分显现。
    emitter.update(0.1);
    const early = visibleCount();
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(total);
    expect(emitter.counts.active).toBe(total);
    expect(emitter.counts.reclaimed).toBe(0);

    advance(emitter, 0.8);
    expect(emitter.layerCounts.far).toBeGreaterThan(0);
    expect(visibleCount()).toBeGreaterThan(early);
    emitter.dispose();
  });

  it("横向风漂移：远景 X 位移大于近景", () => {
    const emitter = new PetalEmitter({
      capacity: 2,
      windSpeed: 3,
      gravity: 0,
      random: fixedRandom,
      layers: [
        {
          ...specOf("near"),
          share: 0.5,
          windScale: 0.2,
          spawnRadius: 0,
          heightMin: 5,
          heightMax: 5,
          revealDelayMax: 0,
        },
        {
          ...specOf("mid"),
          id: "far" as const,
          share: 0.5,
          windScale: 2,
          spawnRadius: 0,
          heightMin: 5,
          heightMax: 5,
          revealDelayMax: 0,
        },
      ],
    });
    emitter.burst(new Vector3(), 2);
    emitter.update(0.5);
    // 通过 instanceMatrix 读取两个实例的平移 X（索引 0 = near，1 = far）。
    const matrix = new Matrix4();
    emitter.mesh.getMatrixAt(0, matrix);
    const nearX = matrix.elements[12] ?? 0;
    emitter.mesh.getMatrixAt(1, matrix);
    const farX = matrix.elements[12] ?? 0;
    expect(farX).toBeGreaterThan(nearX);
    emitter.dispose();
  });

  it("终端速度：结局 UI 延迟窗口内花瓣仍停留在空中（不穿地被遮挡）", () => {
    const emitter = new PetalEmitter({ capacity: 90, random: fixedRandom });
    emitter.burst(new Vector3(0, 0, -22), 90);
    for (let t = 0; t < 1.2; t += 0.05) emitter.update(0.05);
    const m = new Matrix4();
    let aboveGround = 0;
    let visible = 0;
    for (let i = 0; i < emitter.capacity; i += 1) {
      emitter.mesh.getMatrixAt(i, m);
      const e = m.elements;
      const scale = Math.hypot(e[0] ?? 0, e[1] ?? 0, e[2] ?? 0);
      if (scale <= 1e-4) continue;
      visible += 1;
      if ((e[13] ?? 0) > 0.3) aboveGround += 1;
    }
    expect(visible).toBeGreaterThan(0);
    // 绝大多数显现的花瓣仍在地面之上，镜头里看得见。
    expect(aboveGround / visible).toBeGreaterThan(0.8);
    expect(emitter.counts.active).toBeGreaterThan(0);
    emitter.dispose();
  });

  it("clear / reset 语义不变，dispose 幂等", () => {
    const emitter = new PetalEmitter({ capacity: 60, random: fixedRandom });
    emitter.burst(new Vector3(), 60);
    expect(emitter.counts.active).toBe(60);
    emitter.clear();
    expect(emitter.counts.active).toBe(0);
    expect(emitter.layerCounts.near + emitter.layerCounts.mid + emitter.layerCounts.far).toBe(0);
    emitter.dispose();
    emitter.dispose();
    expect(emitter.isDisposed).toBe(true);
    expect(emitter.burst(new Vector3(), 10)).toBe(0);
  });
});
