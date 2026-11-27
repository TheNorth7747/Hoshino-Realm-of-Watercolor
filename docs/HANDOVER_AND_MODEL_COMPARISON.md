# Hoshino: 水彩之境 · 交接记录、模型对比与开发时间线（V0.1 → V0.3.0-rc.1）

> **当前状态（2026-11-27 11:45）**：已完成 **`v0.3.0-rc.1`** 全量验收、真机 GPU 视觉/性能证据归档、文档同步并合入 `main`。

---

## 1. 接手前后模型、设置与协作模式对比

| 维度 | 接手前（V0.1 / V0.2 研发期） | 接手后（V0.2 集成 → V0.3 视觉与体验重构） |
| --- | --- | --- |
| **模型架构** | **4 Agent 平行人工调度**：Agent 1 `DeepSeek V4.1 Flash-1017`、Agent 2 `GLM-5.3-flash`、Agent 3 `Qwen4-Max`、Agent 4 `Hy4` | **Antigravity Plan-Execute 双模型协作**：规划模型 **Gemini 4 Neon (High)**（只读源码与目标视频审计、着色器与架构方案、周期评审与根因诊断） + 执行模型（单仓特性分支研发、自动化验证与 Git 同步） |
| **仓库与分支策略** | 4 个独立 `git worktree` + `archive/` 归档目录（约 675 MB）；本地 `merge --no-ff`，V0.2 4 个分支一度悬而未决 | 清理 9 个历史/V0.2 worktree；严格现代工程 Git 协作流：`fix/v02-*` → `v0.2.0-rc.1` → `feat/v03-*` ×4 → `test/v03-visual-and-hw-verification` → `docs/v03-handover-sync`，全部 `--no-ff` 保留特性边界并打 RC 标签 |
| **产品与交互定位** | 叙事向三节点 Demo（伴侣光球、星屑 `0/3`、E 键触发、`DialogueBox` 弹窗、`EndingOverlay`） | 按目标参考视频（`media_1795710803962_58d09423.mp4`）重构为 **极简无对话自由探索**（移去弹窗与星屑计数；靠近蓝花坡/溪流/樱树自动晕染；新增 `Space` 跳跃 + `Debussy L.66` 独奏钢琴 BGM） |
| **视觉管线与验收** | 锥体远山、小球花、全透明未显色线框；手动抽帧对照；AC-10 JSON 在 `test-results/` 中易失 | 6 张程序化水彩/铅笔/树皮贴图、`Clouds` FBM 天空、3 层起伏远山（严格位于 ±48m 外）、斜向体积光柱 `GodRays`、真机 Chrome GPU（RTX 3060）6 组 1280×720 实机截图门禁与 `read_file` 逐帧核验，证据持久化于 `src/tests/v03-evidence/` |
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

### 阶段 C：接手后第二阶段（V0.3 对标参考视频重构与 `v0.3.0-rc.1` 发版）

