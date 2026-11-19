# 开源发布准备与待补信息

本文区分“仓库已公开”和“已完成开源发布准备”。仓库可见性已于 2026-11-19 改为 `public`，匿名可访问 `main` 与 README；许可证已确定为 MIT，正式版本与发布材料仍需补齐。

## 1. 当前已完成

- 当前功能、非目标和运行边界已按代码审计整理。
- README、产品 PRD、架构流程、开发接入和四 Agent 协作已有文档。
- 贡献、安全、行为准则和更新记录已有基础内容。
- 参考视频和本地抽帧已通过忽略规则排除，不作为项目资产分发。
- 最终测试与性能声明指向具体验收报告和提交基线。
- 仓库已由 private 改为 public，默认分支 `main` 与远程同步。
- 公开前检查确认：无凭据类文件入库，公开文档无本地绝对路径泄露。
- 根目录已添加 MIT `LICENSE`，版权署名 `TheNorth7747`；README、`package.json` 和 `package-lock.json` 已标注。

## 2. 公开后仍需补齐的事项

| 项目         | 当前缺口                                                                                               | 需要谁确认/处理                                    |
| ------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 版本口径     | Git 标签为 `v0.1.0-rc.1`；已同步 package、lockfile、APP_VERSION 和加载文案，但尚未决定正式发布版本 | 维护者确认最终版本并创建对应发布标签               |
| 实机人工验收 | 自动测试完整，但故事闭环主要使用调试按钮                                                               | 至少一次真实键鼠完整通关、重置并二次通关，记录结果 |
| 依赖许可审计 | 已知 npm 依赖各有许可，但尚未形成发布前审计记录                                                        | 维护者检查直接/传递依赖和需要分发的许可文本        |
| 安全联系渠道 | 尚未确认 Private Vulnerability Reporting 或私下联系方式                                                | 仓库所有者配置 GitHub 安全报告渠道                 |

## 3. 建议补充的发布材料

### 必补

- 一张当前版本的实际运行封面图，以及简短替代文本。
- 一段从行走到花树结局的短录屏或 GIF；必须来自本项目，不使用参考视频代替。
- 发布版最终提交上的完整质量门禁结果。

### 建议补充

- GitHub Actions CI：typecheck、lint、format、unit、build 和默认 e2e。
- Issue 模板：bug、文档、视觉/性能建议。
- PR 模板：需求、文件、测试、截图、性能和回滚。
- `SECURITY.md` 对应的私下报告入口。
- 当前支持浏览器和平台的实测列表。
- 可选的许可证 badge；README 已写明 MIT，不依赖 badge 生效。

## 4. GitHub 仓库描述建议

**Description：**

```text
A watercolor 3D narrative exploration demo built with TypeScript, Vite and Three.js. Walk through a pencil-sketch world and leave color behind.
```

**Topics 建议：**

```text
threejs typescript vite webgl watercolor procedural-generation interactive-narrative game-demo multi-agent
```

这些标签描述当前技术或开发方式；不要添加 `mmo`、`multiplayer`、`mobile`、`rpg-battle` 等未实现功能标签。

## 5. 其他仍需所有者确认的信息

1. 许可证已定为 MIT、署名 `TheNorth7747`；若后续更换，需同步 `LICENSE`、`package.json` 与 README。
2. 是否保留 `Hoshino: Realm of Watercolor` 作为正式公开名称。
3. 仓库公开后的正式 URL 是否仍为 `TheNorth7747/Hoshino-Realm-of-Watercolor`。
4. 是否提供在线 Demo；若有，需要部署地址和部署流程。
5. 是否接受外部代码贡献，以及希望使用何种讨论渠道。
6. 安全报告的私下联系方式，或直接启用 GitHub Private Vulnerability Reporting。
7. 对外展示的截图、GIF 和社交预览图。
8. 首个正式版本是 `v0.1.0`，还是继续保持 RC 直至 V0.2 视觉优化完成。
9. 是否需要英文 README；当前首先提供中文文档，英文版尚未编写。
10. 四个 Agent 的模型名称是否作为公开开发记录长期保留。

## 6. 发布前最后检查

```bash
npm ci
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run test:e2e
npm run test:e2e:hw
```

同时确认：

- README 的命令、链接和目录与实际一致。
- 没有把 V0.2 规划写成已实现。
- 没有把调试按钮通关写成人工完整通关。
- 性能数字附设备、提交、采样方式和时间范围。
- 没有提交参考视频、个人路径中的敏感资料、凭据或测试垃圾。
- `CHANGELOG.md`、版本号、标签和验收报告使用同一发布基线。
- MIT 许可证已写入根目录；第三方资产/依赖许可仍需形成审计记录。

完成这些项目后，再由所有者决定创建正式 Release。
