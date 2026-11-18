// scripts/build-native-db.cjs —— 自建数据访问层（D1 方案 2：二进制不入库，源码构建）
//
// 背景：厂商闭源 wcdb_api.dll 内置过期炸弹（2026-09-30 过期，InitProtection 返回 -101，
// 详见 audit/verify/KNOWN-STATE-2026-10-09.md 与 .claude/wcdb-troubleshooting.md）。
// 替代方案：开源 fork「334456777/WeFlow」的 crates/weflow-wcdb-ffi ——
// 官方定位 "a drop-in replacement for wcdb_api for the desktop app"，
// 无过期检查、无网络访问，以只读方式打开微信库（写操作返回 -4 拒绝）。
//
// ⚠️ 许可：该 fork 为 CC-BY-NC-SA-4.0（非商用 + 相同方式共享），使用前请知悉。
// 本脚本仅做「克隆源码 → cargo 构建 → 安装为 resources/wcdb/win32/x64/wcdb_api.dll」。
//
// 用法：npm run native-db:build
// 前置：Rust 工具链（https://rustup.rs）+ VS2022 C++ 桌面开发（bundled SQLite 需 MSVC）
'use strict'

const { execSync, spawnSync } = require('child_process')
const { existsSync, copyFileSync } = require('fs')
const { join } = require('path')
const os = require('os')

const REPO_URL = 'https://github.com/334456777/WeFlow.git'
// main 已移除 weflow-wcdb-ffi；v5.0.1 仍是 drop-in wcdb_api 替代（无过期检查）
const REPO_REF = process.env.WEFLOW_RUST_REF || 'v5.0.1'
const WORK_DIR = join(os.tmpdir(), 'weflow-rust-build')
const DLL_SRC = join(WORK_DIR, 'target', 'release', 'weflow_wcdb.dll')
const DLL_DST = join(__dirname, '..', 'resources', 'wcdb', 'win32', 'x64', 'wcdb_api.dll')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.error) {
    console.error(`[native-db] 无法执行 ${cmd}: ${r.error.message}`)
    process.exit(1)
  }
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function main() {
  // 1) 定位 cargo
  let cargo = 'cargo'
  try {
    execSync('cargo --version', { stdio: 'pipe' })
  } catch {
    const winCargo = join(os.homedir(), '.cargo', 'bin', 'cargo.exe')
    if (existsSync(winCargo)) cargo = winCargo
    else {
      console.error('[native-db] 未找到 cargo。请先安装 Rust：https://rustup.rs')
      process.exit(1)
    }
  }
  // 2) 克隆并钉住仍含 weflow-wcdb-ffi 的 tag（勿跟 main：FFI crate 已删）
  if (!existsSync(join(WORK_DIR, '.git'))) {
    console.log(`[native-db] 克隆 ${REPO_URL} @ ${REPO_REF} ...`)
    run('git', ['clone', '--depth', '1', '--branch', REPO_REF, REPO_URL, WORK_DIR])
  } else {
    console.log(`[native-db] 检出 ${REPO_REF} ...`)
    // 本地已有 tag 时不联网；没有再浅取
    const hasRef = spawnSync('git', ['-C', WORK_DIR, 'rev-parse', '--verify', `refs/tags/${REPO_REF}`], {
      stdio: 'ignore'
    })
    if (hasRef.status !== 0) {
      run('git', ['-C', WORK_DIR, 'fetch', '--depth', '1', 'origin', 'tag', REPO_REF])
    }
    run('git', ['-C', WORK_DIR, 'checkout', '-f', REPO_REF])
  }
  if (!existsSync(join(WORK_DIR, 'crates', 'weflow-wcdb-ffi', 'Cargo.toml'))) {
    console.error(`[native-db] ${REPO_REF} 无 crates/weflow-wcdb-ffi；换 WEFLOW_RUST_REF=v5.0.1`)
    process.exit(1)
  }
  // 3) 构建（首次约 10~30 分钟：工具链 + bundled SQLite）
  console.log('[native-db] 构建 weflow-wcdb-ffi（release）...')
  run(cargo, ['build', '--release', '-p', 'weflow-wcdb-ffi'], { cwd: WORK_DIR })
  if (!existsSync(DLL_SRC)) {
    console.error(`[native-db] 未找到产物 ${DLL_SRC}`)
    process.exit(1)
  }
  // 4) 备份现有 DLL（仅一次）并安装
  const bak = DLL_DST + '.vendor-expired.bak'
  if (existsSync(DLL_DST) && !existsSync(bak)) {
    copyFileSync(DLL_DST, bak)
    console.log('[native-db] 已备份原 DLL -> ' + bak)
  }
  copyFileSync(DLL_SRC, DLL_DST)
  console.log('[native-db] OK: 已安装 ' + DLL_DST)
}

main()
