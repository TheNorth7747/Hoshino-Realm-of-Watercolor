# Hoshino V0.2 视觉贴近版 · 四 Agent 指挥手册

> 基线：`main@f13fd7b`，标签 `v0.1.0-rc.1`
> 项目根目录：`D:/obsidian_md/hoshino/starwater-demo`
> 需求文档：`docs/PRD.md`
> 目标：尽量贴近参考视频的镜头、色彩、森林密度、角色和结局氛围。
> 本轮只做视觉与表现，不新增故事、地图、战斗、背包或其他玩法。

---

## 1. 指挥关系与固定分工

用户是总指挥，负责发任务、看图和放行；Agent 1 兼任集成者，其他 Agent 不自行合并 main。

| Agent | 本轮任务 | 分支 | 工作目录 | 允许修改 |
|---|---|---|---|---|
| Agent 1 | 染色覆盖、线稿、天空、光照；最终集成 | `visual/reveal-grade` | `D:/obsidian_md/hoshino/worktrees/v02-render` | `src/rendering/**`、必要的核心灯光配置、渲染接线与自身测试 |
| Agent 2 | 默认镜头、结局构图、红斗篷角色、走跑动作 | `visual/camera-hero` | `D:/obsidian_md/hoshino/worktrees/v02-camera` | `src/player/**`、自身原创角色资产与测试 |
| Agent 3 | 小径、草木、普通树、花树、溪流视觉 | `visual/world-art` | `D:/obsidian_md/hoshino/worktrees/v02-world` | `src/world/**`、自身新增场景资产与测试 |
| Agent 4 | 花瓣层次、视觉截图、性能与回归验收 | `visual/vfx-qa` | `D:/obsidian_md/hoshino/worktrees/v02-qa` | `src/effects/**`、测试与验收报告 |

本轮额外限制：

- Agent 2 不修改 `src/world/**`；Agent 3 不修改叙事和 UI。
- 不改 `src/config/world.ts` 的地图边界、节点位置和主路线语义。
- 不改共享事件契约，不删除已有功能，不降低 AC 标准。
- 参考视频与抽帧只用于本地对照，不提交到 Git 仓库。
- 每个 Agent 只推自己的分支并创建 PR，只有 Agent 1 可以合并。

---

## 2. 总体工作顺序

```text
阶段 0：用户发送总控 Prompt，Agent 1 核对基线并建立四个 worktree
  ↓
阶段 1：四个 Agent 在不同 worktree 同时开发
  ├─ Agent 1：染色 / 线稿 / 天空 / 光照
  ├─ Agent 2：镜头 / 角色 / 动作
  ├─ Agent 3：路径 / 植被 / 树木 / 溪流
  └─ Agent 4：VFX / 截图 / 测试 / 性能
  ↓
阶段 2：Agent 1 合并渲染与镜头，先确认构图和核心染色没有回归
  ↓
阶段 3：合并场景美术，输出开场、溪流、花树、结尾对照截图
  ↓
阶段 4：合并 VFX 与 QA，执行全量测试和真机性能验收
  ↓
阶段 5：用户人工看图、完整通关与重置；通过后才创建 V0.2 RC
```

---

## 3. 阶段 0：用户先发给 Agent 1 的总控 Prompt

在 `D:/obsidian_md/hoshino/starwater-demo` 的 Agent 1 主会话中发送：

```text
你是 Hoshino V0.2 视觉贴近版的集成负责人。现在只做准备，不开发业务功能。

先阅读：
- D:/obsidian_md/hoshino/starwater-demo/docs/PRD.md
- D:/obsidian_md/hoshino/starwater-demo/docs/V02_VISUAL_WORKFLOW.md

当前基线应为 main@f13fd7b / v0.1.0-rc.1。请：
1. 核对 main 工作区干净、与 origin/main 同步，记录实际提交哈希。
2. 运行 typecheck、lint、format:check、unit、build、e2e，确认视觉开发前基线真实可用。
3. 阅读手册的四个 Agent 分工，建立 visual/reveal-grade、visual/camera-hero、visual/world-art、visual/vfx-qa 四个独立 worktree。
4. 不修改共享契约，不提前替其他 Agent 写实现，不打 V0.2 标签。
5. 返回基线命令结果、worktree 路径、分支名称和任何阻塞。

参考视频只作为视觉目标，不要求复制其源代码或提交视频资源。
```

若由用户自己建立 worktree，在 Git Bash 执行：

