# A6 最终验收报告（main · 发布候选门禁）

> 执行者：Agent 4（A6 测试与验收）
> 验收分支：**`main`**（集成者已合并三条 PR）
> 验收基线：`e666dc6fcece2bad3cd60586f5c3b10653399f66`（HEAD）
> 已合并 PR 提交：`c48f71f`（finale-camera）、`044b2bc`（finale-reveal）、`66ed509`（rc-acceptance）
> 日期：2026-11-17
> 运行环境：Node **v24.22.2**（`C:\Users\Administrator\AppData\Local\Programs\node-v24.22.2-win-x64`），npm 11.19.1
> 原则：**只改测试与本报告，不动业务代码；未删断言、未加宽松等待、未降阈值；FPS 一律取自真 GPU，不用 SwiftShader 冒充。**

---

## 1. 基线与 P0 缺口闭合状态

| 项                    | 状态         | 证据                                                                                                                                                                             |
| --------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1～A5 集成           | ✅ 已在 main | `main.ts` 挂载 `player → reveal → world → narrative → vfx → camera`                                                                                                              |
| P0-1 结局镜头平滑拉远 | ✅ 闭合      | `src/player/CameraRig.ts`（`CAMERA_FINALE_*` / `finaleActive`）、`tests/unit/finale-camera.test.ts`；RC-01 e2e 通过                                                              |
| P0-2 远山显色         | ✅ 闭合      | `src/rendering/FinaleReveal.ts`、`RevealSystem.ts`、`WatercolorMaterial.ts`（`uFinaleReveal`/`uFinaleSaturation`）、`tests/unit/rendering/finale-reveal.test.ts`；RC-02 e2e 通过 |
| AC-10 真机性能        | ✅ 闭合      | RTX 3060 硬件加速，中位 165 / 低帧 164.7 FPS（§3）                                                                                                                               |
| release tag           | **未创建**   | `git tag -l` 为空；本轮不建 tag、不自行发布，放行由集成者决定                                                                                                                    |

结论：**P0 缺口与 AC-10 均已闭合**，满足「宣布 M4 完全通过」的前置条件；但是否打 tag / 宣布 RC 由集成者按流程决定，本轮不越权代为发布。

---

## 2. 真实命令结果（全部基于最新 main + Node 24）

| 命令                                                                                          | 结果    | 数字                                                                    |
| --------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| `npm ci`                                                                                      | ✅ 通过 | 154 包，29s；`package-lock.json` 未改动                                 |
| `npm run typecheck`                                                                           | ✅ 通过 | strict，0 错误                                                          |
| `npm run lint`                                                                                | ✅ 通过 | 0 错误                                                                  |
| `npm run format:check`                                                                        | ✅ 通过 | All matched files use Prettier code style                               |
| `npm test`                                                                                    | ✅ 通过 | **24 文件 / 272 用例通过**                                              |
| `npm run build`                                                                               | ✅ 通过 | 64 modules；`index.js` 100.17 kB、CSS 2.74 kB、`three` vendor 537.76 kB |
| `npm run test:e2e`                                                                            | ✅ 通过 | **32/32 用例通过**（含 RC-01～04），9.6 分钟，0 失败                    |
| `A6_SAMPLE_SEC=600 A6_SAMPLE_TAG=10min npx playwright test tests/e2e/a6-perf-collect.spec.ts` | ✅ 通过 | **269 采样 / 600s**，错误 0、资源无增长（§3.3）                         |
| `npm run test:e2e:hw`                                                                         | ✅ 通过 | **AC-10 真机门禁 PASS**，60s（§3.2）                                    |

> 环境备注：`npm ci` 输出 esbuild postinstall 未执行的告警（npm 11 allowScripts 机制），
> 但 typecheck / test / build / e2e 全部真实成功，未造成任何影响。
>
> 执行备注：10 分钟采集首次启动时被沙箱的批量删除保护拦截（Playwright 清理 3141 个历史产物）。
> 用「目录重命名归档（非删除）」保留旧产物后重跑即通过；这是工具保护机制，不是业务缺陷。

---

## 3. 性能记录与采样 JSON 路径

### 3.1 测试设备与浏览器（真机，全部实测字段）

| 项           | 值                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 提交哈希     | `e666dc6fcece2bad3cd60586f5c3b10653399f66`                                                                                                                        |
| CPU          | 12th Gen Intel(R) Core(TM) i5-12500H，16 逻辑核                                                                                                                   |
| GPU          | **NVIDIA GeForce RTX 3060 Laptop GPU**（ANGLE / D3D11 vs_5_0 ps_5_0，驱动 32.0.16.2114）                                                                          |
| 内存         | 15.7 GiB                                                                                                                                                          |
| 浏览器       | Google Chrome 157（`HeadlessChrome/157.0.0.0`，Playwright `channel=chrome`）                                                                                      |
| 分辨率       | **1920×1080**                                                                                                                                                     |
| DPR          | **1**（运行时 `DPR_CAP=1.5` 收敛；系统 DPR=1）                                                                                                                    |
| 采样时长     | **60 秒**（60 个采样点，1 Hz）                                                                                                                                    |
| 渲染设备确认 | `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU ...) Direct3D11` —— **不是 SwiftShader**；用例内置硬门禁，命中 SwiftShader/software/llvmpipe/softpipe 立即失败 |
| OS / Node    | Windows 10.0.26300 / **v24.22.2**                                                                                                                                 |

