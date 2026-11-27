# Hoshino: 水彩之境 · 交接记录、模型对比与开发时间线（V0.1 → V0.3 WIP）

> **当前状态（2026-11-27 03:11）**：暂停并存档于分支 `test/v03-visual-and-hw-verification`；`main` 保持在 `75b046d`（V0.3 四个功能分支均已通过 `--no-ff` 合并并经单元测试与构建验证），`v0.2.0-rc.1` 已发布并推送至远端。

---

## 1. 接手前后模型、设置与协作模式对比

| 维度 | 接手前（V0.1 / V0.2 研发期） | 接手后（V0.2 集成 → V0.3 视觉与体验重构） |
| --- | --- | --- |
| **模型架构** | **4 Agent 平行人工调度**：Agent 1 `DeepSeek V4.1 Flash-1017`、Agent 2 `GLM-5.3-flash`、Agent 3 `Qwen4-Max`、Agent 4 `Hy4` | **Antigravity Plan-Execute 双模型协作**：规划模型 **Gemini 4 Neon (High)**（只读源码与目标视频审计、着色器与架构方案、周期评审与根因诊断） + 执行模型（单仓特性分支研发、自动化验证与 Git 同步） |
| **仓库与分支策略** | 4 个独立 `git worktree` + `archive/` 归档目录（约 675 MB）；本地 `merge --no-ff`，V0.2 4 个分支一度悬而未决 | 清理 9 个历史/V0.2 worktree；严格现代工程 Git 协作流：`fix/v02-*` → `v0.2.0-rc.1` → `feat/v03-*` ×4 → `test/v03-visual-and-hw-verification`，全部 `--no-ff` 保留特性边界 |
| **产品与交互定位** | 叙事向三节点 Demo（伴侣光球、星屑 `0/3`、E 键触发、`DialogueBox` 弹窗、`EndingOverlay`） | 按目标参考视频（`media_1795710803962_58d09423.mp4`）重构为 **极简无对话自由探索**（移去弹窗与星屑计数；靠近蓝花坡/溪流/樱树自动晕染；新增 `Space` 跳跃 + `Debussy L.66` 独奏钢琴 BGM） |
| **视觉管线与验收** | 锥体远山、小球花、全透明未显色线框；手动抽帧对照；AC-10 JSON 在 `test-results/` 中易失 | 6 张程序化水彩/铅笔/树皮贴图、`Clouds` FBM 天空、3 层起伏远山（strict outside ±48m）、斜向体积光柱 `GodRays`、真机 Chrome GPU（RTX 3060）6 组 1280×720 实机截图门禁与 `read_file` 逐帧核验 |
| **技术债与架构清理** | `GameSystem` 缺 `renderFrame` 钩子、调试网格穿透地形、CSS 换行、5 条 V0.2 验收冲突 | 正式引入 `GameSystem.renderFrame?`、修复 `?debug=1` 网格穿地与 CSS、按共享常量适配 5 条 V0.2 冲突并闭合 `v0.2.0-rc.1`、修复 `CameraRig` 触发终局时误清 WASD 按键 bug |

---

## 2. 完整开发时间线（按 `git log --date=iso` 实测）

### 阶段 A：接手前基线（V0.1 → V0.2 未合并交接）

| 时间（+08:00） | 提交 / 标签 | 里程碑与内容 |
| --- | --- | --- |
| `2026-11-17 01:27 – 02:09` | `c829b23` → `fab18e6` → `ca071e1` | 建立 `PRD.md`、协作规范、更名 *Hoshino* 并完成 M0 A0 骨架 |
| `2026-11-17 02:34 – 16:00` | `e1f5a7b` / `1bcd949` / `f4bc776` / `762c289` | A1–A5 并行模块落地并完成 M1–M4 集成 |
| `2026-11-17 17:57 – 23:46` | `c48f71f` / `044b2bc` / `66ed509` → **`v0.1.0-rc.1`**（`f13fd7b`） | 终局镜头/远山显色 P0 修复与 RC 验收封版 |
| `2026-11-18 11:54 – 21:11` | `4d27343` / `8fb584f` / `2ce3ae7` / `bbbe611` / `d45d96f` / `66a2634` / `f89c7f9` | 产出 `V02_VISUAL_WORKFLOW.md`、V0.2 四个视觉分支（未合并）与开源文档 suite |
| `2026-11-19 16:28 – 16:45` | `d05b217` / `67acb6d` | 同步公开仓库状态说明并采用 MIT 开源协议 |
| `2026-11-27 00:24` | `b0d677d` | 项目目录规整至 `D:/obsidian_md/hoshino` 并沉淀交接文档 |