```bash
cd "D:/obsidian_md/hoshino/starwater-demo"
git fetch origin
git worktree add -b visual/reveal-grade "D:/obsidian_md/hoshino/worktrees/v02-render" origin/main
git worktree add -b visual/camera-hero "D:/obsidian_md/hoshino/worktrees/v02-camera" origin/main
git worktree add -b visual/world-art "D:/obsidian_md/hoshino/worktrees/v02-world" origin/main
git worktree add -b visual/vfx-qa "D:/obsidian_md/hoshino/worktrees/v02-qa" origin/main
```

四个 Agent 首次进入各自目录后均执行 `npm install`，不得自行升级依赖。

---

## 4. 阶段 1：四个 Agent 的完整并行 Prompt

### 4.1 Agent 1：染色、线稿、天空与光照

工作目录：`D:/obsidian_md/hoshino/worktrees/v02-render`

```text
你是 Hoshino V0.2 的 Agent 1，本轮只负责染色覆盖、线稿、天空和光照，不负责场景几何或角色模型。

先阅读当前 worktree 的 docs/PRD.md 与 D:/obsidian_md/hoshino/starwater-demo/docs/V02_VISUAL_WORKFLOW.md。
本地参考帧位于：
- D:/obsidian_md/hoshino/starwater-demo/test-results/reference-video/frame-01.png（开场）
- frame-03.png（路线）
- frame-05.png（花树）
- frame-07.png（结尾）
参考帧只读，不提交。

当前分支：visual/reveal-grade。
允许修改：src/rendering/**、必要的核心灯光/天空配置、渲染接线和自身测试。
禁止修改：src/player/**、src/world/**、叙事/UI、共享事件契约和其他 Agent 文件。

目标与要求：
1. 解决开局只有脚下绿色圆斑的问题：出生区域预染色先试 8～12m，移动笔刷先试 2.5～3.2m，并略向角色前方偏移。
2. 保留世界坐标、永久路径、跨材质同一遮罩；不得改成屏幕滤镜或第二张独立故事遮罩。
3. 染色边缘使用多尺度噪声和柔和过渡，避免规则圆形和明显贴图重复。
4. 降低地表均匀交叉排线的工程网格感；远景轮廓更接近铅笔线，线稿对比随距离减弱。
5. 开场保持暖纸色；花树结局时天空和雾逐渐带淡桃/暖橙色，复用现有 finale reveal 状态。
6. 光照增加柔和层次，但不引入重度 Bloom、SSAO 或高成本反射。
7. 保持 AC-03～05、结局远山显色、reset 和二次通关；添加对应单元测试。
8. 记录修改前后参数，运行 typecheck、lint、format:check、unit、build。

完成后提交并推送 visual/reveal-grade，创建 PR：[V0.2] Improve watercolor reveal and atmosphere。
PR 必须包含修改文件、参数变化、测试结果、性能影响和截图需求。不要自行合并。
```

### 4.2 Agent 2：镜头、角色与动作

工作目录：`D:/obsidian_md/hoshino/worktrees/v02-camera`

```text
你是 Hoshino V0.2 的 Agent 2，本轮只负责镜头、原创红斗篷角色与走跑动作，不修改 world。

先阅读 docs/PRD.md、D:/obsidian_md/hoshino/starwater-demo/docs/V02_VISUAL_WORKFLOW.md，并查看主目录 test-results/reference-video 下的 frame-01/03/05/07.png。
当前分支：visual/camera-hero。
允许修改：src/player/**、自身原创角色资产和对应测试。
禁止修改：src/world/**、src/rendering/**、叙事/UI、共享事件和其他 Agent 文件。

目标与要求：
1. 默认镜头由 8m / 0.42rad 的偏俯视构图，先试调为距离 4.8～5.5m、俯角 0.22～0.30rad。
2. 向角色移动或面向方向前看 1～2m，使角色位于画面中下部，目标屏高约 25%～32%，地平线不再贴近画面顶部。
3. 保留平滑跟随、鼠标旋转、滚轮缩放、地形避让、失焦处理和 reset。
4. 结局沿用现有 13m 距离契约，优先调整俯角和前看构图，避免结局变成顶视图。若必须改 13m，先提交变更建议，不直接改验收契约。
5. 将圆锥感角色升级为原创红斗篷旅行者：圆润兜帽、身体、白色袖口、双腿和斗篷层次清晰；无外部资产时用程序化低模完成。
6. 根据实际速度加入待机、走跑、摆臂、双腿交替、轻微身体起伏和斗篷滞后摆动；不得虚构动画已存在。
7. 角色原点、碰撞半径、PlayerSnapshot、移动速度和故事交互保持兼容。
8. 添加镜头参数、前看、结局、reset 和角色动作状态测试；运行 typecheck、lint、format:check、unit、build。

完成后提交并推送 visual/camera-hero，创建 PR：[V0.2] Improve third-person framing and hero presentation。
PR 中列出修改文件、前后镜头参数、角色实现方式、测试结果和任何需要 QA 更新的视觉断言。不要自行合并。
```

