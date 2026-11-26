/**
 * 原创红斗篷旅行者（V0.2 / V0.3 柔光圆润与接触阴影升级）。
 *
 * - 全部程序化低模，不依赖外部资产；去掉 flatShading 硬棱角，呈现柔和绘本立体感。
 * - 原点位于脚下中心（y=0 为地面），面朝 +Z。
 * - 底部新增半透明接触柔影圆盘 `hero-shadow`，随跳跃离地轻微缩放淡出。
 */
import {
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from "three";
import type { Material, MeshStandardMaterialParameters } from "three";

export const HERO_NAME = "player-hero";
export const PLAYER_PLACEHOLDER_NAME = "player-placeholder";
export const HERO_HEIGHT = 1.44;
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
  | "hero-shadow"
  | "hero-body";

export interface HeroParts {
  readonly root: Group;
  readonly body: Group;
  readonly head: Group;
  readonly cloak: Group;
  readonly armLeft: Group;
  readonly armRight: Group;
  readonly legLeft: Group;
  readonly legRight: Group;
  readonly basket: Group;
  readonly shadow: Mesh;
  readonly materials: readonly Material[];
}

function standard(params: MeshStandardMaterialParameters): MeshStandardMaterial {
  return new MeshStandardMaterial({ roughness: 0.86, flatShading: false, ...params });
}

export function createHeroMesh(): HeroParts {
  const root = new Group();
  root.name = PLAYER_PLACEHOLDER_NAME;
  root.userData["heroName"] = HERO_NAME;

  const cloakMaterial = standard({ color: HERO_COLORS.cloak });
  const cloakDarkMaterial = standard({ color: HERO_COLORS.cloakDark });
  const innerMaterial = standard({ color: HERO_COLORS.inner });
  const skinMaterial = standard({ color: HERO_COLORS.skin, roughness: 0.82 });
  const leggingMaterial = standard({ color: HERO_COLORS.legging });
  const bootMaterial = standard({ color: HERO_COLORS.boot });
  const basketMaterial = standard({ color: HERO_COLORS.basket });
  const shadowMaterial = new MeshBasicMaterial({
    color: 0x262018,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const materials: Material[] = [
    cloakMaterial,
    cloakDarkMaterial,
    innerMaterial,
    skinMaterial,
    leggingMaterial,
    bootMaterial,
    basketMaterial,
    shadowMaterial,
  ];

  // ---- 接触柔影（脚底圆盘） ----
  const shadowGeo = new CircleGeometry(0.32, 18);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new Mesh(shadowGeo, shadowMaterial);
  shadow.name = "hero-shadow";
  shadow.position.y = 0.025;
  root.add(shadow);

  // ---- 身体 ----
  const body = new Group();
  body.name = "hero-body";
  body.scale.setScalar(HERO_MODEL_SCALE);
  root.add(body);

  // ---- 双腿 ----
  const makeLeg = (side: -1 | 1, label: "left" | "right"): Group => {
    const hip = new Group();
    hip.name = `hero-leg-${label}`;
    hip.position.set(side * 0.085, 0.5, 0);
    const thigh = new Mesh(new CylinderGeometry(0.055, 0.05, 0.34, 10), leggingMaterial);
    thigh.name = `hero-legging-${label}`;
    thigh.position.y = -0.17;
    const boot = new Mesh(new CylinderGeometry(0.058, 0.066, 0.18, 10), bootMaterial);
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

  // ---- 白色内搭裙摆 ----
  const skirt = new Mesh(new CylinderGeometry(0.19, 0.25, 0.26, 14), innerMaterial);
  skirt.name = "hero-skirt";
  skirt.position.y = 0.62;
  body.add(skirt);

  // ---- 躯干 ----
  const torso = new Mesh(new CylinderGeometry(0.16, 0.19, 0.42, 14), cloakMaterial);
  torso.name = "hero-torso";
  torso.position.y = 0.86;
  body.add(torso);

  // ---- 斗篷：分两层（外摆 + 内衬） ----
  const cloak = new Group();
  cloak.name = "hero-cloak";
  cloak.position.y = 1.0;
  const cloakOuter = new Mesh(new CylinderGeometry(0.2, 0.35, 0.57, 16, 1, true), cloakMaterial);
  cloakOuter.name = "hero-cloak-outer";
  cloakOuter.position.y = -0.285;
  cloakOuter.material.side = 2;
  const cloakInner = new Mesh(
    new CylinderGeometry(0.17, 0.31, 0.51, 16, 1, true),
    cloakDarkMaterial,
  );
  cloakInner.name = "hero-cloak-inner";
  cloakInner.position.y = -0.275;
  cloakInner.material.side = 2;
  cloak.add(cloakOuter, cloakInner);
  body.add(cloak);

  // ---- 手臂 ----
  const makeArm = (side: -1 | 1, label: "left" | "right"): Group => {
    const shoulder = new Group();
    shoulder.name = `hero-arm-${label}`;
    shoulder.position.set(side * 0.2, 1.0, 0);
    const upper = new Mesh(new CylinderGeometry(0.045, 0.042, 0.24, 10), cloakMaterial);
    upper.name = `hero-arm-${label}-upper`;
    upper.position.y = -0.12;
    const cuff = new Mesh(new CylinderGeometry(0.05, 0.05, 0.06, 10), innerMaterial);
    cuff.name = `hero-arm-${label}-cuff`;
    cuff.position.y = -0.25;
    const hand = new Mesh(new SphereGeometry(0.045, 10, 8), skinMaterial);
    hand.name = `hero-hand-${label}`;
    hand.position.y = -0.3;
    shoulder.add(upper, cuff, hand);
    body.add(shoulder);
    return shoulder;
  };
  const armLeft = makeArm(-1, "left");
  const armRight = makeArm(1, "right");

  // ---- 头与兜帽 ----
  const head = new Group();
  head.name = "hero-head";
  head.position.y = 1.16;
  const face = new Mesh(new SphereGeometry(0.105, 14, 12), skinMaterial);
  face.name = "hero-face";
  face.position.z = 0.02;
  const hood = new Mesh(
    new SphereGeometry(0.148, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.72),
    cloakMaterial,
  );
  hood.name = "hero-hood";
  hood.position.set(0, 0.02, -0.015);
  hood.rotation.x = -0.12;
  const brim = new Mesh(new TorusGeometry(0.115, 0.028, 10, 18), cloakDarkMaterial);
  brim.name = "hero-hood-brim";
  brim.position.set(0, 0.015, 0.045);
  brim.rotation.x = Math.PI * 0.52;
  brim.scale.set(1, 1, 0.8);
  const tip = new Mesh(new SphereGeometry(0.075, 12, 10), cloakMaterial);
  tip.name = "hero-hood-tip";
  tip.position.set(0, 0.1, -0.09);
  tip.scale.set(1, 0.85, 1.15);
  head.add(face, hood, brim, tip);
  body.add(head);

  // ---- 小篮 ----
  const basket = new Group();
  basket.name = "hero-basket";
  basket.position.set(-0.24, 0.62, 0.06);
  const basketBody = new Mesh(new CylinderGeometry(0.075, 0.06, 0.1, 12), basketMaterial);
  basketBody.name = "hero-basket-body";
  const basketHandle = new Mesh(new TorusGeometry(0.055, 0.012, 8, 14, Math.PI), basketMaterial);
  basketHandle.name = "hero-basket-handle";
  basketHandle.position.y = 0.05;
  basket.add(basketBody, basketHandle);
  body.add(basket);

  return {
    root,
    body,
    head,
    cloak,
    armLeft,
    armRight,
    legLeft,
    legRight,
    basket,
    shadow,
    materials,
  };
}

export function createPlayerPlaceholderMesh(): Group {
  return createHeroMesh().root;
}
