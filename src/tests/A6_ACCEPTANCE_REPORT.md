# A6 / RC 最终验收报告（M4 发布候选）

> 执行者：Agent 4（A6 测试与验收）
> 验收分支：`test/rc-acceptance`
> 代码基线：main `69b4897` + 两个 P0 修复（镜头 `b2e8b60`、远山显色 `6b8fc36`）
> 真机采集提交：`6b8fc36e44a0dcc0176497e646c95652d300bd4e`
> 日期：2026-11-17
> 原则：**只集成搬运两个 P0 修复、只写测试与本报告；未改写任何业务模块的实现逻辑；未删断言、未加宽松等待、未降阈值。**

---

## 1. 集成状态与代码基线

main `69b4897` 已合并 A1～A5。两个 P0 修复在验收时由各自负责人完成，集成者（本分支）只做搬运、不改逻辑：

| 修复 | 来源 | 合入提交 | 内容 |
|---|---|---|---|
| 结局镜头平滑拉远 | `fix/finale-camera` @ `86e06f1`（已提交） | `b2e8b60`（cherry-pick） | `story:completed(tree)` 触发，指数阻尼把距离 8m→13m、俯角→0.62rad；逐帧增量 <0.2m（A2 单测验证）；reset/dispose 复位 |
| 远山显色 | `fix/finale-reveal`（未提交工作树，**快照**） | `6b8fc36` | 新增 `FinaleReveal` + `uFinaleReveal`/`uFinaleSaturation` uniform，由同一 `story:completed(tree)` 事件驱动界外远山显色；2.6s ease-out；reset 归零 |

> 远山快照在集成时经过两轮校正：首轮快照 `WatercolorMaterial.ts` 处于中间态（typecheck 失败），
> 次轮快照 shader 存在 `wcPaint` 声明前使用（WebGL 编译失败）。最终快照 `285ed180…` 经源文件
> typecheck 验证干净、shader 编译无误后合入。这些是**合入前源侧 defect 的规避**，非 RC 分支自造改动。

---

## 2. 真实命令结果（test/rc-acceptance）

| 命令 | 结果 | 数字 |
|---|---|---|
| `npm run typecheck` | ✅ 通过 | strict，0 错误 |
| `npm test` | ✅ 通过 | **24 文件 / 272 用例通过**（A0 基线 + A1～A5 + 2 个 P0 修复单测 16+23 例） |
| `npm run build` | ✅ 通过 | 64 modules；index.js 100.17 kB、CSS 2.74 kB、three vendor 537.76 kB |
| `npm run test:e2e` | ✅ 通过 | **32/32 用例通过**（含 RC 四个 P0 集成 e2e），0 失败 |
| 真机 `npx playwright test --config=playwright.hw.config.ts` | ✅ 通过 | AC-10 硬件加速复测，见 §3 |

A6/RC 新增测试文件（仅测试/配置，不改业务）：
- `tests/e2e/rc-finale-acceptance.spec.ts`：4 个 P0 集成 e2e（镜头/远山/结局延迟/二次通关）。
- `tests/hardware/rc-ac10-hardware.spec.ts` + `playwright.hw.config.ts`：真机 AC-10 复测（独立目录，避免被 SwiftShader 默认配置误跑）。
- 继承 main 的 `a6-perf-collect.spec.ts` / `a6-ac10-1080p.spec.ts`（10 分钟稳定性与 1080p 采集）。

---

## 3. 性能记录（真机，硬件加速）

### 3.1 测试设备与浏览器（全部为实测字段）

