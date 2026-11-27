# Hoshino: Realm of Watercolor

《星野：水彩之境》是一个使用 **TypeScript、Vite 和 Three.js** 构建的浏览器 3D 水彩自由探索 Demo。玩家化身红斗篷旅人进入铅笔速写与暖白棉浆纸构成的绘本世界，通过漫步、跳跃与近距离探索，让脚下路径、蓝花坡、溪流垂柳、虞美人花坂、山顶樱花树、连绵远山与夕阳体积光逐步从铅笔线稿晕染为完整的水彩世界。

> 当前状态：`v0.3.0-rc.1`，极简无对话自由探索、程序化水彩着色与德彪西 L.66 钢琴配乐已全部合入 `main` 并完成全量验证，支持随时 `R` 键重置再次漫步。
>
> 本项目是可运行的技术与视觉交互原型，不是完整商业游戏，也不是通用游戏引擎。
>
> 仓库已于 2026-11-19 公开，采用 [MIT 许可证](LICENSE)；其余发布材料见[发布清单](docs/OPEN_SOURCE_CHECKLIST.md)；接手前后的模型对比与完整开发时间线见[交接与模型对比文档](docs/HANDOVER_AND_MODEL_COMPARISON.md)。

## 项目定位

本项目用于验证一个核心体验：**玩家走过之后，世界真的因为玩家而留下颜色。**

它同时提供三个可复用的学习样本：

- Three.js 中基于世界坐标遮罩的持续染色、程序化 Canvas 笔触贴图、FBM 云霞天空与体积光柱渲染。
- 第三人称移动/跳跃、无对话自由探索、Web Audio 程序化钢琴合成、粒子对象池与无缝重置的工程组织。
- 多 Agent 平行协作（V0.1/V0.2）与 Plan-Execute 双模型接手演进（V0.3）的现代 Git 工程化实践。

## 当前已实现（V0.3）

- **第三人称移动与跳跃**：WASD/方向键移动、Shift 疾跑、`Space` 跳跃与落地接触柔影缩放、平滑转向、地形贴地和基础碰撞。
- **第三人称镜头与视角锁**：左键拖拽旋转或单击可选 Pointer Lock 自由环视、滚轮缩放、地形避让，以及樱花树绽放后平滑拉远并可随时自由回望山谷。
- **极简无对话自由探索**：移除对话弹窗、星屑计数与 E 键门槛；走到蓝花坡、溪流或樱花树附近即自动触发水彩晕染；支持随时 `R` 键或右上角玻璃按钮重置。
- **德彪西钢琴背景音乐**：内置公共领域名曲 _Première Arabesque in E major, L. 66_ 的 Web Audio 柔音毡槌钢琴实时排程演奏与沙龙混响（`M` 键一键静音，无头环境自动静默降级）。
- **程序化水彩与双态材质**：6 张 Canvas 2D 程序化贴图（叶簇、卷曲线稿、冷压纸纹、流水波纹、樱花瓣、白桦树皮）、铅笔排线/风动草花与樱树全域漫延波。
- **自然箱庭与远景**：96m×96m 起伏草坡、4 色五瓣野花带（蓝/红/紫红/黄）、白桦与垂柳水岸、圆润鹅卵石踏石、苔藓倒木红蘑菇、黄色灌木、雕塑感樱花树与 3 层连绵起伏远山及 10 束夕阳体积光柱。
- **工程与验收门禁**：严格 TypeScript、ESLint/Prettier、363 条单元测试、34 条 Playwright E2E 回归及真机 Chrome GPU 视觉与性能门禁。

### 当前不包含

- 战斗、背包、抽卡、多人、账号、后端、云存档和多地图。
- localStorage 存档、手柄、手机触控和自定义键位重映射。
- 实时动态投影、完整刚体物理、导航网格与外部 GLB/glTF/音频文件加载管线。
- 角色骨骼动画；当前角色与植被摆动通过程序化位移与顶点着色器驱动。

## 适用场景

- 学习 Three.js 自定义水彩着色器、CanvasTexture 世界遮罩、程序化笔触贴图与轻量后期。
- 制作绘本/水彩风格的交互体验或独立游戏视觉原型。
- 参考小型 Web 3D 项目的模块化边界、自动化 E2E 与真机 GPU 性能门禁建设。

## 快速开始

### 环境

- Node.js `>=20.19.0`（开发验证使用 `v24.22.2`）
- npm
- 支持 WebGL2 的桌面浏览器（主要于 Windows + Chrome/Chromium 验证）

### 克隆与运行

```bash
git clone https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor.git
cd Hoshino-Realm-of-Watercolor
npm ci
npm run dev
```