### 4.3 Agent 3：路径、植被、树木与溪流

工作目录：`D:/obsidian_md/hoshino/worktrees/v02-world`

```text
你是 Hoshino V0.2 的 Agent 3，本轮临时接管 src/world/** 的场景美术，不修改叙事，不修改 player 或 rendering。

先阅读 docs/PRD.md、D:/obsidian_md/hoshino/starwater-demo/docs/V02_VISUAL_WORKFLOW.md，并查看主目录 test-results/reference-video/frame-01/03/05/07.png。
当前分支：visual/world-art。
允许修改：src/world/**、自身新增场景资产和对应测试。
禁止修改：config/world.ts、core、rendering、player、narrative、UI 和共享事件。

目标与要求：
1. 增加暖土黄色弯曲小径，串联出生点、蓝花坡、溪流和花树；先试宽 1～1.4m，贴合地形、避免 z-fighting，并使用共享世界染色。
2. 当前草为 720 株、蓝花 150 朵，密度明显不足。将草提升为 1.2万～2万簇，花提升为 700～1200 朵，按可见区域和地标聚集，不要均匀撒满全图。
3. 增加红、黄、蓝花带，使用共享几何和 InstancedMesh；禁止每株单独 Mesh/Material。
4. 草按区域分块实例化以支持视锥剔除和 LOD，控制透明 overdraw；散布保持确定性种子。
5. 增加 25～40 棵普通树，至少包含深干绿树、白干树和垂枝树三类；沿路线两侧形成前中后景，保留望向花树的视线。
6. 花树改为更宽的伞形树冠、更清晰的主枝和更多小枝叶簇，避免四个大球体的拼接感；树干碰撞仍可用简化圆形。
7. 溪流优先补水纹、岸线笔触和踏石可读性。若改成 S 形，必须同步地形高度、避草区域与踏石，否则本轮保持原河道。
8. 所有可染色对象继续使用 A1 的同一 uniforms，不新建染色系统。
9. 性能目标：Draw Calls≤150、三角面≤300k；主路线、碰撞、重置和 AC-10 不得回归。
10. 添加散布确定性、密度/预算、碰撞与材质共享测试；运行 typecheck、lint、format:check、unit、build。

完成后提交并推送 visual/world-art，创建 PR：[V0.2] Build dense watercolor forest composition。
PR 中列出场景数量、三角面/实例预算、修改文件、测试结果、已知视觉问题和截图需求。不要自行合并。
```

### 4.4 Agent 4：VFX、视觉对照与 QA

工作目录：`D:/obsidian_md/hoshino/worktrees/v02-qa`

```text
你是 Hoshino V0.2 的 Agent 4，负责 VFX 层次、视觉对照和独立 QA，不替其他 Agent 修改业务实现。

先阅读 docs/PRD.md、D:/obsidian_md/hoshino/starwater-demo/docs/V02_VISUAL_WORKFLOW.md 和现有 A6/RC 验收报告。
当前分支：visual/vfx-qa。
允许修改：src/effects/**、测试、截图采集脚本和验收报告。
禁止修改：rendering、player、world、narrative 的业务实现；不得删除或放宽既有断言。

目标与要求：
1. 花瓣分为近/中/远景层次，具有不同大小、旋转、横向风漂移和生命周期；控制总量与透明叠加。
2. 结局先让世界、花树、镜头和花瓣被看见，再出现 UI；不改变既有故事时序。
3. 建立开场、蓝花坡、溪流、花树、结尾五组 1280×720 无调试 UI 的真实游戏截图流程。
4. 截图必须来自实际运行页面，不得用静态拼图或参考帧冒充项目效果；参考视频和抽帧不提交 Git。
5. 视觉截图用于人工对照，不增加跨 GPU 易失败的严格逐像素断言；结构、状态和性能仍用自动断言。
6. 保留并适配既有 RC/AC 测试。若 Agent 2 获准改变镜头契约，先核对变更，再修改对应测试意图，不能简单删断言。
7. 其他 PR 合并后 rebase 到最新 main，执行完整 AC 回归和真机硬件加速性能采样。
8. 输出 V0.2 视觉验收报告：五组截图、完成项、差距、测试结果、性能数据和责任模块。

先提交独立 VFX/QA 工作并推送 visual/vfx-qa，创建 PR：[V0.2] Add cinematic VFX and visual acceptance。
不要自行合并，不要为了全绿修改其他模块或降低标准。
```