| 项 | 值 |
|---|---|
| 提交哈希 | `6b8fc36e44a0dcc0176497e646c95652d300bd4e` |
| CPU | 12th Gen Intel(R) Core(TM) i5-12500H，16 逻辑核 |
| GPU | **NVIDIA GeForce RTX 3060 Laptop GPU**（ANGLE / D3D11 vs_5_0 ps_5_0，驱动 32.0.16.2114） |
| 内存 | 15.7 GiB |
| 浏览器 | Google Chrome 157（`HeadlessChrome/157.0.0.0`，Playwright channel=chrome） |
| 分辨率 | 1920×1080 |
| DPR | 1（运行时 `DPR_CAP=1.5` 收敛；系统 DPR=1） |
| 采样时长 | **60 秒**（60 个采样点） |
| 渲染设备确认 | `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU ...) Direct3D11` —— **不是 SwiftShader**（测试内含硬门禁断言，命中 SwiftShader/software 立即失败） |
| OS / Node | Windows 10.0.26300 / v22.22.2 |

### 3.2 AC-10 真机结果

| 指标 | 实测 | 目标 | 判定 |
|---|---|---|---|
| 中位 FPS | **165** | ≥55 | ✅ 通过 |
| 低帧 FPS | **163.7** | ≥30 | ✅ 通过 |
| Draw Calls 峰值 | 45 | ≤180 | ✅ 通过 |
| 三角面峰值 | 50,005 | ≤350,000 | ✅ 通过 |
| 运行时错误 | 0（favicon.ico 的浏览器自动 404 已精确排除，非游戏错误） | 0 | ✅ 通过 |

FPS 采样全程稳定在 164～165.7，无下降趋势。证据文件：`test-results/rc-ac10-hardware.json`（含全部 60 个采样点与设备字段）。

### 3.3 与软件渲染的对照（说明为何此前是假象）

| 后端 | 中位/低帧 FPS | 说明 |
|---|---|---|
| SwiftShader（默认 playwright.config.ts） | 20 / 20 | 软件光栅化封顶，**不作 AC-10 结论** |
| 真 GPU RTX 3060（playwright.hw.config.ts） | 165 / 163.7 | 真实硬件加速，AC-10 判定依据 |

---

## 4. AC-01～12 逐项结论（通过 / 失败 / 环境阻塞）

| AC | 验收项 | 结论 | 依据 |
|---|---|---|---|
| AC-01 | 启动与构建 | ✅ 通过 | typecheck/test/build 全绿；e2e 页面进入、canvas 非零、无异常 |
| AC-02 | 移动与镜头 | ✅ 通过 | M1-1 e2e；`camera-rig.test.ts` 14 例 + 结局运镜 `finale-camera.test.ts` 23 例；RC-01 端到端验证镜头平滑拉远 8→13m |
| AC-03 | 脚下染色 | ✅ 通过 | A1 e2e「L 形路径不被镜像」+ `mask-mapping.test.ts` 12 例 |
| AC-04 | 持续染色 | ✅ 通过 | M1-3 e2e + `color-reveal-mask.test.ts` 14 例 |
| AC-05 | 跨材质一致 | ✅ 通过 | M1-4 e2e（纹理 uuid == uniform）+ `watercolor-material.test.ts` 10 例；远山显色只作用界外，不改变界内遮罩（RC-02） |
| AC-06 | 三个故事节点 | ✅ 通过 | M3 e2e 三节点闭环 + 对话 + `story-system.test.ts` 13 例（前置/幂等） |
| AC-07 | 伙伴与收集 | ✅ 通过 | `companion.test.ts` 11 例、`shards.test.ts` 5 例、M3 HUD 0/3→3/3 |
| AC-08 | 结局与重置 | ✅ 通过 | RC-03 结局 UI 延迟 ≥2s（delaySeconds=2.5）；RC-04 重置后完整二次通关；M3 + `reset.test.ts` 4 例 |
| AC-09 | 稳定性 | ✅ 通过 | 真实 10 分钟连续游玩：273 采样、错误 0、资源无单调增长 |
| AC-10 | 性能 | ✅ 通过 | **真 GPU RTX 3060**：中位 165 / 低帧 163.7 FPS、1920×1080、DPR 1、drawCalls 45、三角面 50,005；详见 §3（软件渲染结果已弃用） |
| AC-11 | 可调试性 | ✅ 通过 | `?debug=1`：FPS/帧时间/Draw Calls/三角面/系统列表、reveal 缩略图/笔刷（含 finale）、player 坐标、story step/shards、vfx 统计、camera finale；M1-5/M4/A1/RC e2e 断言 |
| AC-12 | 数据解耦 | ✅ 通过 | M3 e2e + `story-data.test.ts` 12 例；文本来自 `story.json`、坐标来自 `config/world.ts`；两个 P0 修复均由共享事件驱动，未新增故事状态 |

