import { randomUUID } from 'node:crypto'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

export function createOutputBuilder({ site, runBuild }) {
  if (typeof runBuild !== 'function') throw new TypeError('output builder requires runBuild')

  async function stage(specs) {
    const token = `${process.pid}-${randomUUID()}`
    const outputs = specs.map(({ out, env = {} }) => ({
      out,
      env,
      final: join(site, out),
      staging: join(site, `${out}-next-${token}`),
      stagingName: `${out}-next-${token}`,
      previous: join(site, `${out}-previous-${token}`),
      movedFinal: false,
      movedStaging: false,
    }))
    const cleanup = async () => {
      for (const output of outputs) {
        rmSync(output.staging, { recursive: true, force: true })
        rmSync(output.previous, { recursive: true, force: true })
      }
    }

    try {
      for (const output of outputs) {
        rmSync(output.staging, { recursive: true, force: true })
        rmSync(output.previous, { recursive: true, force: true })
        await runBuild({ out: output.stagingName, env: output.env })
      }
    } catch (error) {
      await cleanup()
      throw error
    }

    let activated = false
    return {
      async activate() {
        if (activated) throw new Error('staged outputs already activated')
        try {
          for (const output of outputs) {
            if (existsSync(output.final)) {
              renameSync(output.final, output.previous)
              output.movedFinal = true
            }
          }
          for (const output of outputs) {
            renameSync(output.staging, output.final)
            output.movedStaging = true
          }
          activated = true
        } catch (error) {
          for (const output of [...outputs].reverse()) {
            if (output.movedStaging && existsSync(output.final)) rmSync(output.final, { recursive: true, force: true })
            if (output.movedFinal && existsSync(output.previous)) renameSync(output.previous, output.final)
          }
          throw error
        }
      },
      cleanup,
    }
  }

  const stageEdit = () => stage([{ out: 'dist-edit', env: { INCLUDE_DRAFTS: '1' } }])
  const stagePublished = () => stage([
    { out: 'dist' },
    { out: 'dist-edit', env: { INCLUDE_DRAFTS: '1' } },
  ])
  const rebuild = async stageOperation => {
    const staged = await stageOperation()
    try { await staged.activate() } finally { await staged.cleanup() }
  }

  return {
    stageEdit,
    stagePublished,
    rebuildEdit: () => rebuild(stageEdit),
    rebuildPublished: () => rebuild(stagePublished),
  }
}
