// 打包环境最小探针：由安装版的 electron.exe 直接运行
// 写入 scripts/.probe-packaged-marker.txt 记录关键环境与 wx_key.dll 加载结果
const fs = require('fs')
const out = 'E:\\Code_zone\\Msg_weflow\\scripts\\.probe-packaged-marker.txt'
const lines = []
const log = (s) => { lines.push(s); try { fs.writeFileSync(out, lines.join('\n'), 'utf8') } catch { } }

log('argv: ' + JSON.stringify(process.argv))
log('execPath: ' + process.execPath)
log('resourcesPath: ' + (process.resourcesPath || '(undefined)'))
log('cwd: ' + process.cwd())
log('platform: ' + process.platform + ' arch: ' + process.arch)

const dll = 'E:\\Tool_zone\\Tencent\\Msg\\electron\\resources\\resources\\key\\win32\\x64\\wx_key.dll'
log('dll exists: ' + fs.existsSync(dll))

// 模拟 preload-env 的 PATH 前置（打包版启动时会做）
try {
  const { dirname } = require('path')
  process.env.PATH = dirname(process.execPath) + ';' + process.resourcesPath + ';' + (process.env.PATH || '')
  log('PATH prepended: ' + process.env.PATH.slice(0, 200))
} catch (e) { log('PATH prepend err: ' + e.message) }

try {
  const koffi = require('E:/Code_zone/Msg_weflow/node_modules/koffi')
  log('koffi loaded from workspace node_modules')
  try {
    const lib = koffi.load(dll)
    log('wx_key.dll LOAD OK')
    try {
      lib.func('bool InitializeHook(uint32 targetPid)')
      lib.func('bool PollKeyData(_Out_ char *keyBuffer, int bufferSize)')
      lib.func('bool GetImageKey(_Out_ char *resultBuffer, int bufferSize)')
      log('symbols OK')
    } catch (e) { log('symbols FAIL: ' + e.message) }
  } catch (e) {
    log('wx_key.dll LOAD FAIL: ' + e.message)
  }
} catch (e) {
  log('koffi require FAIL: ' + e.message)
}

// 再试应用自带 koffi（asar 内）
try {
  const koffi2 = require('koffi')
  log('asar koffi ok, version-ish: ' + (koffi2.version ? 'has version' : 'no version'))
} catch (e) { log('asar koffi require FAIL: ' + e.message) }

process.exit(0)
