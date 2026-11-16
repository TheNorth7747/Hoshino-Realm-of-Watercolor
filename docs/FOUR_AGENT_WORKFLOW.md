# Hoshino: Realm of Watercolor · 四 Agent 并行开发运行手册

> 项目：Hoshino: Realm of Watercolor（星野：水彩之境）
> 项目根目录：`D:/obsidian_md/starwater-demo`
> 需求基线：`docs/PRD.md`
> 远程账号：`TheNorth7747`
> 仓库地址：`https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor`
> 本手册定义四个 Agent 的固定职责、用户操作顺序、Prompt、分支和集成规则。

---

## 1. 最重要的结论

不要让四个 Agent 从空目录同时执行整份 PRD。正确方式是：

1. **Agent 1 先独立完成 A0/M0 工程骨架。**
2. 骨架验收并推送后，建立四个独立 worktree。
3. 四个 Agent 在各自分支并行开发，不共享正在编辑的目录。
4. 主项目目录只用于集成；Agent 1 兼任集成者，但并行阶段不独占修改其他模块。
5. 按 M1 → M2 → M3 → M4 分次合并，不等所有人写完后一次性合并。

---

## 2. 四个 Agent 的固定职责

| Agent | 角色 | 对应 PRD 任务 | 并行阶段允许修改 | 不允许多头修改 |
|---|---|---|---|---|
| Agent 1 | 架构、染色渲染、集成 | A0、A1，最终集成 | `src/rendering/**`；A0 阶段才修改根配置和 `src/core/**` | 并行阶段不得直接改其他 Agent 目录 |
| Agent 2 | 玩家、镜头、场景 | A2，随后 A3 | `src/player/**`；后续 `src/world/**` | 不改共享契约、渲染实现和故事状态 |
| Agent 3 | 故事、伙伴、UI | A4 | `src/narrative/**`、`src/companion/**`、`src/ui/**` | 不改世界坐标、玩家内部实现和 package.json |
| Agent 4 | VFX、测试、质量验收 | A5、A6 | `src/effects/**`、`src/tests/**`、独立测试目录 | 不改业务模块来迎合测试，不降低验收标准 |

### 共享文件唯一负责人

只有 Agent 1 在明确需要变更共享契约时才能修改：

- `package.json`、lockfile、根配置文件
- `src/main.ts`
- `src/core/**`
- `src/config/world.ts`
- `docs/PRD.md` 和本手册

其他 Agent 需要变更时，在 PR 或回执中写明建议，不得直接修改。

---

## 3. 用户操作流程总览

| 步骤 | 用户要做什么 | 放行条件 |
|---|---|---|
| 0 | 准备私有 GitHub 仓库，确保本地 Git 有推送权限 | 能访问远程 `main` |
| 1 | 在主目录启动 Agent 1，只发送“A0 启动 Prompt” | M0 构建、类型检查和测试通过 |
| 2 | 推送 A0 基线，建立四个 worktree | 四个目录互不嵌套，分支明确 |
| 3 | 分别打开四个 Agent 会话，发送各自的并行 Prompt | 每个 Agent 只接自己的任务 |
| 4 | 让 Agent 提交分支并创建 PR，不直接推 main | PR 有测试、文件清单和需求编号 |
| 5 | 按顺序集成：渲染 + 玩家 → 场景 → 故事 → VFX/QA | 每次合并后均重新构建和测试 |
| 6 | M1 通过后，让 Agent 2 从最新 main 开 A3 场景分支 | 不在未合并的 A2 分支上无限堆功能 |
| 7 | 最终按 AC-01～12 验收 M4 | 所有 P0 有真实运行结果 |

---

## 4. 阶段一：只启动 Agent 1 完成 A0

### 4.1 用户操作

- 打开 Agent 1 会话。
- 工作目录设为 `D:/obsidian_md/starwater-demo`。
- 发送下面的完整 Prompt。
- 此时 Agent 2、3、4 可以阅读 PRD，但**不要修改任何文件**。

### 4.2 Agent 1：A0 启动 Prompt

