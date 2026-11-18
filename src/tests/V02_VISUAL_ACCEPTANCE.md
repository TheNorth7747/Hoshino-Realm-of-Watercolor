# Hoshino V0.2 视觉验收报告（Agent 4 · VFX / 截图 / 独立 QA）

> 分支：`visual/vfx-qa`　工作目录：`D:/obsidian_md/hoshino-v02-qa`
> 代码基线：main `a7781e6c122d677d1fa41d737b1f4f94b7a4778f`（HEAD，与 origin/main 同步）
> 已读：`docs/PRD.md`、`docs/V02_VISUAL_WORKFLOW.md`、`src/tests/A6_ACCEPTANCE_REPORT.md`
> 日期：2026-11-18　Node：v24.22.2（质量命令）/ npm 11.19.1
> 边界：**只改 `src/effects/**`、测试、截图采集脚本与本报告**；未修改 rendering / player / world / narrative 业务实现；
> 未删除或放宽任何既有断言，未降低 AC 标准，未自行合并，未创建 release tag。

---

## 1. 五组真实游戏截图

采集脚本：`tests/visual/v02-screenshots.spec.ts`，配置：`tests/visual/playwright.visual.config.ts`
运行：`npx playwright test -c tests/visual/playwright.visual.config.ts`

| #   | 场景   | 文件（`test-results/visual-v02/`） | 玩家 z（真实键盘走位） | 故事步骤 / 星屑 | 花瓣（近/中/远）        | 结局 UI  |
| --- | ------ | ---------------------------------- | ---------------------- | --------------- | ----------------------- | -------- |
| 1   | 开场   | `01-opening.png`                   | 32（出生点）           | intro / 0/3     | 0/0/0                   | 隐藏     |
| 2   | 蓝花坡 | `02-flower-hill.png`               | 19.57                  | stream / 1/3    | 0/0/0                   | 隐藏     |
| 3   | 溪流   | `03-stream.png`                    | 7.58                   | tree / 2/3      | 0/0/0                   | 隐藏     |
| 4   | 花树   | `04-flower-tree.png`               | -20.9（树根触发圈内）  | finished / 3/3  | **8/26/22（共 56）**    | **隐藏** |
| 5   | 结尾   | `05-ending.png`                    | -20.9                  | finished / 3/3  | 0/0/0（已按 2.4s 回收） | **显示** |

规格与真实性保障（全部为自动结构/状态断言，无逐像素断言）：

- **1280×720**，`deviceScaleFactor=1`，真实硬件加速 Google Chrome 157（`channel=chrome`，
  不注入 `--use-angle=swiftshader`）；渲染设备 `ANGLE (NVIDIA GeForce RTX 3060 Laptop GPU, D3D11)`，
  断言命中 SwiftShader/software 即失败。
- 截图来自**实际运行页面**的 `page.screenshot()`：断言 canvas 非零、每张 PNG > 10KB、
  文件字节数与截图缓冲一致。未使用参考帧、静态拼图或任何预置图片。
- **无调试 UI**：截图前隐藏 `#debug-root`、`.sw-debug` 与 3D `debug-helpers` group，
  并断言三者均不可见；HUD / 对话 / 结局卡属正常游戏 UI，保留。
  节点推进使用 PRD 11.4 允许的 `?debug=1` 调试按钮（真实 StorySystem 状态机），
  点击后恢复面板、截图前再隐藏。
- 玩家位置由**真实 Shift+W 键盘移动**到达（轮询 `PlayerSnapshot.position.z`），
  不是直接改坐标；因此每张图对应不同真实场景区域与脚下染色路径。
- 完整设备信息、五组状态与运行时错误记录：`test-results/visual-v02/manifest.json`（`runtimeErrors: []`）。
- `test-results/` 与 `.reference-video/` 均在 `.gitignore` 中：
  **参考视频/抽帧与本项目截图都不提交 Git**，可用上述命令随时复现。
  注意 Playwright 每次启动会清空 `test-results/`，因此截图与性能 JSON 应在最后一轮采集；
  本报告数据取自最后一次串行采集（五组截图 1/1 通过、真机 60s 采样、10 分钟稳定性采样）。

