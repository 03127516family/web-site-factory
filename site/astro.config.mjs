import { defineConfig } from 'astro/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  // 48MB 素材不经 Astro 拷贝：build 后由 scripts/link-assets.mjs 软链进产物目录
  publicDir: './public-void',
  trailingSlash: 'always',
  // 双产物：默认 dist（生产，仅 published）；BUILD_OUT=dist-edit + INCLUDE_DRAFTS=1 = 编辑预览（含草稿，R33）
  outDir: process.env.BUILD_OUT || 'dist',
  // 路径别名（位置无关引用）：import 语句全认；import.meta.glob 的「模式」认别名，
  // 但返回的「键」会被 Vite 规范化回相对导入者的路径——glob 查表字面量须保持相对写法。
  // 挪文件/拷组件进套件目录不再数 ../ 层数（kit-init 深度改写那类 bug 的根治）。
  vite: {
    resolve: {
      alias: {
        '@src': fileURLToPath(new URL('./src', import.meta.url)),
        '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
        '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
      },
    },
  },
})