```text
你是 Hoshino: Realm of Watercolor（星野：水彩之境）的 Agent 1，兼任架构与集成负责人。

先完整阅读：
1. D:/obsidian_md/starwater-demo/docs/PRD.md
2. D:/obsidian_md/starwater-demo/docs/FOUR_AGENT_WORKFLOW.md

当前只执行 PRD 的 A0，目标是完成 M0。不要提前实现 A1～A6 的业务功能。

工作目录：D:/obsidian_md/starwater-demo

你必须完成：
1. 建立 TypeScript 严格模式 + Vite + Three.js 工程。
2. 建立 PRD 规定的目录结构、游戏循环、EventBus、共享类型和世界坐标。
3. 提供可被 A1～A5 使用的挂载点、空场景和基础渲染器。
4. 配置 dev、build、typecheck、test、test:e2e 脚本；测试暂无业务用例时要有可运行的最小 smoke。
5. 配置 ?debug=1 的调试入口和基础错误提示。
6. 建立 Git main 基线；不要创建或修改 AGENTS.md、CLAUDE.md。
7. 运行 npm install、npm run typecheck、npm run test、npm run build，并提交真实结果。

共享文件由你负责，但本轮不要实现世界染色、玩家控制、正式场景、故事或 VFX。

完成后返回：
- M0 是否通过
- 修改文件清单
- 上述命令的真实结果
- 后续模块的挂载点
- Git 提交哈希
- 仍存在的阻塞问题

不要为了赶进度把共享接口写成 any，不要把占位页面当成 M0 的全部验收。
```

### 4.3 用户验收 M0

在主目录执行：

```bash
cd "D:/obsidian_md/starwater-demo"
npm install
npm run typecheck
npm run test
npm run build
```

全部通过后，确认空场景能够运行、共享类型和世界坐标已存在，再推送基线：

```bash
git push -u origin main
```

---

## 5. 阶段二：建立四个隔离工作区

在 `main` 已推送、工作区干净后执行：

```bash
cd "D:/obsidian_md/starwater-demo"
git fetch origin
git worktree add ../starwater-render -b agent/render
git worktree add ../starwater-player -b agent/player
git worktree add ../starwater-narrative -b agent/narrative
git worktree add ../starwater-effects -b agent/effects
```

对应关系：

| Agent | 工作目录 | 初始分支 |
|---|---|---|
| Agent 1 | `D:/obsidian_md/starwater-render` | `agent/render` |
| Agent 2 | `D:/obsidian_md/starwater-player` | `agent/player` |
| Agent 3 | `D:/obsidian_md/starwater-narrative` | `agent/narrative` |
| Agent 4 | `D:/obsidian_md/starwater-effects` | `agent/effects` |

主目录 `D:/obsidian_md/starwater-demo` 保持 `main`，只用于集成。

每个 Agent 首次进入自己的目录后执行 `npm install`。依赖版本以 main 的 lockfile 为准，不得自行升级 Three.js。

---

## 6. 阶段三：四个 Agent 的并行 Prompt

### 6.1 Agent 1：世界染色与水彩渲染

工作目录：`D:/obsidian_md/starwater-render`

```text
你是本项目的 Agent 1，当前不再执行 A0，只执行 PRD 的 A1。

先阅读当前工作目录下的：
- docs/PRD.md
- docs/FOUR_AGENT_WORKFLOW.md

工作目录：D:/obsidian_md/starwater-render
当前分支：agent/render
允许修改：src/rendering/** 和本模块对应测试。
禁止修改：package.json、lockfile、main.ts、core/**、config/world.ts，以及其他 Agent 的目录。

目标：完成世界坐标、跨材质、可持续的线稿到水彩染色，满足 AC-03、AC-04、AC-05。

必须交付：
1. 512x512 ColorRevealMask，世界 XZ 到 UV 的正确映射。
2. 玩家移动笔刷、故事 stamp、重置与 dispose。
3. 共享水彩材质工厂，使测试地面和至少两种不同物体读取同一遮罩。
4. 脏更新和更新频率限制，不能每帧无条件上传纹理。
5. 线稿/水彩混合与轻量纸张质感；不能只实现屏幕空间滤镜。
6. 遮罩调试视图、坐标映射测试和真实构建结果。

使用 A0 的契约。如果契约不足，只在回执中提出变更建议，不直接修改共享文件。

完成后：
1. 运行 typecheck、test、build。
2. 提交并推送 agent/render。
3. 创建目标为 main 的 PR，标题为 [A1] Add world-space watercolor reveal。
4. PR 中列出修改文件、需求编号、测试结果、性能注意事项和接口变更请求。
5. 不要自行合并 PR。
```

