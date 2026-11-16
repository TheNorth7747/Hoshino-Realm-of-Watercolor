# A0 挂载点与文件所有权

> 基线：PRD 7.1 / 7.2 / 12.2。本文件由集成者（Agent 1）维护，其他 Agent 只读。

## 1. 目录所有权

| 路径 | 所有者 | A0 是否已有文件 | 说明 |
|---|---|---|---|
| `package.json`、lockfile、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`playwright.config.ts`、`eslint.config.js`、`.prettierrc.json` | Agent 1 | 是 | 唯一负责人，其他 Agent 提变更请求 |
| `index.html` | Agent 1 | 是 | `#game-canvas` / `#ui-root` / `#debug-root` / `#fatal-error` 挂载点 |
| `src/main.ts` | Agent 1 | 是 | 集成者在此把各模块 `GameSystem` 加进 `createSystems()` |
| `src/core/**` | Agent 1 | 是 | contracts / Game / EventBus / config / debug / errors / SceneScaffold / dispose |
| `src/config/world.ts` | Agent 1 | 是 | 世界坐标唯一来源 |
| `src/rendering/**` | Agent 1（A1） | 仅 `Renderer.ts` | A1 在此新增 `ColorRevealMask.ts`、`WatercolorMaterial.ts`、`WatercolorPass.ts` |
| `src/player/**` | Agent 2（A2） | 空目录 | |
| `src/world/**` | Agent 2（A3） | 空目录 | |
| `src/narrative/**`、`src/companion/**`、`src/ui/**` | Agent 3（A4） | 空目录 | `src/tests/` 也归 A4/A6 |
| `src/effects/**` | Agent 4（A5） | 空目录 | |
| `src/tests/**` | Agent 4（A5/A6） | 只有 README | A0 的最小 smoke 放在根级 `tests/`，避免与 A4/A6 抢目录 |
| `public/assets/**` | A3/A5 各自新增 | 空目录 | 命名 kebab-case，需记录来源与许可证 |

## 2. 挂载点

### 2.1 系统挂载（A1～A5 唯一接入方式）

```ts
// src/core/contracts.ts
export interface GameSystem {
  readonly id: string;
  readonly phase: SystemPhase; // input | player | companion | story | reveal | effects | camera
  init?(context: GameContext): void;
  update?(deltaSeconds: number, context: GameContext): void;
  resize?(width: number, height: number): void;
  dispose?(): void;
}
```

- Game 按 `SYSTEM_PHASES` 稳定排序执行，注册顺序不影响阶段顺序（PRD 7.3）。
- **重置不走方法**：`game.reset()` 只发 `game:reset` 事件，系统自己 `events.on("game:reset", …)`。
- 注册必须在 `Game.start()` 之前，重复 `id` 会抛 `AppError('system-registration')`。
- 取用其他系统：`context` 之外的模块通过 `registry.getSystem<T>("player")` 获取，或在构造时注入接口（推荐 `PlayerSource`）。

### 2.2 场景挂载

| 挂载点 | 内容 | 使用者 |
|---|---|---|
| `context.worldRoot`（`Group`，name `world-root`） | 世界对象父节点，A3 的地形/植被/水/花树都挂这里 | A3 |
| `context.scene` | 灯光、雾、背景已由 `SceneScaffold` 建立（`hemisphere-light`、`key-light`） | A3 可调整，不重复新建 |
| `context.camera` | 默认 PerspectiveCamera（FOV 50），A2 的 CameraRig 接管 | A2 |
| `context.uiRoot`（`#ui-root`） | HUD / 对话框 / 结局页容器，默认 `pointer-events: none` | A4 |
| `context.debug` | 调试通道，`registerStatSource()` 可挂自定义指标（如遮罩缩略图数据） | A1～A5 |
| `context.settings.maskResolution` | 512，A1 的遮罩尺寸 | A1 |
| `context.world.bounds` / `context.world.sampleHeight` | 世界边界与地形高度采样 | A1/A2/A3/A4 |

### 2.3 调试入口

- `?debug=1`：显示调试面板、场景网格与坐标轴；`DebugApi.enabled` 为 true。
- `window.__STARWATER__`：`{ version, game }`，Playwright 与人工排查共用。
- 启动失败走 `#fatal-error` 覆盖层（含错误码、消息、堆栈）。

## 3. 共享契约要点

- `ColorRevealMask`、`PlayerSnapshot`、`StoryNode` 与 PRD 8.1～8.3 完全一致。
- 事件只有 6 个：`story:completed`、`color:bloom`、`shard:collected`、`dialogue:requested`、`game:finished`、`game:reset`；载荷类型见 `GameEvents`。
- 故事节点坐标只在 `src/config/world.ts` 的 `STORY_NODE_SPATIAL` + `LANDMARKS` 里，`story.json` 只放文本与规则。
- 星屑 ID 类型 `ShardId = \`shard-${StoryNodeId}\``，保证同一枚只计数一次。

## 4. 命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 本地开发（127.0.0.1:5173） |
| `npm run build` | typecheck + 生产构建 |
| `npm run typecheck` | 严格模式类型检查 |
| `npm run test` | Vitest 单元测试（`tests/unit`） |
| `npm run test:e2e` | Playwright smoke（`tests/e2e`，首次需 `npm run test:e2e:install`） |
| `npm run lint` / `npm run format` | ESLint / Prettier |

## 5. 环境

- Node ≥ 20.19（本机默认 `D:\nodejs` 是 16.x，需用 Node 24：`C:\Users\Administrator\AppData\Local\Programs\node-v24.22.2-win-x64`）。
- Three.js 锁定 `0.187.0`，`@types/three` 同版本；升级必须同时更新 lockfile 并重跑构建。
