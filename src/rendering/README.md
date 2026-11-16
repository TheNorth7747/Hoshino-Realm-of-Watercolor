# src/rendering/ — A1 世界染色与水彩渲染

> 需求：PRD 8.1 / 9.1 / 9.2 / 11.4；验收：AC-03、AC-04、AC-05。
> 本目录由 Agent 1 负责；其他 Agent 只读，材质通过 `createWatercolorMaterial()` 取用。

## 模块

| 文件 | 职责 |
|---|---|
| `maskMapping.ts` | 世界 XZ ↔ 遮罩 UV/像素的唯一映射（u 沿 +X、v 沿 +Z，纹理 `flipY=false`） |
| `MaskSurface.ts` | 绘制表面接口 + canvas 实现（reveal 层 / pulse 层 / 合成层、笔刷、覆盖率探针） |
| `ColorRevealMask.ts` | 遮罩策略：玩家笔刷步进、30Hz 脏更新、bloom 扩张、reset、dispose |
| `WatercolorMaterial.ts` | 共享 uniforms + 材质工厂 + shader 注入（世界坐标采样、线稿排线、纸纹） |
| `WatercolorPass.ts` | 轻量纸张后期（EffectComposer + ShaderPass），可 install/uninstall |
| `RevealSystem.ts` | GameSystem 挂载点（phase=`reveal`），事件接线、调试源、bench 生命周期 |
| `RevealBench.ts` | 仅调试用的验证台（地面 + 3 个物体 + L 形行走器），A3 接入后应关闭 |
| `RevealDebugView.ts` | `?debug=1` 的遮罩缩略图（含世界边界、节点触发圈、玩家点） |
| `devHarness.ts` | dev server 专用验证入口（不进构建产物），Playwright 用它起真实渲染 |
| `index.ts` | 公开出口 |

## 集成（由集成者改 main.ts，A1 不动共享文件）

```ts
import { RevealSystem } from "./rendering";

function createSystems(): GameSystem[] {
  return [new RevealSystem({ playerSource: playerController })]; // A2 的控制器实现 PlayerSource
}
```

A3 的场景材质：

```ts
const reveal = game.getSystem<RevealSystem>("reveal");
const material = createWatercolorMaterial({ color: 0x9ec98a, uniforms: reveal.revealUniforms });
```

所有可染色材质必须传**同一个** `revealUniforms` 对象，这是 AC-05「同一位置的地面/植被/水/花树使用相同世界遮罩」的实现方式。

## 关键数值

- 遮罩 512²；玩家笔刷 1.6m（PRD 1.4～1.8）；补笔步进 0.3m（PRD 0.25～0.35）；上传上限 30Hz。
- bloom 默认 1.1s，ease-out cubic，结束时写满永久 R 通道。
- 通道：R = 永久显色，G = 短暂脉冲，B 未用。

## 性能注意事项

- 只有 `dirty` 且累计时间 ≥ 1/30s 才 `composite()` + `needsUpdate`，静止时纹理版本号不增长。
- pulse 层每帧重算，但只在 flush 时做，绘制开销同样受 30Hz 限制。
- 覆盖率统计走 64² 探针，避免 `getImageData(0,0,512,512)` 造成 GPU stall。
- 后期 pass 用 8bit RT（LDR 场景不需要半浮点），并在 pass 里做 linear→sRGB 转换。

## 已知限制

- `WatercolorPass` 通过包装 `renderer.render` 接入后期（A0 的 `GameSystem` 没有渲染钩子）。包装是可逆的，`dispose()` 会恢复原方法。
- 排线用相机距离近似抗锯齿，没有用 `fwidth`（WebGL2 + GLSL1 下扩展行为不保证）。
- 场景亮度仍由 A0 的 `SceneScaffold` 决定；three r187 物理光照下方向光 1.5 偏暗，需要 A3 在正式场景里调。
