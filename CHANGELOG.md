# 更新记录

本项目采用接近 Keep a Changelog 的记录方式。版本号是否遵循语义化版本由维护者在正式发布时统一确认。

## v0.3.0-rc.1 - 2026-11-27

### Added

- **极简无对话自由探索体验**：新增 `FreeExploreSystem` 与 `MinimalHud`（底部半透明操作提示与右上角玻璃功能按钮），接近蓝花坡、溪流或山顶樱花树自动触发水彩晕染；新增 `Space` 跳跃与接地接触柔影缩放。
- **德彪西钢琴背景音乐**：新增 `DebussyPiano`（_Première Arabesque in E major, L. 66_ 公版乐谱 Web Audio 柔音毡槌钢琴合成与沙龙延迟混响）与 `AudioSystem`（支持首次交互解锁、`M` 键静音、花树绽放和弦琶音、无头环境静默降级）。
- **程序化水彩渲染与氛围系统**：新增 `ProceduralBrushes`（6 张 Canvas 2D 水彩叶簇、铅笔卷曲线稿、纸纹、流水、花瓣与白桦树皮贴图）、`GodRays`（10 束斜向体积光束单次 `InstancedMesh` 绘制）、`Atmosphere` 3 层 FBM 水彩云与 `WatercolorMaterial` 6 模式风动/漫延着色器。
- **场景美术全面重制**：新增 3 层连绵起伏远山环带（严格位于 `±48m` 边界外）、36 棵白桦/垂柳/水彩叶簇树、弯干 7 枝 115 花云雕塑感樱花树、圆润河床踏石、苔藓倒木红蘑菇、黄色开花灌木、16,000 簇 4×4 LOD 弧形草海与 1,600 朵四色五瓣野花。
- **交接与验证证据**：新增 `docs/HANDOVER_AND_MODEL_COMPARISON.md`，持久化 V0.3 真机视觉与硬件性能证据至 `src/tests/v03-evidence/`。

### Fixed

- 修复 `CameraRig.handleStoryCompleted` 在花树触发终局运镜时调用 `handleWindowBlur()` 误清玩家正在按住的 `WASD`/`Shift` 移动键的交互缺陷。
- 消除远山机械斜排线、环带 45° 转角折痕与山脚白边，并优化 `GodRays` 与终局全图显色分支的软件渲染过绘。

### Verified

- 静态与单元测试：`typecheck`、`lint`、`format:check` 通过，`vitest run` 34 个测试文件 / 363 条用例通过。
- Playwright E2E（SwiftShader）：34/34 全部通过（含 `m2-route`、`m3-story`、`m4-acceptance`、`rc-finale-acceptance`、`v02-finale-visibility`）。
- 真机 GPU（RTX 3060 Laptop，1920×1080，30s 采样）：`medianFps = 165`，`lowFps = 164.6`，`maxDrawCalls = 74`，`maxTriangles = 161,948`，6 组 1280×720 实机视觉截图零报错。

## v0.2.0-rc.1 - 2026-11-27

### Added & Integrated

- 合并 V0.2 四个视觉分支（`visual/reveal-grade`、`visual/camera-hero`、`visual/world-art`、`visual/vfx-qa`），引入密集林地、水彩路径、5m 第三人称构图、三层花瓣视差与真机截图自动化门禁。
- 正式引入 `GameSystem.renderFrame?` 钩子替代后期对 `renderer.render` 的直接劫持，适配 5 条 V0.2 验收语义冲突并修复 `?debug=1` 调试网格穿地形、调试面板 CSS 换行及 `INTEGRATION_LOG.md` §5 文档不一致问题（34/34 E2E 通过）。

## Unreleased (2026-11-19 Public Prep)

### Added

- 新增 MIT 许可证，版权署名 `TheNorth7747`；同步 `LICENSE`、`package.json`、`package-lock.json` 与 README。

### Documentation

- 增加面向外部开发者的 README、架构、开发接入、Agent 协作、贡献、安全和发布准备文档。
- 明确当前功能、未实现功能、历史性能数据和 V0.2 规划之间的边界。

### Changed

- 将 package 描述、应用版本和启动加载文案从 A0 骨架口径更新为当前 RC Demo。
- 将仓库可见性由 `private` 改为 `public`（2026-11-19），默认分支 `main` 与远程保持同步。

## v0.1.0-rc.1 - 2026-11-17

### Added

- TypeScript、Vite 和 Three.js 的独立 Web 应用。
- 第三人称移动、碰撞、地形贴地、镜头旋转/缩放和结局拉远。
- 世界坐标永久染色、节点扩散、跨世界材质共享 uniforms 和纸张后期。
- 地形、蓝花坡、溪流、踏石、花树、枯树、岩石与远山。
- 蓝花坡、溪流、花树三节点故事，目标 HUD、短对话与三枚星屑。
- 星灵伙伴跟随、目标引导和卡住回收。
- 花树结局、远山显色、花瓣、涟漪和结局卡片。
- 不刷新页面的流程重置与再次游玩。
- 调试面板、单元测试、默认 e2e 和真 GPU 性能门禁。

### Verified

- 最终报告记录 272 个单元用例、32 个默认 e2e 用例和 AC-01～12 通过。
- 真 GPU 性能与 10 分钟稳定性结果及测试条件记录于 `src/tests/A6_ACCEPTANCE_REPORT.md`。

### Known limits

- 当前为单场景三节点 Demo，不是完整游戏。
- 没有存档、后端、战斗、移动端、手柄或正式音频接入。
- 当前角色为程序化低模，没有四肢走跑动画。
- 故事自动测试使用调试节点按钮；尚不是完全通过真实键鼠步行通关的单一自动化用例。