> 截图采集过程中发现并修正：早期版本只用调试按钮推进剧情、玩家停留在出生点，
> 花瓣生成在花树 `z=-22` 而相机在 `z=42`，全部落在视锥外（实测 `inView=0`）。
> 改为真实走位后，花树/结尾两张图能清楚看到粉色花瓣、粉色伞形树冠与大范围染色。

---

## 2. 完成项

| #   | 需求                                                                         | 实现                                                                                                                                                                                                                                                                                           | 验证                                                                                                                     |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | 花瓣近/中/远景层次：不同大小、旋转、横向风漂移、生命周期；控制总量与透明叠加 | `src/effects/Petals.ts` 重写为单 InstancedMesh 三层槽位（一次 draw call），三层 `sizeScale / spinScale / windScale / gravityScale / lifetimeScale / color / revealDelayMax` 各异；`opacity` 0.92→0.82；`instanceColor` 分层着色；`estimatedOverlayArea()` 与 `overlayAreaRatio()` 量化透明叠加 | 新增 11 例单测；断言面积比 ≤1（实测满容量 0.33）；总量恒 = capacity；`vfx.petals.near/mid/far/overlayRatio` 进入调试统计 |
| 2   | 结局先让世界/花树/镜头/花瓣被看见，再出现 UI；不改故事时序                   | 未改 `story.json`（`delaySeconds=2.5`）、`StorySystem`、`EndingOverlay`；VFX 侧以分层显现延迟（0.05/0.3/0.6s）+ 终端速度滞空，让花瓣在 UI 前铺满；`tree` 事件立即爆发保持同步                                                                                                                  | 新增 2 例 e2e：UI 隐藏时三层齐备、远山显色>0、镜头运镜中、世界 coverage>0；UI 仍 ≥2s 后出现；重置后二次通关复现分层      |
| 3/4 | 五组 1280×720 无调试 UI 真实截图；参考帧不入库                               | 见 §1                                                                                                                                                                                                                                                                                          | 独立 visual config + spec，manifest 记录全部状态                                                                         |
| 5   | 不增加跨 GPU 逐像素断言；结构/状态/性能仍自动断言                            | 截图 spec 只断言 DOM/canvas/粒子统计/故事步骤/GPU 型号；无 `toHaveScreenshot`                                                                                                                                                                                                                  | 34 例 e2e、283 例单测、真机门禁均通过                                                                                    |
| 6   | 保留并适配既有 RC/AC 测试；镜头契约变更先核对                                | 核对 Agent 2 `visual/camera-hero`：默认距离 8→**5m**、俯角 0.42→0.24、结局俯角 0.62→0.4，**结局 13m 契约未变**；把 RC-01 硬编码 8/13 改为读取 `CAMERA_DEFAULT_DISTANCE`/`CAMERA_FINALE_DISTANCE`，`>11m` 拉远幅度阈值原样保留。Agent 2 自有单测已同步改为常量引用                              | 既有 32 例 e2e 全部通过；无断言删除/放宽                                                                                 |
| 7   | 其他 PR 合并后 rebase 到最新 main + 完整 AC 回归 + 真机采样                  | `git fetch` 确认 origin/main 仍为 `a7781e6`（三个视觉 PR 各有 1 个提交但**均未合并**），当前分支已与最新 main 同步，无需 rebase；已执行全量回归与真机采样                                                                                                                                      | 见 §4                                                                                                                    |
| 8   | V0.2 视觉验收报告                                                            | 本文件                                                                                                                                                                                                                                                                                         | —                                                                                                                        |

---

## 3. 差距与责任模块（人工对照用，非阻塞项）

当前 main 只含 A0～A5 与两条 P0 修复的集成；**Agent 1/2/3 的 V0.2 视觉 PR 尚未合并**，
因此五组截图呈现的是基线场景，与参考视频的主要差距应由对应模块在合并后收窄：