### 6.2 Agent 2：玩家控制与第三人称镜头

工作目录：`D:/obsidian_md/starwater-player`

```text
你是本项目的 Agent 2，当前只执行 PRD 的 A2，不要同时开始 A3。

先阅读当前工作目录下的：
- docs/PRD.md
- docs/FOUR_AGENT_WORKFLOW.md

工作目录：D:/obsidian_md/starwater-player
当前分支：agent/player
允许修改：src/player/** 和本模块对应测试。
禁止修改：package.json、lockfile、main.ts、core/**、config/world.ts、world/**、rendering/**。

目标：完成稳定的玩家控制和第三人称镜头，满足 AC-02。

必须交付：
1. WASD 相对镜头移动、角色平滑转向、地形高度采样接口。
2. 地图边界和基础碰撞，窗口失焦清空输入。
3. 平滑跟随、鼠标旋转、滚轮缩放和基础地形避让。
4. 符合共享契约的 PlayerSnapshot。
5. delta 截断和测试地形上的持续移动验证。
6. 对应测试以及 typecheck、test、build 的真实结果。

A3 地形尚未完成时使用 A0 提供的平坦地形接口，不得复制另一套世界坐标。

完成后：
1. 提交并推送 agent/player。
2. 创建目标为 main 的 PR，标题为 [A2] Add player controller and third-person camera。
3. PR 中列出修改文件、测试结果、已知限制和接口变更请求。
4. 不要自行合并，不要在同一分支继续堆 A3，等待 M1 集成通知。
```

### 6.3 Agent 3：故事、星屑、伙伴与 UI

工作目录：`D:/obsidian_md/starwater-narrative`

```text
你是本项目的 Agent 3，只执行 PRD 的 A4。

先阅读当前工作目录下的：
- docs/PRD.md
- docs/FOUR_AGENT_WORKFLOW.md

工作目录：D:/obsidian_md/starwater-narrative
当前分支：agent/narrative
允许修改：src/narrative/**、src/companion/**、src/ui/** 和对应测试。
禁止修改：package.json、lockfile、main.ts、core/**、config/world.ts、player/**、world/**、rendering/**。

目标：实现可独立集成的故事状态机、伙伴、星屑和 UI，满足 AC-06、AC-07、AC-08、AC-12。

必须交付：
1. flower → stream → tree → finished 的幂等状态机。
2. 数据化对话与故事规则，坐标只引用共享配置。
3. HUD、互动提示、对话框、结局和完整重置。
4. 三枚星屑去重计数、伙伴跟随和超时回收。
5. 在玩家与世界尚未集成时，使用共享契约的测试替身验证逻辑；不得修改其他模块。
6. 状态机、重复触发、星屑计数和重置测试，以及 typecheck、test、build 结果。

完成后：
1. 提交并推送 agent/narrative。
2. 创建目标为 main 的 PR，标题为 [A4] Add narrative progression companion and UI。
3. PR 中列出修改文件、测试结果、依赖的挂载点和接口变更请求。
4. 不要自行合并，不要添加战斗、背包或额外剧情系统。
```

### 6.4 Agent 4：VFX 与 QA 基础设施

工作目录：`D:/obsidian_md/starwater-effects`

```text
你是本项目的 Agent 4，当前执行 PRD 的 A5，并为 A6 准备独立测试，不要替其他模块实现业务功能。

先阅读当前工作目录下的：
- docs/PRD.md
- docs/FOUR_AGENT_WORKFLOW.md

工作目录：D:/obsidian_md/starwater-effects
当前分支：agent/effects
允许修改：src/effects/**、src/tests/**、独立测试目录及自身新增音频资产。
禁止修改：package.json、lockfile、main.ts、core/**、config/world.ts 和其他业务目录。

目标：交付事件驱动的花树花瓣和染色反馈，准备可重复运行的验收测试。

必须交付：
1. 花树花瓣、故事染色粒子或涟漪，具有数量上限、生命周期和 dispose。
2. 使用共享事件契约的测试替身验证 VFX，不直接写死故事状态。
3. AC-01～12 的测试清单和能够提前实现的 Vitest/Playwright smoke。
4. 测试重点包括页面加载、移动、节点触发、结局、重置和控制台异常。
5. 音频如未进入 P1，不得阻塞 P0。
6. typecheck、test、build 的真实结果。

完成后：
1. 提交并推送 agent/effects。
2. 创建目标为 main 的 PR，标题为 [A5] Add event-driven VFX and QA coverage。
3. PR 中列出修改文件、测试覆盖、已发现但应由其他模块修复的问题。
4. 不要自行合并，不要通过删除断言或降低 AC 标准让测试通过。
```