采样 JSON 路径（本机，非源码）：

- **真机 AC-10 证据**：`test-results/rc-ac10-hardware.json`（含 60 个采样点、全部设备字段、PASS 判定）
- **10 分钟稳定性证据**：`test-results/a6-perf-10min.json`（269 个采样点）
- 对照用（软件渲染，**不作结论**）：`test-results/a6-ac10-1080p.json`、`test-results/a6-perf-short.json`

### 3.2 AC-10 真机结果（`test-results/rc-ac10-hardware.json`）

| 指标            | 实测                                                          | 目标     | 判定    |
| --------------- | ------------------------------------------------------------- | -------- | ------- |
| 中位 FPS        | **165**                                                       | ≥55      | ✅ 通过 |
| 低帧 FPS        | **164.7**                                                     | ≥30      | ✅ 通过 |
| Draw Calls 峰值 | 45                                                            | ≤180     | ✅ 通过 |
| 三角面峰值      | 50,005                                                        | ≤350,000 | ✅ 通过 |
| 运行时错误      | 0（favicon.ico 浏览器自动 404 已按 URL 精确排除，非游戏错误） | 0        | ✅ 通过 |

FPS 全程稳定在 164.7～165.2，无下降趋势。`ac10.verdict = "PASS"`。

### 3.3 10 分钟稳定性（AC-09，`test-results/a6-perf-10min.json`）

| 指标          | 实测                                             | 判定                                              |
| ------------- | ------------------------------------------------ | ------------------------------------------------- |
| 采样点数      | 269（600s，SwiftShader 软件渲染）                | —                                                 |
| Draw Calls    | 峰值 45，首段 45 → 末段 31（区间 31～45）        | ✅ 无单调增长                                     |
| 三角面        | 峰值 50,005，首段 50,005 → 末段 45,585           | ✅ 无单调增长                                     |
| 运行时错误    | `maxErrorCount=0`；`pageerror`/`console.error`=0 | ✅ 无未处理异常                                   |
| 中位/低帧 FPS | 20 / 20                                          | 软件渲染封顶，**仅作稳定性观测，不作 AC-10 结论** |

### 3.4 软件渲染 vs 真机（为何 20 FPS 是假象）

| 后端                   | 配置                                                               | 中位/低帧 FPS | 用途                                     |
| ---------------------- | ------------------------------------------------------------------ | ------------- | ---------------------------------------- |
| SwiftShader 软件光栅化 | 默认 `playwright.config.ts`（`--use-angle=swiftshader`）           | 20 / 20       | 功能 e2e、稳定性观测；**不得用于 AC-10** |
| 真 GPU RTX 3060        | `playwright.hw.config.ts`（`channel=chrome`，无 SwiftShader 参数） | 165 / 164.7   | **AC-10 唯一判定依据**                   |

---

## 4. AC-01～12 逐项真实结果（通过 / 失败 / 环境阻塞）

| AC    | 验收项       | 结论    | 真实依据                                                                                                                                                            |
| ----- | ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | 启动与构建   | ✅ 通过 | `npm ci` + typecheck/lint/format:check/test/build 全绿；e2e 页面进入、canvas 非零、无异常                                                                           |
| AC-02 | 移动与镜头   | ✅ 通过 | M1-1 e2e；`camera-rig.test.ts` 14 例；`finale-camera.test.ts` 23 例（逐帧 <0.2m）；**RC-01** 端到端 8→13m 平滑拉远、reset 复位                                      |
| AC-03 | 脚下染色     | ✅ 通过 | A1 e2e「L 形路径不被镜像」+ `mask-mapping.test.ts` 12 例                                                                                                            |
| AC-04 | 持续染色     | ✅ 通过 | M1-3 e2e「离开后返回颜色仍在」+ `color-reveal-mask.test.ts` 14 例                                                                                                   |
| AC-05 | 跨材质一致   | ✅ 通过 | M1-4 e2e（纹理 uuid == uniform）+ `watercolor-material.test.ts` 10 例；**RC-02** 证实远山显色只作用界外、界内遮罩不变                                               |
| AC-06 | 三个故事节点 | ✅ 通过 | M3 e2e 三节点闭环 + 对话 + `story-system.test.ts` 13 例（前置/幂等）                                                                                                |
| AC-07 | 伙伴与收集   | ✅ 通过 | `companion.test.ts` 11 例（>12m / 卡住 2s 回收）、`shards.test.ts` 5 例（去重）、M3 HUD 0/3→3/3                                                                     |
| AC-08 | 结局与重置   | ✅ 通过 | **RC-03** 结局 UI 延迟 ≥2s（`delaySeconds=2.5`）；**RC-04** 重置后完整二次通关；M3 + `reset.test.ts` 4 例                                                           |
| AC-09 | 稳定性       | ✅ 通过 | **真实 10 分钟**：269 采样、错误 0、drawCalls/三角面无单调增长（§3.3）                                                                                              |
| AC-10 | 性能         | ✅ 通过 | **真机 RTX 3060 / Chrome 157 / 1920×1080 / DPR 1 / 60s**：中位 165、低帧 164.7 FPS、drawCalls 45、三角面 50,005（§3.2）；SwiftShader 的 20 FPS 已弃用               |
| AC-11 | 可调试性     | ✅ 通过 | `?debug=1`：FPS/帧时间/Draw Calls/三角面/系统列表、reveal 缩略图/笔刷（含 finale）、player 坐标、story step/shards、vfx 统计、camera finale；M1-5/M4/A1/RC e2e 断言 |
| AC-12 | 数据解耦     | ✅ 通过 | M3 e2e + `story-data.test.ts` 12 例；文本来自 `story.json`、坐标来自 `config/world.ts`；两个 P0 修复均由共享 `story:completed` 事件驱动，未新增故事状态             |