| 差距                                                 | 现象（截图可见）     | 责任模块                                                                     | 建议                                                     |
| ---------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| 开场纸面偏空、脚下只有小片绿斑、线稿网格感强         | `01-opening.png`     | **Agent 1**（`visual/reveal-grade`：预染色半径、笔刷、噪声、天空/雾）        | 合并后重拍第 1 组对照                                    |
| 角色仍是锥体、镜头偏俯视、地平线靠上                 | `01/02/03`           | **Agent 2**（`visual/camera-hero`：5m 默认距离、0.24rad 俯角、红斗篷旅行者） | 合并后核对 RC-01 常量适配是否仍成立                      |
| 无暖土色小径、草花密度低、无普通树林、花树为球形树冠 | `01/02/03/04`        | **Agent 3**（`visual/world-art`：Path/Trees/Vegetation/伞形树冠）            | 合并后重拍第 2～4 组，复核 Draw Calls ≤150、三角面 ≤300k |
| 花瓣层次已实现，但远景层在 1280×720 下仍偏淡         | `04-flower-tree.png` | **Agent 4**（本分支）                                                        | 可调 `far.color / sizeScale`，但透明叠加比须维持 ≤1      |

> 返工顺序遵循手册 §7：先渲染+镜头，再场景，最后 VFX/QA；不得靠堆模型掩盖构图问题。

---

## 4. 测试与性能真实结果

基线：`a7781e6`，Node v24.22.2。以下均为串行执行（不并发 Playwright，避免产物目录竞态）。

| 命令                                                | 结果                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `npm run typecheck`                                 | ✅ 通过                                                       |
| `npm run lint`                                      | ✅ 通过                                                       |
| `npm run format:check`                              | ✅ 通过（自有文件已 prettier 格式化）                         |
| `npm test`                                          | ✅ **25 文件 / 283 用例通过**（既有 272 + 新增 11）           |
| `npm run build`                                     | ✅ 64 modules；`index.js` 103.87 kB、three vendor 537.76 kB   |
| `npm run test:e2e`                                  | ✅ **34/34 通过**（既有 32 + V0.2 新增 2），10.4 分钟，0 失败 |
| 五组截图 `tests/visual/playwright.visual.config.ts` | ✅ 1/1 通过，5 张 PNG + manifest，真 GPU、无调试 UI           |
| `A6_HW_SAMPLE_SEC=60 npm run test:e2e:hw`           | ✅ **AC-10 PASS**（165.1 / 164.3 FPS）                        |
| 10 分钟稳定性采集                                   | ✅ 269 采样 / 600s，错误 0，无资源增长（见 §4.2）             |

### 4.1 AC-10 真机硬件加速性能（唯一判定依据）

证据：`test-results/rc-ac10-hardware.json`（含 60 个采样点）

| 字段            | 实测                                                               |
| --------------- | ------------------------------------------------------------------ |
| 提交哈希        | `a7781e6c122d677d1fa41d737b1f4f94b7a4778f`                         |
| CPU             | 12th Gen Intel Core i5-12500H，16 逻辑核                           |
| GPU             | NVIDIA GeForce RTX 3060 Laptop（ANGLE / D3D11，驱动 32.0.16.2114） |
| 内存            | 15.7 GiB                                                           |
| 浏览器          | Google Chrome 157（`HeadlessChrome/157.0.0.0`）                    |
| 分辨率 / DPR    | 1920×1080 / 1（`DPR_CAP=1.5`）                                     |
| 采样时长        | 60 秒（60 点，1Hz）                                                |
| **中位 FPS**    | **165.1**（目标 ≥55）✅                                            |
| **低帧 FPS**    | **164.3**（目标 ≥30）✅                                            |
| Draw Calls 峰值 | 45（预算 ≤180，V0.2 手册目标 ≤150）✅                              |
| 三角面峰值      | 50,005（预算 ≤350k，V0.2 手册目标 ≤300k）✅                        |
| 运行时错误      | 0；渲染设备门禁确认非 SwiftShader                                  |
| FPS 区间        | 164.3 ～ 165.7，无下降趋势                                         |

> 并发执行时曾出现中位 126.1 / 低帧 74.8（与 e2e 同时跑、资源争用），该数据**不采用**；
> 报告只使用串行、无并发的干净采样。软件渲染（SwiftShader）的 20 FPS 仅用于功能与稳定性观测，
> **不作 AC-10 结论**。

