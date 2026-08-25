#!/usr/bin/env node
// 图片固有尺寸探测（sharp）：迁移器与写回端点共用。缺图返回 {}（known-leftover 惯例）。
import sharp from 'sharp'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
export const IMG_DIR = join(SITE, 'public/assets/img/product')

export async function probe(name, dir = IMG_DIR) {
  const d = isAbsolute(dir) ? dir : join(SITE, dir) // 相对 dir 一律锚 site/，免 cwd 歧义
  try {
    const m = await sharp(join(d, name)).metadata()
    return { width: m.width, height: m.height }
  } catch {
    return {}
  }
}
