import { defineConfig } from "vite";

/**
 * A0 构建基线。
 * - 只使用浏览器原生能力，不引入框架插件，保证 A1～A5 的模块都能直接被 Vite 处理。
 * - `?debug=1` 由运行时解析（src/core/config.ts），不需要额外构建分支。
 */
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    assetsInlineLimit: 4096,
    // three.js 单独成 vendor chunk，便于长缓存；体积基本由 three 决定，故阈值放到 600kB。
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: { three: ["three"] },
      },
    },
  },
});