汇总：**12 项全部通过；0 失败；0 环境阻塞。**

---

## 5. 两个 P0 修复的集成 e2e（main 上真实结果）

| 用例  | 验证内容                                                                                               | 结果    |
| ----- | ------------------------------------------------------------------------------------------------------ | ------- |
| RC-01 | 花树完成后镜头进入运镜态、目标 13m、单调不回退、收敛不过冲、reset 回 8m；逐帧 <0.2m 由 A2 单测严格覆盖 | ✅ 通过 |
| RC-02 | 远山显色只响应 tree（flower 时为 0）、单调推进至 ~1、reset 归零、不改变界内遮罩                        | ✅ 通过 |
| RC-03 | 结局 UI 在花树完成后仍延迟 ≥2s 出现（未被 P0 修复破坏）                                                | ✅ 通过 |
| RC-04 | 结局页按钮重置后镜头/远山/星屑/结局全复位，并可完整二次通关再次进入结局                                | ✅ 通过 |

---

## 6. 失败项、缺陷与责任划分

### 6.1 本轮失败项

**无。** 全部 6 组命令真实通过，AC-01～12 全部通过，0 断言失败、0 未处理异常。

### 6.2 AC-10 不达标时的责任划分预案（本轮未触发）

真机复测 **PASS**，无需按渲染负载归因。若未来回归不达标，按以下顺序定位，交对应模块负责人修复，**不改断言放行**：

| 优先级 | 疑点                                             | 责任模块                     |
| ------ | ------------------------------------------------ | ---------------------------- |
| 1      | 遮罩更新频率、脏更新失效、CanvasTexture 每帧上传 | **A1**（`src/rendering/**`） |
| 2      | 三角面预算、透明层叠加面积、InstancedMesh 批次   | **A3**（`src/world/**`）     |
| 3      | 花瓣/涟漪粒子叠加、透明过度绘制                  | **A5**（`src/effects/**`）   |

### 6.3 环境问题（非业务缺陷，已记录）

| 编号          | 问题                                                        | 归属                        | 状态                                      |
| ------------- | ----------------------------------------------------------- | --------------------------- | ----------------------------------------- |
| ENV-01        | `npm ci` 的 esbuild postinstall 告警（npm 11 allowScripts） | 构建环境                    | 未影响任何命令，全绿                      |
| ENV-02        | Playwright 清理 3141 个历史产物触发沙箱批量删除保护         | 测试环境                    | 目录重命名归档后重跑通过                  |
| RC-D3（历史） | 浏览器自动请求 `/favicon.ico` 的 404                        | A0 / `index.html`（非阻塞） | 真机用例按 URL 精确排除，其余错误照常捕获 |

---

## 7. 最终 M4 结论

**M4：完全通过（AC-01～12 全通过，P0 缺口与 AC-10 全部闭合）。**

- 两个 P0 修复（结局镜头拉远、远山显色）在**集成后的 main** 上有端到端 e2e 实测。
- 性能在**硬件加速的真实 Chrome 157 + RTX 3060** 上复测达标（中位 165 / 低帧 164.7 FPS），SwiftShader 的 20 FPS 明确弃用、不作结论。
- 稳定性（10 分钟）、资源预算、数据解耦均有真实依据；无失败项、无环境阻塞。
- **未创建 release tag、未自行合并或发布**；是否打 tag / 宣布 RC 由集成者按流程决定。

---

## 8. 复现命令（Node 24）

```bash
export PATH="/c/Users/Administrator/AppData/Local/Programs/node-v24.22.2-win-x64:$PATH"
cd D:/obsidian_md/hoshino/starwater-demo

npm ci
npm run typecheck && npm run lint && npm run format:check
npm test && npm run build
npm run test:e2e
A6_SAMPLE_SEC=600 A6_SAMPLE_TAG=10min npx playwright test tests/e2e/a6-perf-collect.spec.ts
npm run test:e2e:hw        # 需真 GPU Chrome；命中 SwiftShader 会失败
```
