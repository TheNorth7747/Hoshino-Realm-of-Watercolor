/**
 * 原创红斗篷旅行者（V0.2 角色升级，PRD 5.2 / 10）。
 *
 * 全部程序化低模，不依赖外部资产。参考帧（只作视觉对照，不复制其资产）显示：
 * 圆润深红兜帽、A 字形斗篷及膝、白色内搭裙摆露在斗篷下缘、
 * 白色袖口、浅色裤袜 + 深棕短靴，左手挎一只小篮。
 *
 * 结构约定（与 A2 契约兼容）：
 * - 组原点位于**脚下中心**（y=0 为地面），面朝 +Z（heading=0 时面向 +Z）。
 * - 角色总高约 1.36m，碰撞半径 0.4m 不变（PRD 10：角色原点在脚下中心）。
 * - 所有可动部件命名为 `hero-<part>`，由 HeroRig 按需驱动变换；
 *   本文件只负责建模与初始姿态，不含动画逻辑。
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { Material, MeshStandardMaterialParameters } from "three";

/** 角色组名（PlayerController 与测试用它定位）。 */
export const HERO_NAME = "player-hero";
/**
 * 兼容旧占位模型的对外名称：A2/A6 的测试与世界逻辑按此名查找玩家网格，
 * V0.2 换模型后保持同一名称，避免触碰其他模块与既有断言。
 */
export const PLAYER_PLACEHOLDER_NAME = "player-placeholder";

/**
 * 角色标准身高（米）。构图验算：默认镜头 5m/0.24rad/前看 1.6m 时，
 * 1.44m 身高对应约 29% 屏高（目标 25%～32%，参考帧 30%～33%）。
 */
export const HERO_HEIGHT = 1.44;
/** 建模基准身高（米）：几何体按此尺寸建模，再整体缩放到 HERO_HEIGHT。 */
const HERO_MODEL_BASE_HEIGHT = 1.36;
const HERO_MODEL_SCALE = HERO_HEIGHT / HERO_MODEL_BASE_HEIGHT;

export const HERO_COLORS = Object.freeze({
  cloak: 0xb4342a,
  cloakDark: 0x8e2620,
  inner: 0xf6f1e6,
  skin: 0xefdcc4,
  hair: 0x3a2b24,
  legging: 0xe8e0d2,
  boot: 0x4a3527,
  basket: 0xb98a4b,
});

export type HeroPartName =
  | "hero-hood"
  | "hero-head"
  | "hero-torso"
  | "hero-cloak"
  | "hero-skirt"
  | "hero-arm-left"
  | "hero-arm-right"
  | "hero-hand-left"
  | "hero-leg-left"
  | "hero-leg-right"
  | "hero-boot-left"
  | "hero-boot-right"
  | "hero-basket"
  | "hero-body";

/** 角色骨架引用：动画系统只操作这些节点，不遍历场景图。 */
export interface HeroParts {
  readonly root: Group;
  /** 整个上半身（兜帽/头/躯干/斗篷/手臂）的父节点：用于起伏与前倾。 */
  readonly body: Group;
  readonly head: Group;
  readonly cloak: Group;
  readonly armLeft: Group;
  readonly armRight: Group;
  readonly legLeft: Group;
  readonly legRight: Group;
  readonly basket: Group;
  readonly materials: readonly Material[];
}

function standard(params: MeshStandardMaterialParameters): MeshStandardMaterial {
  return new MeshStandardMaterial({ roughness: 0.9, flatShading: true, ...params });
}

