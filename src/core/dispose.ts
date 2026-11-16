/**
 * 场景资源释放工具（A0）。所有模块在 dispose 时调用，避免 GPU 资源泄漏（PRD 7.3 / 11.1）。
 */
import { Texture } from "three";
import type { Material, Mesh, Object3D } from "three";

export function disposeMaterial(material: Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value instanceof Texture) value.dispose();
  }
  material.dispose();
}

/** 递归释放 geometry / material / texture，并从父节点摘除。 */
export function disposeObject3D(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Partial<Mesh>;
    const geometry = mesh.geometry;
    if (geometry) geometry.dispose();

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) disposeMaterial(entry);
    } else if (material) {
      disposeMaterial(material);
    }
  });

  root.removeFromParent();
  root.clear();
}
