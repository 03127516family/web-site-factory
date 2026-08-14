#!/usr/bin/env node
// 图片固有尺寸探测（sharp）：迁移器与写回端点共用。缺图返回 {}（known-leftover 惯例）。
import sharp from 'sharp'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..')
export const IMG_DIR = join(SITE, '../public/assets/img/product')

export async function probe(name, dir = IMG_DIR) {
  try {
    const m = await sharp(join(dir, name)).metadata()
    return { width: m.width, height: m.height }
  } catch {
    return {}
  }
}
