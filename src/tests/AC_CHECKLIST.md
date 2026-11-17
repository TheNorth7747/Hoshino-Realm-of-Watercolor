# AC-01～12 验收测试清单（A5 独立测试交付）

> 所属：Agent 4（A5 VFX + 为 A6 准备独立测试）
> 分支：`agent/effects`
> 基线：`docs/PRD.md` 第 3.2 / 11.3 / 11.4 节、`docs/FOUR_AGENT_WORKFLOW.md`
>
> **原则**：本分支只交付「不依赖其他模块即可运行」的测试与 VFX。
> 依赖 A1/A2/A3/A4 集成后才成立的断言，以“集成后启用”明确标注，
> 不删除、不降低 AC 标准；A6 在 main 集成版本上按此清单逐项补测。

---

## 1. 命令与真实结果（本分支）

| 命令 | 用途 | 本分支结果 |
|---|---|---|
| `npm run typecheck` | 严格 TypeScript 检查 | 通过 |
| `npm test` | Vitest 单元 | 5 文件 / 52 用例通过 |
| `npm run test:e2e` | Playwright smoke | 10 用例通过（含 M0 基线 3 项） |
| `npm run build` | typecheck + 生产构建 | 见 PR 描述（提交前实测） |

测试文件：

- `tests/unit/vfx-particles.test.ts`：槽池上限、花瓣生成/回收、涟漪上限/回收、dispose。
- `tests/unit/vfx-system.test.ts`：共享事件驱动、生命周期、重置、dispose 解绑、音频隔离。
- `tests/e2e/vfx-smoke.spec.ts`：加载 / 节点触发 / 移动染色反馈 / 结局 / 重置 / 控制台异常 / 生命周期。
- `tests/harness/vfx.html` + `tests/harness/vfx-main.ts`：独立 VFX 测试替身页面，不修改 `src/main.ts`。

---

## 2. 测试替身策略（数据解耦）

- VFX 只监听共享事件契约：`color:bloom`、`story:completed`、`game:reset`（`src/core/contracts.ts` 8.4）。
- 单测用真实 `EventBus` 发事件载荷；e2e 用 `tests/harness` 暴露 `__VFX_HARNESS__` 发同类事件。
- 断言只读 VFX 自身粒子统计（active / capacity / peak / treeBursts / resets），
  **不读取、不写死故事系统内部状态**；花树坐标由测试注入（`treePosition`）。
- 音频管理器 `createAudioManager` 默认 `enabled=false`，不注册系统、不自动播放；
  关闭音频不影响任何 VFX 或流程（P1 不阻塞 P0）。

---

## 3. AC 逐项清单

图例：
- ✅ **已覆盖**：本分支已有可运行测试与真实结果。
- 🟡 **部分覆盖**：本分支覆盖事件/替身层，完整链路需集成后补测。
- 🔵 **集成后启用**：依赖其他模块，A6 在 main 集成版执行；断言保留在清单中，不删不改标准。