export function createHeroMesh(): HeroParts {
  const root = new Group();
  // 根节点名保持 A2/A6 既有断言使用的 `player-placeholder`（测试按名查找玩家网格），
  // V0.2 身份另存于 userData 与子节点命名，不改变其他模块的查找方式。
  root.name = PLAYER_PLACEHOLDER_NAME;
  root.userData["heroName"] = HERO_NAME;

  const cloakMaterial = standard({ color: HERO_COLORS.cloak });
  const cloakDarkMaterial = standard({ color: HERO_COLORS.cloakDark });
  const innerMaterial = standard({ color: HERO_COLORS.inner });
  const skinMaterial = standard({ color: HERO_COLORS.skin, roughness: 0.85 });
  const leggingMaterial = standard({ color: HERO_COLORS.legging });
  const bootMaterial = standard({ color: HERO_COLORS.boot });
  const basketMaterial = standard({ color: HERO_COLORS.basket });
  const materials = [
    cloakMaterial,
    cloakDarkMaterial,
    innerMaterial,
    skinMaterial,
    leggingMaterial,
    bootMaterial,
    basketMaterial,
  ];

  // ---- 身体（起伏/前倾的父节点，原点在脚下）----
  const body = new Group();
  body.name = "hero-body";
  // 几何按 HERO_MODEL_BASE_HEIGHT 建模，整体缩放到对外声明的 HERO_HEIGHT。
  // 缩放作用于 body（原点在脚下），因此脚底仍在 y=0，碰撞与快照契约不受影响。
  body.scale.setScalar(HERO_MODEL_SCALE);
  root.add(body);

  // ---- 双腿：裤袜 + 短靴，髋部为枢轴（腿摆动绕 X 轴）----
  const makeLeg = (side: -1 | 1, label: "left" | "right"): Group => {
    const hip = new Group();
    hip.name = `hero-leg-${label}`;
    hip.position.set(side * 0.085, 0.5, 0);
    const thigh = new Mesh(new CylinderGeometry(0.055, 0.05, 0.34, 7), leggingMaterial);
    thigh.name = `hero-legging-${label}`;
    thigh.position.y = -0.17;
    const boot = new Mesh(new CylinderGeometry(0.058, 0.066, 0.18, 8), bootMaterial);
    boot.name = `hero-boot-${label}`;
    boot.position.y = -0.42;
    const toe = new Mesh(new BoxGeometry(0.1, 0.06, 0.15), bootMaterial);
    toe.name = `hero-toe-${label}`;
    toe.position.set(0, -0.49, 0.035);
    hip.add(thigh, boot, toe);
    body.add(hip);
    return hip;
  };
  const legLeft = makeLeg(-1, "left");
  const legRight = makeLeg(1, "right");

  // ---- 白色内搭裙摆：露在斗篷下缘，形成层次 ----
  const skirt = new Mesh(new CylinderGeometry(0.19, 0.24, 0.26, 10), innerMaterial);
  skirt.name = "hero-skirt";
  skirt.position.y = 0.62;
  body.add(skirt);

  // ---- 躯干：略收腰的圆柱，承托斗篷 ----
  const torso = new Mesh(new CylinderGeometry(0.16, 0.19, 0.42, 10), cloakMaterial);
  torso.name = "hero-torso";
  torso.position.y = 0.86;
  body.add(torso);

  // ---- 斗篷：分两层（外摆 + 内衬），每帧由 HeroRig 做滞后摆动 ----
  const cloak = new Group();
  cloak.name = "hero-cloak";
  cloak.position.y = 1.0; // 肩部为摆动枢轴
  const cloakOuter = new Mesh(new CylinderGeometry(0.2, 0.34, 0.56, 10, 1, true), cloakMaterial);
  cloakOuter.name = "hero-cloak-outer";
  cloakOuter.position.y = -0.28;
  cloakOuter.material.side = 2; // DoubleSide：开口斗篷从背面也可见
  const cloakInner = new Mesh(new CylinderGeometry(0.17, 0.3, 0.5, 10, 1, true), cloakDarkMaterial);
  cloakInner.name = "hero-cloak-inner";
  cloakInner.position.y = -0.27;
  cloakInner.material.side = 2;
  cloak.add(cloakOuter, cloakInner);
  body.add(cloak);

  // ---- 手臂：肩部枢轴，摆臂绕 X 轴；白色袖口 + 手掌 ----
  const makeArm = (side: -1 | 1, label: "left" | "right"): Group => {
    const shoulder = new Group();
    shoulder.name = `hero-arm-${label}`;
    shoulder.position.set(side * 0.2, 1.0, 0);
    const upper = new Mesh(new CylinderGeometry(0.045, 0.042, 0.24, 7), cloakMaterial);
    upper.name = `hero-arm-${label}-upper`;
    upper.position.y = -0.12;
    const cuff = new Mesh(new CylinderGeometry(0.05, 0.05, 0.06, 8), innerMaterial);
    cuff.name = `hero-arm-${label}-cuff`;
    cuff.position.y = -0.25;
    const hand = new Mesh(new SphereGeometry(0.045, 8, 6), skinMaterial);
    hand.name = `hero-hand-${label}`;
    hand.position.y = -0.3;
    shoulder.add(upper, cuff, hand);
    body.add(shoulder);
    return shoulder;
  };
  const armLeft = makeArm(-1, "left");
  const armRight = makeArm(1, "right");

  // ---- 头与兜帽：圆润兜帽（球体切半 + 帽檐圆环），面部朝向 +Z ----
  const head = new Group();
  head.name = "hero-head";
  head.position.y = 1.16;
  const face = new Mesh(new SphereGeometry(0.105, 12, 10), skinMaterial);
  face.name = "hero-face";
  face.position.z = 0.02;
  const hood = new Mesh(
    new SphereGeometry(0.145, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.72),
    cloakMaterial,
  );
  hood.name = "hero-hood";
  hood.position.set(0, 0.02, -0.015);
  hood.rotation.x = -0.12;
  // 帽檐：斜置圆环，形成参考帧里兜帽前缘的柔和开口。
  const brim = new Mesh(new TorusGeometry(0.115, 0.028, 8, 16), cloakDarkMaterial);
  brim.name = "hero-hood-brim";
  brim.position.set(0, 0.015, 0.045);
  brim.rotation.x = Math.PI * 0.52;
  brim.scale.set(1, 1, 0.8);
  // 兜帽尖：向后上方的小锥形，避免正圆球头感。
  const tip = new Mesh(new SphereGeometry(0.075, 8, 6), cloakMaterial);
  tip.name = "hero-hood-tip";
  tip.position.set(0, 0.1, -0.09);
  tip.scale.set(1, 0.85, 1.15);
  head.add(face, hood, brim, tip);
  body.add(head);

  // ---- 小篮（左手，参考帧可读道具；不影响碰撞与交互）----
  const basket = new Group();
  basket.name = "hero-basket";
  basket.position.set(-0.24, 0.62, 0.06);
  const basketBody = new Mesh(new CylinderGeometry(0.075, 0.06, 0.1, 10), basketMaterial);
  basketBody.name = "hero-basket-body";
  const basketHandle = new Mesh(new TorusGeometry(0.055, 0.012, 6, 12, Math.PI), basketMaterial);
  basketHandle.name = "hero-basket-handle";
  basketHandle.position.y = 0.05;
  basket.add(basketBody, basketHandle);
  body.add(basket);

  return { root, body, head, cloak, armLeft, armRight, legLeft, legRight, basket, materials };
}

/** 兼容 A2 导出名：旧的 `createPlayerPlaceholderMesh()` 现返回 V0.2 角色。 */
export function createPlayerPlaceholderMesh(): Group {
  return createHeroMesh().root;
}
