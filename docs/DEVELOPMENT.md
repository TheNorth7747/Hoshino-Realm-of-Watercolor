# 开发、运行与接入指南

## 1. 环境要求

- Node.js `>=20.19.0`
- npm 与 Git
- 支持 WebGL2 的桌面浏览器
- 默认 e2e 需要 Playwright Chromium；真 GPU 门禁需要系统 Chrome 和可用硬件加速

当前主要在 Windows 桌面环境验证。macOS/Linux 没有系统性验收记录。

## 2. 本地运行

```bash
git clone https://github.com/TheNorth7747/Hoshino-Realm-of-Watercolor.git
cd Hoshino-Realm-of-Watercolor
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:5173/`。

`npm ci` 按 lockfile 安装依赖。不要在功能 PR 中无理由升级 Three.js；水彩材质依赖 Three.js 内部 shader chunk，升级需要额外编译和视觉回归。

## 3. 脚本

| 命令                       | 用途                                |
| -------------------------- | ----------------------------------- |
| `npm run dev`              | Vite 开发服务器                     |
| `npm run build`            | TypeScript 检查后生成静态站点       |
| `npm run preview`          | 预览生产构建，默认 `127.0.0.1:4173` |
| `npm run typecheck`        | TypeScript 严格类型检查             |
| `npm run lint`             | ESLint                              |
| `npm run format`           | Prettier 写入格式化，会修改文件     |
| `npm run format:check`     | Prettier 只读检查                   |
| `npm test`                 | Vitest 单元测试                     |
| `npm run test:watch`       | Vitest 监听模式                     |
| `npm run test:e2e:install` | 安装 Playwright Chromium            |
| `npm run test:e2e`         | 默认 e2e，使用 SwiftShader          |
| `npm run test:e2e:hw`      | 系统 Chrome 真 GPU 性能门禁         |

提交前至少执行：

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
```

修改渲染负载、植被数量、VFX 或后期后，还应执行：

```bash
npm run test:e2e:hw
```

## 4. 调试模式

访问：

```text
http://127.0.0.1:5173/?debug=1
```

调试模式提供：

- FPS、帧时间、Draw Calls、三角面和系统状态。
- 玩家坐标、故事步骤、星屑、伙伴和 VFX 信息。
- 染色遮罩缩略图、笔刷和覆盖率。
- 故事节点完成与重置按钮。

正常玩家模式默认不显示这些功能。调试按钮用于测试故事闭环，不等同于人工完整通关。

## 5. 生产构建与部署

```bash
npm run build
npm run preview
```

`dist/` 可以部署到静态托管服务。部署时注意：

- 所有运行资源应随静态站点提供；当前不需要后端 API。
- 若部署到子路径，需要同步检查 Vite `base` 和资源路径。
- 浏览器必须支持 WebGL2；启动失败时应保留可读错误提示。
- 当前没有服务端路由和持久化数据。

## 6. 接入与二次开发边界

本项目是独立应用，不提供以下形式：

- 没有 npm 库入口或稳定 SDK。
- 没有后端接口、账号体系或云端同步。
- 没有通用插件系统。
- 没有现成 GLB/glTF 角色加载与动画状态机。

推荐接入方式是 fork/clone 后修改模块：

1. 从 `src/config/world.ts` 和 `src/narrative/story.json` 理解空间与故事数据。
2. 阅读 `src/core/contracts.ts` 和 `src/core/Game.ts`，遵循系统阶段和事件契约。
3. 新增世界对象时复用 `WorldSystem` 的材质绑定，不另建染色遮罩。
4. 新增故事反馈时订阅现有事件，避免让故事系统直接依赖镜头、VFX 或 shader。
5. 修改公共接口时同步更新所有调用方、单元测试、e2e 和架构文档。

## 7. 代码与资产约定

- TypeScript `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 已启用。
- 避免使用 `any` 绕过跨模块契约。
- 系统应实现对应的更新、重置和 `dispose()` 生命周期。
- 高频路径避免无意义对象分配；纹理、几何体、材质和监听器需要释放。
- 实例化花草和 VFX 必须有数量上限与性能预算。
- 新增资产记录作者、来源和许可证；不提交来源不明的外部模型、音乐或参考视频。
- 不提交 `.env`、凭据、`node_modules/`、`dist/`、`test-results/` 或本地参考抽帧。

## 8. 常见问题

### 启动后黑屏或无法创建 WebGL 环境

检查浏览器 WebGL2 支持、硬件加速和显卡驱动。默认 SwiftShader e2e 通过不代表所有真实浏览器环境都已验证。

### e2e 找不到浏览器

执行：

```bash
npm run test:e2e:install
```

### 真 GPU 测试仍显示 SwiftShader

检查系统 Chrome 是否启用硬件加速，以及运行环境是否强制传入了软件渲染参数。真 GPU 报告必须记录实际 renderer，不能用软件渲染结果代替 AC-10。

### 修改 Three.js 后材质编译失败

水彩材质通过集中式 `onBeforeCompile` 注入。核对锁定版本和 shader chunk，恢复已验证版本或同步修改注入与测试；不要在多个业务模块分别打补丁。

### 重置后遮罩不是绝对零

重置后的下一帧会在出生点重新落笔，这是当前设计。验收应检查“回到初始单笔状态”，而不是要求永远为零。