| AC | 验收项 | 状态 | 本分支测试 / 依据 | 集成后需补测 |
|---|---|---|---|---|
| AC-01 | 启动与构建 | 🟡 | e2e「加载」「主应用加载」验证进入页面、canvas 非零、无异常；`npm run build` 见 PR | A6 在集成版执行 `npm install && npm run build` 完整链路 |
| AC-02 | 移动与镜头 | 🔵 | e2e「移动染色反馈」用连续 `color:bloom` 验证 VFX 响应（非玩家坐标） | A2 合并后测 WASD 坐标变化、镜头旋转/缩放、边界与穿模 |
| AC-03 | 脚下染色 | 🔵 | harness 证明 VFX 消费 `color:bloom` 世界坐标 | A1 合并后测遮罩 UV 映射、3 秒内线稿→水彩、世界位置一致 |
| AC-04 | 持续染色 | 🔵 | 本分支只验证粒子生命周期与 `game:reset` 清空 | A1 合并后测离开返回颜色仍在、重置后遮罩清零 |
| AC-05 | 跨材质一致 | 🔵 | 不在 A5 范围 | A1+A3 合并后测地面/植被/水/树读同一遮罩 |
| AC-06 | 三个故事节点 | 🟡 | e2e「节点触发」验证 `story:completed` 驱动 VFX；三个节点事件均可发 | A4 合并后测 flower/stream/tree 的实际互动、对话、幂等、状态反馈 |
| AC-07 | 伙伴与收集 | 🔵 | 不在 A5 范围 | A4 合并后测星灵跟随、3 枚星屑去重计数、HUD 准确 |
| AC-08 | 结局与重置 | 🟡 | e2e「结局」验证 `game:finished` 不阻塞；「重置」验证粒子清零、resets 计数 | A4 合并后测 2～3 秒结局延迟、重置后任务/星屑/染色全部复位 |
| AC-09 | 稳定性 | 🟡 | 单测「大量事件反复触发仍受上限约束」「生命周期回收」证明粒子不无限增长 | A6 在集成版做 10 分钟连续游玩、资源泄漏观测 |
| AC-10 | 性能 | 🟡 | 粒子有 capacity 上限、实例化渲染、到期回收，设计上受控（PRD 11.1） | A6 在集成机记录 1920×1080 / DPR≤1.5 的中位与低帧 FPS |
| AC-11 | 可调试性 | 🟡 | `VfxSystem.init` 注册 `vfx.*` 调试统计源；harness 用 `?debug=1` 路径可访问 | A6 验证 FPS/坐标/任务/遮罩缩略图/节点跳转按钮齐全 |
| AC-12 | 数据解耦 | ✅ | VFX 由共享事件驱动、坐标测试注入，无故事状态硬编码；见 `vfx-system.test.ts` 与 harness | A6 复核故事文本/节点坐标未写死在 UI 组件 |

---

## 4. 测试重点映射（用户指定六类）

| 重点 | 覆盖测试 | 状态 |
|---|---|---|
| 页面加载 | e2e「加载」「主应用加载」 | ✅ |
| 移动 | e2e「移动染色反馈」（事件替身，非玩家坐标） | 🟡 真实坐标变化待 A2 |
| 节点触发 | e2e「节点触发」+ 单测事件驱动 | ✅（VFX 层）/ 🔵（故事链路待 A4） |
| 结局 | e2e「结局」 | 🟡 VFX 不阻塞已验证；结局 UI 待 A4 |
| 重置 | e2e「重置」+ 单测 `game:reset` | ✅（VFX 层）/ 🔵（全系统复位待 A4/A1） |
| 控制台异常 | 每个 e2e 均挂 `pageerror` + `console.error` 监听并断言为空 | ✅ |

---

## 5. 已发现但应由其他模块修复/确认的问题

> 以下均非 A5 可改范围，记录供集成者与对应负责人处理。

1. **A0 `src/main.ts` 的 `createSystems()` 返回空数组**：当前 main 不带任何业务系统（含 VFX）。
   A5 不越权改 main；集成者需在 main 中注册 `new VfxSystem({ bus: game.events })`（构造需 `bus`，见 `src/effects/index.ts`）。
2. **A0 `index.html` 无 VFX 资源挂载**：VFX 为纯 Three.js 实例化几何体，无需外部资产；
   若集成者希望在 main 页直接观察，需完成第 1 条注册。
3. **共享契约建议（不阻塞）**：`GameContext` 未提供只读 `getSystem` 注入点给系统构造阶段，
   VFX 通过构造参数 `bus` 注入事件总线；若集成者希望统一由 context 注入可再约定，A5 不改 `core/**`。
4. **音频为 P1**：`createAudioManager` 默认关闭且未接入 main；需用户首次交互后 `unlock()`，
   浏览器禁用 Web Audio 时静默降级，不阻断 P0。

---

## 6. 建议集成顺序

1. A1（遮罩/渲染）+ A2（玩家/镜头）→ M1，验证染色与移动。
2. A3（场景）→ M2，主路线走通。
3. A4（故事/UI）→ M3，三节点、星屑、结局、重置。
4. A5（本分支 VFX）在 main 注册 `VfxSystem` → M4，运行本清单全部测试。
5. A6 在集成版补齐所有 🔵/🟡 项，记录性能与 10 分钟稳定性。