### 4.2 10 分钟稳定性（AC-09）

证据：`test-results/a6-perf-10min.json`（269 个采样点，600 秒，SwiftShader 软件渲染）

| 指标          | 实测                                               | 判定                                              |
| ------------- | -------------------------------------------------- | ------------------------------------------------- |
| 运行时错误    | `maxErrorCount=0`；`pageerror`/`console.error` = 0 | ✅ 无未处理异常                                   |
| Draw Calls    | 首段 45 → 末段 31（区间 31～45，预算 ≤180）        | ✅ 无单调增长                                     |
| 三角面        | 首段 50,005 → 末段 45,585（区间 45,585～50,005）   | ✅ 无单调增长                                     |
| 中位/低帧 FPS | 20 / 20                                            | 软件渲染封顶，**仅作稳定性观测，不作 AC-10 结论** |

末段资源占用低于首段（玩家走到场景另一侧），无泄漏迹象；分层花瓣新增的 `instanceColor`
与三层槽位未引入持续增长。

### 4.3 AC-01～12 状态

沿用 `src/tests/A6_ACCEPTANCE_REPORT.md`（main `e666dc6` 的最终 A6 验收，12 项全通过）。
本分支在 `a7781e6` 上重跑全量命令与 34 例 e2e 全部通过，AC-10 由真 GPU 165.1/164.3 FPS 复验通过；
未改变任何 AC 断言语义，无失败项、无环境阻塞项。

---

## 5. 过程中发现并闭环的问题（均不改断言放行）

| 编号   | 问题                                                                      | 责任方   | 处理                                                                                                                                          |
| ------ | ------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V02-D1 | 分层配额导致 `burst(count≥capacity)` 填不满（80/90），破坏 A5「池满」语义 | Agent 4  | `burst` 改为「按比例 + 补足」两阶段，总量恒 = min(count, capacity)                                                                            |
| V02-D2 | 终端速度让花瓣滞空，M4「7s 后全部回收」失败（残留 31→12）                 | Agent 4  | 实测 SwiftShader 7s 墙钟仅推进 2.58s 游戏时间；把分层生命周期上限压到 2.4s 游戏时间（仍长于 A5 实际 ~1.5s），M4 单条复验通过、全量 34/34 通过 |
| V02-D3 | 截图流程只用调试按钮、玩家留在出生点，花瓣全在视锥外                      | Agent 4  | 改为真实 Shift+W 走位（32→19.8→8.0→-20.9），花树/结尾图花瓣清晰可见                                                                           |
| V02-D4 | 新增 e2e 在结局 UI 出现后断言「花瓣>0」，与压缩后的生命周期契约矛盾       | Agent 4  | 观测点移到 UI 出现前（符合"世界先被看见"时序），UI 后改为断言运镜/远山/星屑/treeBursts；非删断言                                              |
| V02-D5 | 并发跑 e2e 与真机采样时 `test-results` 清理竞态导致 A1 trace ENOENT       | 测试环境 | 串行执行；A1 单条复验通过；非业务缺陷                                                                                                         |

---

## 6. 复现命令

```bash
export PATH="/c/Users/Administrator/AppData/Local/Programs/node-v24.22.2-win-x64:$PATH"
cd D:/obsidian_md/hoshino-v02-qa

npm ci
npm run typecheck && npm run lint && npm run format:check
npm test && npm run build
npm run test:e2e                                             # 34 用例
npx playwright test -c tests/visual/playwright.visual.config.ts   # 五组真 GPU 截图
A6_HW_SAMPLE_SEC=60 npm run test:e2e:hw                     # AC-10 真机门禁
A6_SAMPLE_SEC=600 A6_SAMPLE_TAG=10min \
  npx playwright test tests/e2e/a6-perf-collect.spec.ts --project=chromium   # 10 分钟稳定性
```

> 集成后（Agent 1/2/3 PR 合并到 main）需 rebase 并重跑以上全部命令，
> 特别是 RC-01（默认距离 8→5m 的常量适配）与性能预算（场景密度提升后 Draw Calls / 三角面）。
