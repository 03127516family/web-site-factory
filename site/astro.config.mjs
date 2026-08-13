import { defineConfig } from 'astro/config'

export default defineConfig({
  // 48MB 素材不经 Astro 拷贝：build 后由 scripts/link-assets.mjs 软链进产物目录
  publicDir: './public-void',
  trailingSlash: 'always',
  // 双产物：默认 dist（生产，仅 published）；BUILD_OUT=dist-edit + INCLUDE_DRAFTS=1 = 编辑预览（含草稿，R33）
  outDir: process.env.BUILD_OUT || 'dist',
})