---

## 7. 阶段四：用户与 Agent 1 的集成顺序

### 7.1 PR 检查

每个 PR 至少有：

- 对应需求编号和修改文件清单。
- 已执行命令及真实结果。
- 是否修改公共接口；如有，必须先由集成者审查。
- 已知问题、性能影响和回滚方式。
- 不包含其他 Agent 的文件或无关格式化改动。

### 7.2 第一次集成：M1

优先集成 A1 和 A2。其他 PR 可以保持打开，不必等待。

```bash
cd "D:/obsidian_md/starwater-demo"
git switch main
git fetch origin
git pull origin main
```

由 Agent 1 在集成会话中逐个合并 PR；每合并一个就执行：

```bash
npm install
npm run typecheck
npm run test
npm run build
```

A1 + A2 合并后，必须用测试地形验证：

- 角色可以移动和转向。
- 彩色路径留在世界坐标中，不随镜头漂移。
- 离开后返回，颜色仍存在。
- 至少两种物体与地面使用同一遮罩。

**M1 未通过，不继续合并正式场景和大段故事。**

### 7.3 Agent 2 开始 A3 场景

A2 已合并、M1 通过后，在 Agent 2 的 worktree 中基于最新 main 开新分支：

```bash
cd "D:/obsidian_md/starwater-player"
git fetch origin
git switch -c agent/world origin/main
```

给 Agent 2 的追加 Prompt：

```text
M1 已通过。现在你执行 PRD 的 A3，当前分支为 agent/world。
只允许修改 src/world/**、自身新增资产和对应测试。
完成地形、蓝花坡、溪流与踏石、花树、远山和碰撞数据。
所有关键坐标来自 config/world.ts；可染色材质通过接口注入。
交付后运行 typecheck、test、build，推送并创建 [A3] Add watercolor exploration world PR。
不要在本轮修改玩家、染色、故事或共享配置。
```

A3 合并后形成 M2，再依次集成 A4 和 A5，最后由 Agent 4 执行完整 A6 验收。

---

## 8. 分支同步与冲突处理

### 8.1 正常同步

只有工作区已提交、且集成者宣布 main 更新后，模块 Agent 才执行：

```bash
git fetch origin
git rebase origin/main
```

出现冲突时：

- 保留双方真正需要的功能，不直接整边覆盖。
- 涉及 `core/contracts.ts`、坐标或依赖时停止，交集成者裁决。
- rebase 后重新运行 typecheck、test、build，再更新 PR。

### 8.2 明确禁止

- 四个 Agent 同时在主目录开发。
- 直接推 main，绕过 PR 和集成验收。
- 为了消除冲突而删除对方功能。
- 未提交就 rebase、切换分支或强制拉取。
- 使用 force push 覆盖别人分支；确需重写自己分支时先说明并取得集成者确认。
- 修改测试断言来掩盖业务缺陷。

---

## 9. 用户每轮只需做的检查

1. 这个 Agent 是否只收到一个明确任务。
2. 工作目录和分支是否与任务匹配。
3. 是否越权修改共享文件或其他 Agent 目录。
4. PR 是否附真实测试结果，而非“应该可以运行”。
5. 当前合并属于哪个里程碑，是否越过 M1/M2 放行门槛。
6. 合并后是否重新执行构建、测试和核心体验检查。

---

## 10. 里程碑完成定义

| 里程碑 | 四人协作下的完成条件 |
|---|---|
| M0 | Agent 1 的工程骨架、契约、坐标和测试脚本可运行，main 已建立 |
| M1 | A1 + A2 集成，移动与世界染色成立 |
| M2 | A3 集成，完整主路线可走通且无软锁 |
| M3 | A4 集成，三节点、伙伴、星屑、结局和重置成立 |
| M4 | A5/A6 集成，VFX、性能记录和 AC-01～12 验收完成 |

项目协作的核心不是让四个人写得更久，而是让每个人只对一个清晰模块负责，并让 main 始终处于可构建、可回滚状态。