打开终端输出的地址，默认为 `http://127.0.0.1:5173/`。

### 操作

| 操作         | 按键 / 交互                  |
| ------------ | ---------------------------- |
| 移动 / 疾跑  | WASD 或方向键 / Shift        |
| 跳跃         | Space                        |
| 自由旋转视角 | 鼠标左键拖拽，或点击锁定视角 |
| 缩放镜头     | 鼠标滚轮                     |
| 音乐开关     | M 或右上角 `♫ 乐曲` 按钮     |
| 重置绘本     | R 或右上角 `↻ 重置` 按钮     |

### 构建与预览

```bash
npm run build
npm run preview
```

构建产物位于 `dist/`，可作为静态站点部署。项目运行时不需要后端或外部素材服务。

## 调试与测试

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:e2e:install
npm run test:e2e
```

真 GPU 性能门禁：

```bash
npm run test:e2e:hw
```

该脚本使用系统 Chrome 和硬件加速，要求本机环境支持。默认 e2e 使用 SwiftShader，适合功能回归，不适合作为真实 GPU 帧率结论。

打开 `http://127.0.0.1:5173/?debug=1` 可查看性能、玩家、故事、伙伴、VFX 和染色遮罩，并使用节点调试按钮。调试功能不属于正常玩家流程。

详细说明见[开发与接入指南](docs/DEVELOPMENT.md)。

## 核心流程

```text
进入铅笔速写绘本世界（开场 8m 绿野显色 + 远处铅笔卷曲树冠与三层远山）
  → 任意移动 / Space 跳跃，在脚下持续染开永久水彩路径，首次按键激活德彪西 L.66 钢琴曲
  → 走近蓝花坡，自动触发水彩颜料晕染，点亮倒木蘑菇与蓝黄花带
  → 走近溪流与垂柳踏石区，水面流水笔触与紫红花岸显色
  → 抵达山顶雕塑感樱花树前，唤醒粉色花云、三层落瓣、晚霞云海、三层远山、10 束斜向体积光柱与全域水彩漫延波
  → 镜头短暂拉远后可自由拖拽 360° 回望完整水彩山谷，或随时按 R / 点击右上角重置按钮重新进入绘本
```

## 目录结构

```text
.
├── docs/                  # PRD、架构、开发接入、Agent 协作、交接与模型对比文档
├── public/assets/         # 预留资产目录；当前零外部模型、纹理或音频文件
├── src/
│   ├── core/              # Game 主循环、事件、共享契约、场景与调试基础设施
│   ├── config/            # 世界边界、地标和空间参数
│   ├── player/            # 输入（含 Space 跳跃/拖拽/Pointer Lock）、角色、碰撞与镜头
│   ├── rendering/         # 染色遮罩、程序化笔触、水彩/云霞/体积光着色器与后期
│   ├── world/             # 地形、草花、树木、三层远山、小景道具、地标与材质绑定
│   ├── narrative/         # FreeExploreSystem 极简探索状态机（及保留的 StorySystem）
│   ├── companion/         # 保留的伴侣控制器模块（极简自由探索模式默认不挂载）
│   ├── ui/                # MinimalHud 极简控件与调试面板
│   ├── effects/           # 三层樱花瓣、涟漪、Debussy L.66 钢琴引擎与 AudioSystem
│   ├── styles/            # 应用基础样式
│   └── tests/             # 验收说明与持久化真机证据（v02-evidence / v03-evidence）
├── tests/
│   ├── unit/              # Vitest 单元测试
│   ├── e2e/               # 默认 Playwright 功能与集成测试
│   ├── visual/            # 真机 GPU 6 组 1280×720 实机视觉截图套件
│   ├── hardware/          # 真 GPU 性能门禁（AC-10）
│   └── harness/           # 独立测试页面
├── index.html
├── package.json
└── vite.config.ts
```

## 文档导航