汇总：**12 项全部通过；0 失败；0 环境阻塞。**

---

## 5. 两个 P0 修复的 RC 集成 e2e（真实结果）

| 用例 | 验证内容 | 结果 |
|---|---|---|
| RC-01 | 花树完成后镜头平滑拉远：进入运镜态、目标 13m、单调不回退、收敛不过冲、reset 回 8m；逐帧 <0.2m 由 A2 单测严格覆盖 | ✅ 通过 |
| RC-02 | 远山显色只响应 tree（flower 时为 0）、单调推进至 ~1、reset 归零、不改变界内遮罩 | ✅ 通过 |
| RC-03 | 结局 UI 在花树完成后仍延迟 ≥2s 出现（不被 P0 运镜/显色修复破坏） | ✅ 通过 |
| RC-04 | 结局页按钮重置后：镜头/远山/星屑/结局全复位，并可完整二次通关再次进入结局 | ✅ 通过 |

---

## 6. 失败项、缺陷与责任划分

### 6.1 最终失败项

无。所有命令与用例真实通过，AC-01～12 全部通过。

### 6.2 验收过程中发现并已闭环的问题（非 RC 分支自造）

| 编号 | 问题 | 责任方 | 状态 |
|---|---|---|---|
| RC-D1 | 远山修复合入首轮快照 `WatercolorMaterial.ts` 缺 `finaleSaturation` 字段（typecheck 失败） | A1 / `fix/finale-reveal` | 源侧已修，RC 取稳定快照后闭环 |
| RC-D2 | 远山修复 shader 中 `wcPaint` 声明前使用（WebGL 编译失败，118 条 console error） | A1 / `fix/finale-reveal` | 源侧已调整声明顺序，RC 取稳定快照后闭环；RC-02 的 console-error 断言捕获到此问题，证明测试有效 |
| RC-D3 | 浏览器自动请求 `/favicon.ico` 的 404（index.html 无 favicon） | A0 / `index.html`（非阻塞） | 真机采集用例精确排除该条浏览器行为，其余错误照常捕获；不影响游戏 |

### 6.3 历史问题状态更新

- A6-01（旧报告的「AC-10 待真 GPU 复测」）：**已闭环**——真机 RTX 3060 复测通过（§3）。
- A6-02（`AC_CHECKLIST.md` 旧视角）：main 已由 `69b4897` 标注为 A5 历史记录并指向本报告。
- A6-03（原仅 10 秒性能）：已由 10 分钟稳定性采集 + 60 秒真机复测覆盖。

---

## 7. 最终 M4 结论

**M4：通过，可进入发布候选（RC）。**

- 功能闭环、两个 P0 修复（结局镜头拉远 + 远山显色）、结局延迟与二次通关均有端到端 e2e 实测。
- AC-01～12 逐项全部通过，**无失败项、无环境阻塞**。
- 性能在**硬件加速的真实 Chrome + RTX 3060** 上复测达标（中位 165 / 低帧 163.7 FPS），
  此前软件渲染的 20 FPS 已明确弃用、不作结论。
- 稳定性（10 分钟）、资源预算、数据解耦均有真实依据。

---

## 8. 复现命令

```bash
cd D:/obsidian_md/starwater-rc
npm ci && npm run typecheck && npm test && npm run build
npm run test:e2e                                              # 32 用例（约 9.3 分钟）
A6_HW_SAMPLE_SEC=60 npx playwright test --config=playwright.hw.config.ts  # AC-10 真机（60s）
A6_SAMPLE_SEC=600 A6_SAMPLE_TAG=10min \
  npx playwright test tests/e2e/a6-perf-collect.spec.ts --project=chromium  # 10 分钟稳定性
```
