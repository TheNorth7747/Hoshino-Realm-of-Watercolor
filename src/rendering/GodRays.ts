/**
 * 体积光束 / 丁达尔光柱（V0.3）。
 *
 * 还原参考视频 00:15～0:20 的林间斜向阳光光束：
 * - 单次 InstancedMesh 绘制（1 draw call），AdditiveBlending + depthWrite=false。
 * - 由 `uIntensity` 控制显现强度：开场线稿阶段为 0，花树绽放（finale）后柔亮浮现。
 */
import {
  AdditiveBlending,
  DoubleSide,
  InstancedMesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  type Scene,
} from "three";

const RAY_COUNT = 16;

const GOD_RAY_VERTEX = /* glsl */ `
varying vec2 vRayUv;
void main() {
  vRayUv = uv;
  vec4 localPos = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    localPos = instanceMatrix * localPos;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * localPos;
}
`;

const GOD_RAY_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vRayUv;

void main() {
  if (uIntensity <= 0.005) discard;

  // 横向柔边钟形衰减：边缘完全消融，无矩形硬边
  float across = sin(vRayUv.x * 3.14159265);
  across = across * across;

  // 纵向：顶部光晕偏强，落向地面逐渐消散
  float along = smoothstep(0.0, 0.28, vRayUv.y) * smoothstep(1.0, 0.3, vRayUv.y);

  // 光柱内部细微流动光丝
  float filament = 0.65 + 0.35 * sin(vRayUv.x * 16.0 + uTime * 0.35);
  float filament2 = 0.72 + 0.28 * cos(vRayUv.x * 9.0 - uTime * 0.22);

  float alpha = across * along * filament * filament2 * uIntensity * 0.14;
  if (alpha <= 0.002) discard;

  vec3 warmBeam = vec3(1.0, 0.955, 0.84);
  gl_FragColor = vec4(warmBeam * alpha, alpha);
}
`;

interface RayPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
  readonly yaw: number;
}

const DEFAULT_RAY_PLACEMENTS: readonly RayPlacement[] = [
  { x: -7.5, y: 8.5, z: 24, width: 4.4, height: 22, yaw: 0.25 },
  { x: 6.5, y: 9.0, z: 20, width: 4.8, height: 23, yaw: -0.22 },
  { x: -5.0, y: 8.5, z: 14, width: 3.8, height: 21, yaw: 0.42 },
  { x: 4.5, y: 9.0, z: 10, width: 5.0, height: 22, yaw: -0.18 },
  { x: -10.5, y: 8.8, z: 6, width: 4.5, height: 22, yaw: 0.12 },
  { x: 9.0, y: 9.2, z: 3, width: 5.2, height: 24, yaw: -0.35 },
  { x: -3.5, y: 8.6, z: -2, width: 4.2, height: 21, yaw: 0.28 },
  { x: 6.0, y: 9.0, z: -6, width: 4.6, height: 22, yaw: -0.24 },
  { x: -8.0, y: 9.0, z: -12, width: 5.0, height: 23, yaw: 0.32 },
  { x: 4.0, y: 9.4, z: -15, width: 4.4, height: 22, yaw: -0.14 },
  { x: -2.0, y: 9.2, z: 28, width: 4.6, height: 21, yaw: 0.16 },
  { x: 11.5, y: 9.0, z: 16, width: 5.2, height: 23, yaw: -0.3 },
  { x: -12.0, y: 9.2, z: 18, width: 4.6, height: 22, yaw: 0.36 },
  { x: 2.5, y: 8.8, z: 22, width: 3.6, height: 20, yaw: -0.1 },
  { x: -6.0, y: 9.5, z: -20, width: 4.8, height: 24, yaw: 0.22 },
  { x: 7.5, y: 9.5, z: -22, width: 5.0, height: 24, yaw: -0.28 },
];

export class GodRays {
  private scene: Scene | null = null;
  private mesh: InstancedMesh<PlaneGeometry, ShaderMaterial> | null = null;
  private intensity = 0;
  private time = 0;

  init(scene: Scene): void {
    if (this.mesh) return;
    this.scene = scene;

    const geometry = new PlaneGeometry(1, 1, 1, 1);
    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
      vertexShader: GOD_RAY_VERTEX,
      fragmentShader: GOD_RAY_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });

    const mesh = new InstancedMesh(geometry, material, RAY_COUNT);
    mesh.name = "v03-god-rays";
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    mesh.visible = false;

    const dummy = new Object3D();
    for (let i = 0; i < RAY_COUNT; i += 1) {
      const ray = DEFAULT_RAY_PLACEMENTS[i % DEFAULT_RAY_PLACEMENTS.length]!;
      dummy.position.set(ray.x, ray.y, ray.z);
      // 统一斜向右上方太阳方向（+X, +Y → -X, -Y）
      dummy.rotation.set(0.12, ray.yaw, -0.44);
      dummy.scale.set(ray.width, ray.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    scene.add(mesh);
    this.mesh = mesh;
  }

  /** 0 = 关闭，1 = 全量（随结局渐显）。 */
  setFinale(value: number): void {
    const next = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    this.intensity = next;
    if (!this.mesh) return;
    this.mesh.material.uniforms["uIntensity"]!.value = next;
    this.mesh.visible = next > 0.01;
  }

  update(deltaSeconds: number): void {
    if (!this.mesh || !this.mesh.visible) return;
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    this.time += dt;
    this.mesh.material.uniforms["uTime"]!.value = this.time;
  }

  get value(): number {
    return this.intensity;
  }

  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.scene?.remove(this.mesh);
      this.mesh = null;
    }
    this.scene = null;
  }
}
