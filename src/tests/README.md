# src/tests/

A0 没有在这个目录放文件。

- 这里属于 **Agent 4（A5/A6）** 的模块级测试目录。
- A0 的最小 smoke 放在根级 `tests/unit/`（Vitest）与 `tests/e2e/`（Playwright），
  这样 A4/A6 增删自己的测试时不会与 A0 基线互相覆盖。
- 若 A6 需要把测试统一迁到本目录，请在集成 PR 中说明并同步更新 `vitest.config.ts` / `playwright.config.ts`。
