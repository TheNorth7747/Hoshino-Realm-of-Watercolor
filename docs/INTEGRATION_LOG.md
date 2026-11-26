# 集成记录（Integration Log）

> 维护者：Agent 1（架构与集成）
> 原则：**只记录真实发生过的合并与门禁结果**。此前 A1～A5、M1～M4 是直接 `merge --no-ff` 进 main，
> 没有 PR 记录，本文件不回填、不伪造这些历史 PR。

---

## 1. 当前基线

| 项 | 值 |
|---|---|
| 分支 | `main` |
| 合并顺序 | finale-camera → finale-reveal → rc-acceptance |
| 合并提交 | `c48f71f` → `044b2bc` → `66ed509`（+ `946738b` 收尾整理） |
| 质量门禁 | typecheck / lint / format:check / **272 unit** / build / **32 e2e** —— 全绿 |

---

## 2. 本轮合并（按指定顺序）

| # | PR | 分支 | 分支 head | 合并提交 | 本次真实引入 | 门禁结果 |
|---|---|---|---|---|---|---|
| 1 | finale-camera | `fix/finale-camera` | `86e06f1` | `c48f71f` | `src/player/CameraRig.ts`、`src/player/index.ts`、`tests/unit/finale-camera.test.ts` | 256 unit / 28 e2e / build 97.85 kB ✅ |
| 2 | finale-reveal | `fix/finale-reveal` | `16a7f0d` | `044b2bc` | `src/rendering/FinaleReveal.ts`（新）、`RevealSystem.ts`、`WatercolorMaterial.ts`、`index.ts`、`tests/unit/rendering/finale-reveal.test.ts` | 272 unit / 28 e2e / build 100.17 kB ✅ |
| 3 | rc-acceptance | `test/rc-acceptance` | `d98bbcb` | `66ed509` | `playwright.hw.config.ts`（新）、`tests/e2e/rc-finale-acceptance.spec.ts`（新）、`tests/hardware/rc-ac10-hardware.spec.ts`（新）、`src/tests/A6_ACCEPTANCE_REPORT.md` | 272 unit / **32 e2e** / build 100.17 kB ✅ |

### PR 链接

本机无 `gh`、环境无 `GITHUB_TOKEN`/`GH_TOKEN`，无法通过 API 建 PR。以下为 **compare 页**（分支已推送，可直接开 PR）：

- finale-camera → `https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor/compare/main...fix/finale-camera?expand=1`
- finale-reveal → `https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor/compare/main...fix/finale-reveal?expand=1`
- rc-acceptance → `https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor/compare/main...test/rc-acceptance?expand=1`

### 冲突处理

`tests/unit/rendering/finale-reveal.test.ts` 在合并 #3 出现 **add/add 冲突**：RC 分支携带的是
`finale-reveal` 加“提饱和断言”之前的旧快照（211 行），main 侧为 215 行（含
`wcPaintDistant` / `uFinaleSaturation` / `mix(wcPaint, wcPaintDistant, …)` 三条断言）。
**取 main 侧**，保留更强断言；其余内容两侧一致。

---

## 3. 无关改动检查（每次合并后）

| 合并 | 引入文件数 | 是否越界 |
|---|---|---|
| #1 | 3 | 仅 `src/player/**` + `tests/unit/` ✅ |
| #2 | 5 | 仅 `src/rendering/**` + `tests/unit/rendering/` ✅ |
| #3 | 4 | 仅测试、硬件配置与 A6 报告；业务代码 0 改动 ✅ |
| 收尾 `946738b` | 4 | `tsconfig.json`（补 hw 配置覆盖）+ 3 个 format/lint 修正 ✅ |

`test/rc-acceptance` 分支内含 camera/reveal 的副本，合并前已逐字节比对确认与 main 一致，
因此业务代码**未被回退**（合并 diff 中 `src/player`、`src/rendering` 零改动）。

---

## 4. 历史说明

- `origin/pr/1`、`pr/2`、`pr/3` 是上一轮模块分支（A5 / A2 / A4）的远端引用，与当前 main 无差异，**不是本轮的 PR**。
- M0～M4 的集成提交（`ca071e1` … `69b4897`）均为直接推送，没有 PR 记录；本记录不回填。

---

## 5. 闭合状态（已在 A6 真机复测闭合，见 `src/tests/A6_ACCEPTANCE_REPORT.md`）

| 项 | 状态 | 判定条件 |
|---|---|---|
| AC-10 FPS（中位 ≥55 / 低帧 ≥30） | 🟢 已闭合（RTX 3060 Chrome 157 实测 165 / 164.7 FPS） | 真 GPU Chrome 上按 1920×1080、DPR≤1.5 实跑并记录设备 |
| P0 表现项（镜头拉远 / 远景染色） | 🟢 已复验通过 | `tests/e2e/rc-finale-acceptance.spec.ts` RC-01～04 |
| AC-09 10 分钟稳定性 | 🟢 已复验通过（268～269 采样 / 0 错误） | `A6_SAMPLE_SEC=600` |

---

## 6. 下一步：交给 Agent 4（A6 最终验收）

在**最新 main**（`66ed509` 之后）执行：

```bash
npm ci
npm run typecheck && npm run lint && npm run format:check
npm test && npm run build
npm run test:e2e                                  # 32 用例（含 RC-01～04）
A6_SAMPLE_SEC=600 A6_SAMPLE_TAG=10min npx playwright test tests/e2e/a6-perf-collect.spec.ts
npm run test:e2e:hw                               # AC-10 真机门禁（需真 GPU 的 Chrome）
```

要求：

1. AC-01～12 逐项给出真实结果，**FPS 不得用 SwiftShader 数值冒充**；硬件门禁会主动拒绝软件渲染。
2. `src/tests/A6_ACCEPTANCE_REPORT.md` 更新为最终版，并附设备信息与采样 JSON 路径。
3. 若 AC-10 在真机仍不达标，按渲染负载定位（优先 A1 遮罩更新频率 / A3 三角面与透明层 / A5 粒子叠加），
   提交给对应模块负责人，不得改断言放行。
4. 全部闭合前，不创建 release tag、不宣布 M4 完全通过。
