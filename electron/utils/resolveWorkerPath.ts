import { join } from 'path'
import { existsSync } from 'fs'

/**
 * Resolve worker script path for Node.js Worker threads.
 *
 * Node.js `new Worker()` requires a real filesystem path — it does NOT understand
 * Electron ASAR virtual paths. In packaged apps, `__dirname` points inside
 * `app.asar`, so we map it to `app.asar.unpacked` where electron-builder
 * extracts asarUnpack-matched files.
 */
export function resolveWorkerPath(workerName: string): string {
  const isDev = process.env.NODE_ENV === 'development'

  if (isDev) {
    // vite-plugin-electron builds workers to dist-electron/ alongside main.js
    const devPath = join(__dirname, '../dist-electron', workerName)
    if (existsSync(devPath)) return devPath
    return join(__dirname, workerName)
  }

  // Packaged: map app.asar → app.asar.unpacked
  let dir = __dirname
  if (dir.includes('.asar')) {
    dir = dir.replace('.asar', '.asar.unpacked')
  }
  return join(dir, workerName)
}
