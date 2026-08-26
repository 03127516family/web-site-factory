import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'

export function revisionOf(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value))
  return createHash('sha256').update(bytes).digest('base64url')
}

export function writeJsonAtomic(file, data) {
  const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n')
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${randomUUID()}.tmp`)
  let fd
  try {
    fd = openSync(temp, 'wx', 0o644)
    writeFileSync(fd, bytes)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(temp, file)
    return { revision: revisionOf(bytes), bytes }
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    if (existsSync(temp)) unlinkSync(temp)
    throw error
  }
}
