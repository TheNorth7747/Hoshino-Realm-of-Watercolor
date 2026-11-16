/**
 * 占位角色网格（A2）。
 *
 * 首版用程序化原创低模表达“红斗篷旅行者”（PRD 5.2 / 10）：
 * 组原点位于脚下中心、面朝 +Z（旋转 heading=0 时面向 +Z），
 * 满足 GLB 替换接口约定；斗篷轻摆等动画属于 P1。
 */
import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";

const CLOAK_COLOR = 0xa63a2b;
const INNER_COLOR = 0xf3efe4;
const SKIN_COLOR = 0xefe6d8;
const DARK_COLOR = 0x35302a;

export const PLAYER_PLACEHOLDER_NAME = "player-placeholder";

export function createPlayerPlaceholderMesh(): Group {
  const group = new Group();
  group.name = PLAYER_PLACEHOLDER_NAME;

  const cloakMaterial = new MeshStandardMaterial({
    color: CLOAK_COLOR,
    roughness: 0.95,
    flatShading: true,
  });
  const innerMaterial = new MeshStandardMaterial({
    color: INNER_COLOR,
    roughness: 0.95,
    flatShading: true,
  });
  const skinMaterial = new MeshStandardMaterial({
    color: SKIN_COLOR,
    roughness: 0.9,
    flatShading: true,
  });
  const darkMaterial = new MeshStandardMaterial({
    color: DARK_COLOR,
    roughness: 0.9,
    flatShading: true,
  });

  // 斗篷：锥体从脚下展开，罩住身体。
  const cloak = new Mesh(new ConeGeometry(0.42, 1.1, 8), cloakMaterial);
  cloak.name = "player-cloak";
  cloak.position.y = 0.55;

  // 下摆露出的白色内搭。
  const inner = new Mesh(new CylinderGeometry(0.24, 0.3, 0.42, 8), innerMaterial);
  inner.name = "player-inner";
  inner.position.y = 0.24;

  // 头部。
  const head = new Mesh(new SphereGeometry(0.17, 10, 8), skinMaterial);
  head.name = "player-head";
  head.position.y = 1.18;

  // 兜帽：稍向后仰，露出面部方向。
  const hood = new Mesh(new ConeGeometry(0.19, 0.32, 8), cloakMaterial);
  hood.name = "player-hood";
  hood.position.set(0, 1.34, -0.05);
  hood.rotation.x = -0.35;

  // 面部标记：让转向在镜头下可读。
  const face = new Mesh(new SphereGeometry(0.045, 6, 6), darkMaterial);
  face.name = "player-face";
  face.position.set(0, 1.18, 0.16);

  // 双脚。
  const footLeft = new Mesh(new SphereGeometry(0.07, 6, 6), darkMaterial);
  footLeft.name = "player-foot-left";
  footLeft.position.set(-0.12, 0.07, 0.02);
  const footRight = new Mesh(new SphereGeometry(0.07, 6, 6), darkMaterial);
  footRight.name = "player-foot-right";
  footRight.position.set(0.12, 0.07, 0.02);

  group.add(cloak, inner, head, hood, face, footLeft, footRight);
  return group;
}