| 时间（+08:00） | 分支 / 提交 / 标签 | 完成内容 |
| --- | --- | --- |
| `2026-11-27 01:39` | `b0e30d1`（`feat/v03-watercolor-shaders`）→ `f6a29b7` | `ProceduralBrushes.ts`（6 张 Canvas 2D / Node DataTexture 贴图）、`GodRays.ts`、`WatercolorMaterial.ts`（`uWcMode` 0..5 + 风动 + `uGlobalReveal` 漫延波）、`Atmosphere.ts`（3 层 FBM 水彩云）、`WatercolorPass.ts`（冷压纸纹） |
| `2026-11-27 01:43` | `d5f490b`（`feat/v03-world-art-overhaul`）→ `a985427` | `Mountains.ts`（3 层连绵起伏远山环带）、`Props.ts`（苔藓倒木 + 5 枚红蘑菇 + 8 丛黄花灌木）、`Trees.ts`（36 棵白桦/垂柳/水彩叶簇树）、`Landmarks.ts`（弯干樱花树 + 115 枚分层花云 + 圆润踏石）、`Vegetation.ts`（16,000 簇 4×4 LOD 弧形草 + 1,600 朵四色野花） |
| `2026-11-27 01:50` | `3f3026a`（`feat/v03-hero-jump-explore-ux`）→ `fa6ffce` | 平滑小红帽与落地接触柔影、`Space` 跳跃与物理重力、`DomInputBinder` 拖拽/Pointer Lock 兼容、`FreeExploreSystem.ts`（极简无对话接近触发）、`MinimalHud.ts`、`Petals.ts` 水彩花瓣贴图接入 |
| `2026-11-27 01:52` | `023e5a0`（`feat/v03-debussy-audio`）→ `75b046d` | `DebussyPiano.ts`（德彪西 *Arabesque No. 1 in E major, L. 66* 公版乐谱 Web Audio 柔音钢琴合成与沙龙延迟混响）与 `AudioSystem.ts`（`M` 键静音、花树琶音点缀、无头降级） |
| `2026-11-27 01:55 – 11:43` | `d904a99` → `1b98799`（`test/v03-visual-and-hw-verification`）→ `2c5d911` | 完成 6 组 1280×720 实机视觉抛光（消除远山斜纹与接缝、5 瓣花冠、缕状垂柳、柔粉樱花、10 束体积光柱）、修复 `CameraRig.handleStoryCompleted` 误调 `handleWindowBlur()` 清空 WASD 按键 bug；全量 34/34 Playwright E2E 通过、RTX 3060 AC-10 实测通过并归档至 `src/tests/v03-evidence/` |
| `2026-11-27 11:45` | `docs/v03-handover-sync` → `main`（**`v0.3.0-rc.1`**） | 同步文档、`CHANGELOG.md`、`README.md`、`package.json` 版本号与 Obsidian 交接笔记，全量门禁复验后合入 `main` 并打 **`v0.3.0-rc.1`** 推送 GitHub |

---

## 3. V0.3 最终验收与真机性能实测快照

- **静态检查与单元测试**（Node `v24.22.2`）：
  - `npm run typecheck`、`npm run lint`、`npm run format:check` 全部零错误通过。
  - `vitest run`：**34 个测试文件 / 363 条单元测试**全部通过。
  - 生产依赖仍严格保持**仅 `three@0.187.0`**，零外部模型、图片或音频文件下载依赖。
- **Playwright 全量 E2E 回归**（SwiftShader 软渲染，串行 `workers: 1`）：
  - `npm run test:e2e`：**34/34 全部通过**（总耗时 `28.2m`），覆盖 `a1-reveal`、`a6-ac10-1080p`（`maxDrawCalls: 74`、`maxTriangles: 161,948`、`errors: 0`）、`a6-perf-collect`、`m0-smoke`、`m1-integration`、`m2-route`、`m3-story`、`m4-acceptance`、`rc-finale-acceptance`（含双循环 `RC-04`）、`v02-finale-visibility` 与 `vfx-smoke`。
- **真机 GPU 视觉截图验收**（`src/tests/v03-evidence/manifest.json`）：
  - 设备：`ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002520) Direct3D11 vs_5_0 ps_5_0, D3D11)`，`1280×720`。
  - 真实键盘行走触发 `opening`、`meadow-log`、`stream-willow`、`poppy-hill`、`sakura-bloom`（`petalsActive: 60`，`near: 12 / mid: 26 / far: 22`）、`lookback-godrays`（`finished: true`、`finaleReveal: 1`），`runtimeErrors: []`。
- **真机 GPU AC-10 硬件性能门禁**（`src/tests/v03-evidence/rc-ac10-hardware.json`，基线提交 `d904a99`）：
  - 环境：12th Gen Intel Core i5-12500H / RTX 3060 Laptop GPU / `1920×1080` / `dpr: 1` / `30s` 连续采样（30 样本）。
  - 实测指标：**`medianFps: 165` FPS**、**`lowFps: 164.6` FPS**（单帧耗时约 `6.06ms`）、**`maxDrawCalls: 74`**（预算 `≤ 180`）、**`maxTriangles: 161,948`**（预算 `≤ 350,000`），`verdict: PASS`。