| 文档                                                        | 内容                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| [交接记录与模型对比](docs/HANDOVER_AND_MODEL_COMPARISON.md) | V0.1→V0.3 完整时间线、接手前后模型与设置对比及实测数据 |
| [产品需求 PRD](docs/PRD.md)                                 | 背景、目标、使用方、功能范围、非目标与验收标准         |
| [架构与业务流程](docs/ARCHITECTURE.md)                      | 模块、每帧顺序、故事状态机、事件、染色与重置数据流     |
| [开发与接入](docs/DEVELOPMENT.md)                           | 环境、命令、调试、测试、部署和二次开发边界             |
| [四 Agent 协作](docs/AGENT_COLLABORATION.md)                | 原四 Agent 模块分工、边界、PR 和集成关系               |
| [集成日志](docs/INTEGRATION_LOG.md)                         | 集成记录与 V0.2 验收闭合情况                           |
| [贡献指南](CONTRIBUTING.md)                                 | 开发、提交、PR、测试和资产贡献要求                     |
| [安全政策](SECURITY.md)                                     | 依赖、本地数据、凭据与漏洞报告方式                     |
| [行为准则](CODE_OF_CONDUCT.md)                              | 社区协作基本规范                                       |
| [更新记录](CHANGELOG.md)                                    | `v0.1.0-rc.1`、`v0.2.0-rc.1` 与 `v0.3.0-rc.1` 演进记录 |
| [开源发布清单](docs/OPEN_SOURCE_CHECKLIST.md)               | 公开后的版本、素材与发布检查事项                       |

## 验证与性能口径

`v0.3.0-rc.1` 在 Windows + Node `v24.22.2` 下实测结果：

- **单元测试**：`34` 个测试文件 / `363` 条单元测试全部通过，`typecheck`、`lint`、`format:check` 与 `vite build` 全绿。
- **默认 E2E（SwiftShader）**：`34/34` 全部通过；`a6-ac10-1080p` 记录 `maxDrawCalls: 74`、`maxTriangles: 161,948`、`errors: 0`。
- **真机 GPU 视觉与性能门禁**（NVIDIA GeForce RTX 3060 Laptop GPU）：
  - `tests/visual/v02-screenshots.spec.ts`：6 组 `1280×720` 实机截图（开场 / 草坡倒木 / 溪流垂柳 / 虞美人花坡 / 樱花绽放 / 回望光束）全部通过，`runtimeErrors: []`（证据归档于 `src/tests/v03-evidence/manifest.json`）。
  - `tests/hardware/rc-ac10-hardware.spec.ts`（`1920×1080`，30s 连续采样）：**中位帧率 `165` FPS**、**低分位 `164.6` FPS**、**`maxDrawCalls: 74`**、**`maxTriangles: 161,948`**（证据归档于 `src/tests/v03-evidence/rc-ac10-hardware.json`）。

不同设备与浏览器环境结果可能存在差异，详见 `src/tests/v03-evidence/` 与 [交接与模型对比文档](docs/HANDOVER_AND_MODEL_COMPARISON.md)。

## 协作演进与模型记录

### 接手前（V0.1 / V0.2 四 Agent 并行开发）

| Agent   | 模型                     | 主要职责                                    |
| ------- | ------------------------ | ------------------------------------------- |
| Agent 1 | DeepSeek V4.1 Flash-1017 | 架构、染色渲染、共享契约与集成              |
| Agent 2 | GLM-5.3-flash            | 玩家、镜头与场景                            |
| Agent 3 | Qwen4-Max                | 故事、伙伴、UI；V0.2 规划中临时负责场景美术 |
| Agent 4 | Hy4                      | VFX、测试、性能与验收                       |

### 接手后（V0.2 集成收口与 V0.3 重构）

采用 **Antigravity Plan-Execute 双模型协作**：规划模型 **Gemini 4 Neon (High)** 负责全局审阅、视觉方案设计与根因诊断，执行模型负责特性分支实现、真机视觉调优与 Git 工程化同步。详细工作流与对比见[交接与模型对比文档](docs/HANDOVER_AND_MODEL_COMPARISON.md)。

## 资产与参考资料

当前运行内容使用程序化几何体、Canvas/GLSL 噪声、本地 JSON 和系统字体；没有随仓库分发外部角色模型、美术贴图、字体或音频文件。参考视频及其抽帧仅用于本地视觉比较，已排除在 Git 提交之外。

npm 依赖仍遵循各自许可证。新增资产和依赖必须记录来源与许可，具体要求见[贡献指南](CONTRIBUTING.md)。

## 贡献、维护与许可证

- 欢迎围绕 bug 修复、文档、测试、性能和可验证的视觉改进提交 PR。
- 大型玩法或架构变化请先在 Issue 中讨论，避免与当前模块边界和发布计划冲突。
- AI 辅助代码必须经过贡献者理解、人工审查和真实测试。
- 维护与安全注意事项见[贡献指南](CONTRIBUTING.md)和[安全政策](SECURITY.md)。

**本项目采用 [MIT 许可证](LICENSE)，版权所有 © 2026 TheNorth7747。** 允许自由使用、复制、修改、合并、发布、分发、再授权与销售，但须在副本或实质部分中保留版权与许可声明；软件按「现状」提供，不附带任何明示或默示担保。第三方 npm 依赖仍遵循各自许可证，详见[贡献指南](CONTRIBUTING.md)。
