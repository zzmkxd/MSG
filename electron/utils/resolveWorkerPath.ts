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
  // 注意：asarUnpack 会把 dist-electron/*Worker.js 解包，因此调用方模块本身可能
  // 已经从 app.asar.unpacked 加载（__dirname 已含 app.asar.unpacked）。
  // 此时若再整体替换会得到 app.asar.unpacked.unpacked 的双层路径（Cannot find module）。
  // 所以：仅在出现“app.asar”且尚无“app.asar.unpacked”时替换一次。
  let dir = __dirname
  if (dir.includes('app.asar') && !dir.includes('app.asar.unpacked')) {
    dir = dir.replace('app.asar', 'app.asar.unpacked')
  }
  // 无论调用方被打包在 dist-electron 根目录还是子目录，都锚定到 dist-electron 根，
  // worker 产物统一输出在该目录下。
  const marker = 'dist-electron'
  const markerIdx = dir.indexOf(marker)
  if (markerIdx !== -1) {
    dir = dir.slice(0, markerIdx + marker.length)
  }
  return join(dir, workerName)
}
