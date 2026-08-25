#!/usr/bin/env node
// build 后把素材软链进 dist（避开 Astro 拷贝 48MB public/）
import { symlinkSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const site = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = process.env.BUILD_OUT || 'dist'
const link = join(site, out, 'assets')
rmSync(link, { force: true, recursive: true })
symlinkSync('../public/assets', link, 'dir')
const fav = join(site, 'public/favicon.ico')
if (existsSync(fav)) copyFileSync(fav, join(site, out, 'favicon.ico'))
console.log('assets 软链 + favicon 就绪')