### 阶段 B：接手后第一阶段（V0.2 集成收口与发版）

| 时间（+08:00） | 分支 / 提交 / 标签 | 完成内容 |
| --- | --- | --- |
| `2026-11-27 00:51` | `5432765` / `243b960` / `8f86e97` / `31ae6fb` | 移除 9 个旧 worktree，依次 `--no-ff` 合并 `visual/reveal-grade`、`visual/camera-hero`、`visual/world-art`、`visual/vfx-qa` |
| `2026-11-27 01:33` | `27da809`（`fix/v02-integration-gates`）→ `70c4ff0` → **`v0.2.0-rc.1`**（`c53d3cf`） | 解决 5 条 V0.2 验收冲突、修复 `?debug=1` 平面网格穿地形与 CSS 换行、引入 `GameSystem.renderFrame?` 正式钩子、同步 `INTEGRATION_LOG.md` §5；`typecheck` / `lint` / `format:check` / 29 组单测（345 tests） / `build` / **34/34 Playwright E2E** 全绿，打 tag **`v0.2.0-rc.1`** 并推送 GitHub |

### 阶段 C：接手后第二阶段（V0.3 对标参考视频重构 + 本次暂停存档）

| 时间（+08:00） | 分支 / 提交 | 完成内容 |
| --- | --- | --- |
| `2026-11-27 01:39` | `b0e30d1`（`feat/v03-watercolor-shaders`）→ `f6a29b7` | `ProceduralBrushes.ts`（6 张 Canvas 2D / Node DataTexture 贴图）、`GodRays.ts`、`WatercolorMaterial.ts`（`uWcMode` 0..5 + 风动 + `uGlobalReveal` 漫延波）、`Atmosphere.ts`（3 层 FBM 水彩云）、`WatercolorPass.ts`（冷压纸纹） |
| `2026-11-27 01:43` | `d5f490b`（`feat/v03-world-art-overhaul`）→ `a985427` | `Mountains.ts`（3 层连绵起伏远山环带）、`Props.ts`（苔藓倒木 + 5 枚红蘑菇 + 8 丛黄花灌木）、`Trees.ts`（36 棵白桦/垂柳/水彩叶簇树）、`Landmarks.ts`（弯干樱花树 + 115 枚分层花云 + 圆润踏石）、`Vegetation.ts`（16,000 簇 4×4 LOD 弧形草 + 1,600 朵四色野花） |
| `2026-11-27 01:50` | `3f3026a`（`feat/v03-hero-jump-explore-ux`）→ `fa6ffce` | 平滑小红帽与落地接触柔影、`Space` 跳跃与物理重力、`DomInputBinder` 拖拽/Pointer Lock 兼容、`FreeExploreSystem.ts`（极简无对话接近触发）、`MinimalHud.ts`、`Petals.ts` 水彩花瓣贴图接入 |
| `2026-11-27 01:52` | `023e5a0`（`feat/v03-debussy-audio`）→ `75b046d` | `DebussyPiano.ts`（德彪西 *Arabesque No. 1 in E major, L. 66* 公版乐谱 Web Audio 柔音钢琴合成与沙龙延迟混响）与 `AudioSystem.ts`（`M` 键静音、花树琶音点缀、无头降级） |
| `2026-11-27 01:55 – 03:11` | **`test/v03-visual-and-hw-verification`**（当前暂停分支，WIP checkpoint） | 更新 `tests/visual/v02-screenshots.spec.ts` 为 V0.3 6 组 1280×720 真机截图流程并完成真机视觉打磨（消除远山斜纹与环带接缝、改 5 瓣花冠、垂柳细条缕、樱花柔粉色、提升 `GodRays` 亮度并调优 `RAY_COUNT=10` 降 overdraw）；修复 **`CameraRig.handleStoryCompleted` 误调用 `handleWindowBlur()` 打断 `WASD` 行走的真机交互 bug**；调整 5 份 E2E 测试的 SwiftShader 轮询超时 |

---

