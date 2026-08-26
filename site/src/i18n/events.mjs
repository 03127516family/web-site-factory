// 字段级事件留痕（.i18n-events.jsonl）：谁、什么时候、对哪个 slug、干了什么、哪些字段/句。
import { appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const EVENTS = () => join(process.cwd(), '.i18n-events.jsonl')
function gitActor() {
  try { return execSync('git config user.name', { encoding: 'utf8' }).trim() || 'unknown' }
  catch { return 'unknown' } // 归因非变更检测，git 不可用不挡路
}
export function logEvent(slug, action, detail) {
  const entry = { ts: new Date().toISOString(), actor: gitActor(), slug, action, detail }
  appendFileSync(EVENTS(), JSON.stringify(entry) + '\n')
}