---

## 5. 阶段 2～4：PR 完成后给 Agent 1 的集成 Prompt

四个分支都开始提交 PR 后，不需要等全部完成才集成。按下面顺序执行：

```text
visual/reveal-grade → visual/camera-hero → visual/world-art → visual/vfx-qa
```

发给 Agent 1 主集成会话：

```text
现在开始集成 Hoshino V0.2，按 reveal-grade → camera-hero → world-art → vfx-qa 的顺序逐个审查和合并 PR。

每个 PR 必须检查：
1. 是否越过文件边界，是否夹带玩法、剧情或依赖升级。
2. 是否有真实 typecheck、lint、format:check、unit、build 结果。
3. 是否保持世界染色、故事闭环、结局和 reset。
4. 是否存在明显性能预算或资源释放问题。

每合并一个 PR，都在最新 main 运行：
npm run typecheck && npm run lint && npm run format:check
npm test && npm run build && npm run test:e2e

合并渲染与镜头后，先检查正常开场构图，不要直接继续堆场景。
合并场景后，通知 Agent 4 输出开场、蓝花坡、溪流、花树、结尾五组真实截图。
合并 VFX/QA 后，通知 Agent 4 在最新 main 做完整 AC 与真机性能验收。

冲突涉及共享契约、节点坐标或既有验收语义时停止自动合并，列出冲突并交总指挥裁决。
不得伪造截图、PR 或测试结果，不得在验收前创建 V0.2 正式标签。
```

---

## 6. 用户验收顺序

### 6.1 第一次看图：渲染 + 镜头合并后

只看三点：

- 角色是否足够大、镜头是否不再明显俯视。
- 开场下半屏是否形成连续彩色区域，而非脚下圆斑。
- 线稿、纸张和天空是否更接近参考，而非工程网格。

不合格则只返工 Agent 1 或 Agent 2，不让 Agent 3 靠更多模型掩盖构图问题。

### 6.2 第二次看图：场景合并后

对照五组截图检查：

- 小径是否清楚引导下一段路线。
- 花草是否形成前、中、后景和颜色分区。
- 普通树是否构成森林，花树是否摆脱大球拼接感。
- 是否仍能顺畅走通溪流、完成故事和重置。

### 6.3 最终验收：VFX/QA 合并后

- AC-01～12 全部重新通过。
- 真机中位 FPS≥55、低帧≥30；Draw Calls≤150、三角面≤300k。
- 连续游玩无异常，重置后可第二次通关。
- 用户亲自完整通关一次，再重置通关一次。

全部通过后，再由 Agent 1 创建 `v0.2.0-rc.1`；正式发布前不新增其他需求。

---

## 7. 返工责任表

| 问题 | 主要负责人 | 配合方 | 处理原则 |
|---|---|---|---|
| 角色太小、画面俯视、结局构图差 | Agent 2 | Agent 4 提供截图 | 先调镜头，不堆模型 |
| 只有脚下圆斑、颜色边缘生硬、天空不对 | Agent 1 | Agent 4 提供对照 | 调笔刷/材质/渐变，不改故事 |
| 草地稀疏、树木不像森林、花树像球体 | Agent 3 | Agent 4 提供预算 | 调密度、结构与 LOD |
| 花瓣不明显或结局太乱 | Agent 4 | Agent 1/2/3 | 调层次和数量，不遮世界 |
| FPS 不达标 | Agent 4 定位 | 对应模块负责人修复 | 先采集证据，不直接删效果 |
| 故事、星屑或重置回归 | Agent 1 定位集成来源 | 原模块负责人 | 优先回滚有问题的视觉合并，不改剧情掩盖 |
| 共享文件冲突 | Agent 1 | 相关 Agent | 停止自动合并，由用户裁决 |

---

## 8. 总指挥每轮只需要说的话

- 开始准备：发送第 3 节总控 Prompt。
- 开始并行：把第 4 节对应 Prompt 分别发给四个 Agent。
- PR 就绪：发送第 5 节集成 Prompt 给 Agent 1。
- 第一次看图：只反馈“镜头/染色是否接近”，不要临时加新功能。
- 第二次看图：只反馈“森林/小径/花树是否接近”。
- 最终放行：确认测试、真机性能、两次通关后，再允许创建 RC。

核心纪律：**并行开发、串行集成、截图放行、性能兜底、玩法冻结。**