## 3. 暂停前已验证项与待续项

### 已实测通过（本分支当前代码状态前/中）

- **静态与单元测试**：在 `CameraRig.ts` 修复后于 `03:09` 实测 `npm run typecheck`、`npm run lint`、`vitest run` **34 文件 / 363 测试全通过**（提交前将再次连同 `format:check` 全量复跑）。
- **真机 GPU 视觉截图验收**：Chrome GPU（`NVIDIA GeForce RTX 3060 Laptop GPU`）跑通 `tests/visual/v02-screenshots.spec.ts` 6 组 1280×720 真实截图（开场 / 草坡倒木 / 溪流垂柳 / 虞美人花坡 / 樱花绽放 / 回望光束），零 WebGL/运行时报错（最近一次实机截图运行在 `CameraRig.ts` 修改与 E2E 超时调整之前，恢复后需随 `test:e2e:hw` 一并复采留档）。
- **SwiftShader E2E（截至暂停前）**：
  - 全量首跑 `25 passed / 9 failed`（含 `a6-ac10-1080p`: `maxDrawCalls: 74`、`maxTriangles: 161,948`、`errors: 0`）。
  - 优化后针对 5 份失败 spec 复跑 `12 passed / 2 failed`（仅 `m2-route` 与 `RC-04` 超时）。
  - 修复 `CameraRig.ts`（改用 `setDragging(false)` 保留 WASD）并加宽 `RC-04` 超时后重启定向验证，**`m2-route.spec.ts:52` 已实测通过（2.1m）**；随后按用户「暂停并保存进度」指令终止了其余 5 个测试的后台运行（未完跑 `RC-01..04` / 全量 `test:e2e`）。

### 下次恢复后待完成清单

1. 在 `test/v03-visual-and-hw-verification` 分支继续跑完目标 E2E 校验：`npx playwright test tests/e2e/m2-route.spec.ts tests/e2e/rc-finale-acceptance.spec.ts`。
2. 串行跑完 **全量 `npm run test:e2e`（34/34）**，确认零失败。
3. 串行重跑真机视觉截图 `npx playwright test -c tests/visual/playwright.visual.config.ts` 并检查 `test-results/visual-v03/`，保证 `test-results/visual-v03/manifest.json` 在清理后重新落盘。
4. 串行运行真机 GPU 性能门禁 `$env:A6_HW_SAMPLE_SEC="30"; npm run test:e2e:hw`，确认 `medianFps >= 55`、`lowFps >= 30`、`maxDrawCalls <= 150`、`maxTriangles <= 300_000`、`errors: []`。
5. 将 `test-results/rc-ac10-hardware.json` 与 `test-results/visual-v03/manifest.json` 归档到 `src/tests/v03-evidence/`（同步更新 `.prettierignore` 忽略 `src/tests/v03-evidence/**`），提交并 `--no-ff` 合并 `test/v03-visual-and-hw-verification` 回 `main`。
6. 建立 `docs/v03-handover-sync` 分支，将 `package.json` 版本号升至 `0.3.0-rc.1`，把最终实测数据写入本文、`README.md`、`CHANGELOG.md` 与 Obsidian 交接笔记，运行 `typecheck && lint && format:check && test && build` 全绿后 `--no-ff` 合并回 `main`，打 **`v0.3.0-rc.1`** 标签并推送至 GitHub。

---

## 4. 下次恢复开发速查命令（PowerShell / Node v24）

```powershell
$env:PATH = "C:\Users\Administrator\AppData\Local\Programs\node-v24.22.2-win-x64;" + $env:PATH
$env:CI = "1"
cd d:\obsidian_md\hoshino\starwater-demo
git checkout test/v03-visual-and-hw-verification

# 1. 先验证已修的 m2-route 与 rc-finale-acceptance
npx playwright test tests/e2e/m2-route.spec.ts tests/e2e/rc-finale-acceptance.spec.ts

# 2. 全量 SwiftShader E2E（严禁与 visual/hw 并行）
npm run test:e2e

# 3. 复采真机 GPU 6 组视觉截图（因 test:e2e 会清空 test-results/）
npx playwright test -c tests/visual/playwright.visual.config.ts

# 4. 真机 GPU AC-10 硬件门禁（30s 采样）
$env:A6_HW_SAMPLE_SEC = "30"
npm run test:e2e:hw
```
