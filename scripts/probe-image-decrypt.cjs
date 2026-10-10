// 图片解密取证探针 v2（纯 Node）：从运行中的微信用 wx_key.dll 取 kvcomm code，
// 按 app 的 deriveImageKeys 逻辑派生密钥，对真实 DAT 抽样解密并分类。
// 用法：node scripts/probe-image-decrypt.cjs [--limit N] [--ffmpeg N]

const { join } = require('path')
const { readFileSync, existsSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync } = require('fs')
const { execFileSync, spawnSync } = require('child_process')
const crypto = require('crypto')
const koffi = require('koffi')

const args = process.argv.slice(2)
const argNum = (name, def) => {
  const i = args.indexOf(name)
  return i !== -1 && args[i + 1] ? parseInt(args[i + 1], 10) : def
}
const LIMIT = argNum('--limit', 400)
const FFMPEG_MAX = argNum('--ffmpeg', 20)

const WX_ROOT = 'E:\\Tool_zone\\Tencent\\WeChat\\xwechat_files\\wxid_xx1zzo5hut8e22_8c04'
const ATTACH = join(WX_ROOT, 'msg', 'attach')
const ADDON = join(__dirname, '..', 'resources', 'wedecrypt', 'win32', 'x64', 'weflow-image-native-win32-x64.node')
const FFMPEG = join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
const KEY_DLL = join(__dirname, '..', 'resources', 'key', 'win32', 'x64', 'wx_key.dll')

function mask(s) {
  if (s == null) return '(null)'
  const t = String(s)
  if (t.length <= 8) return t[0] + '***'
  return t.slice(0, 4) + '…' + t.slice(-4) + `(len=${t.length})`
}

function detectMagic(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return '.webp'
  return null
}

function isWxgf(buf) {
  return buf && buf.length >= 4 && buf[0] === 0x77 && buf[1] === 0x78 && buf[2] === 0x67 && buf[3] === 0x66
}

function findEmbedded(buf) {
  for (let i = 4; i < Math.min(buf.length - 12, 4096); i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) return '.jpg'
    if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47) return '.png'
  }
  return null
}

function tryFfmpeg(hevcBuf) {
  const tmpDir = join(process.env.TEMP || '.', 'msg_probe_hevc')
  mkdirSync(tmpDir, { recursive: true })
  const id = `${process.pid}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
  const inp = join(tmpDir, `p_${id}.hevc`)
  const out = join(tmpDir, `p_${id}.jpg`)
  try {
    writeFileSync(inp, hevcBuf)
    const ladders = [
      ['-f', 'hevc', '-i', inp],
      ['-f', 'h265', '-i', inp],
      ['-i', inp],
    ]
    for (const ladder of ladders) {
      rmSync(out, { force: true })
      const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...ladder, '-vframes', '1', '-q:v', '2', '-f', 'image2', out], {
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
        timeout: 15000,
      })
      if (r.status === 0 && existsSync(out)) {
        const jpg = readFileSync(out)
        if (jpg.length > 0) return { ok: true, size: jpg.length, magic: detectMagic(jpg) }
      }
    }
    return { ok: false }
  } finally {
    rmSync(inp, { force: true })
    rmSync(out, { force: true })
  }
}

function collectDatFiles(root, cap) {
  const out = []
  const walk = (dir) => {
    if (out.length >= cap) return
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries) {
      if (out.length >= cap) return
      const p = join(dir, name)
      try {
        const st = statSync(p)
        if (st.isDirectory()) {
          if (['Thumb', 'Video', 'File', 'Audio', 'Emoji'].includes(name)) continue
          walk(p)
        } else if (name.toLowerCase().endsWith('.dat')) {
          out.push({ path: p, size: st.size, isThumb: name.endsWith('_t.dat'), dirName: dir.split(/[\\/]/).pop() })
        }
      } catch { /* ignore */ }
    }
  }
  walk(root)
  return out
}

function fmtHeader(buf) {
  const n = Math.min(buf.length, 16)
  return Array.from(buf.subarray(0, n)).map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

function monthOf(p) {
  const m = p.match(/(\d{4}-\d{2})\\Img\\/)
  return m ? m[1] : '?'
}

function findWeChatPid() {
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 8000 })
    let pid = null, maxMem = 0
    for (const line of out.split('\n')) {
      const m = line.match(/"Weixin\.exe","(\d+)","[^"]*","\d+","([\d,]+)\s*K"/)
      if (m) {
        const p = parseInt(m[1], 10)
        const mem = parseInt(m[2].replace(/,/g, ''), 10)
        if (mem > maxMem) { maxMem = mem; pid = p }
      }
    }
    return pid
  } catch { return null }
}

function cleanWxid(wxid) {
  const first = wxid.indexOf('_')
  if (first === -1) return wxid
  const second = wxid.indexOf('_', first + 1)
  if (second === -1) return wxid
  return wxid.substring(0, second)
}

function deriveImageKeys(code, wxid) {
  const cleanedWxid = cleanWxid(wxid)
  const xorKey = code & 0xff
  const md5Full = crypto.createHash('md5').update(code.toString() + cleanedWxid).digest('hex')
  return { xorKey, aesKey: md5Full.substring(0, 16) }
}

// ─── 1. 从微信取 kvcomm codes ───
console.log('[1/4] 加载 wx_key.dll 并注入微信')
const wechatPid = findWeChatPid()
if (!wechatPid) {
  console.error('[FAIL] 未检测到运行中的 Weixin.exe，请先启动并登录微信')
  process.exit(1)
}
console.log('  WeChat PID =', wechatPid)

const keyLib = koffi.load(KEY_DLL)
const InitializeHook = keyLib.func('bool InitializeHook(uint32 targetPid)')
const GetImageKey = keyLib.func('bool GetImageKey(_Out_ char *resultBuffer, int bufferSize)')
const GetLastErrorMsg = keyLib.func('const char* GetLastErrorMsg()')
const CleanupHook = keyLib.func('bool CleanupHook()')

if (!InitializeHook(wechatPid)) {
  let err = ''
  try { const p = GetLastErrorMsg(); if (p) err = koffi.decode(p, 'char', -1) } catch { }
  console.error('[FAIL] InitializeHook 失败' + (err ? ': ' + err : ''))
  process.exit(1)
}
const imgBuf = Buffer.alloc(8192)
if (!GetImageKey(imgBuf, imgBuf.length)) {
  console.error('[FAIL] GetImageKey 返回 false（微信未就绪或缓存为空）')
  try { CleanupHook() } catch { }
  process.exit(1)
}
const nullIdx = imgBuf.indexOf(0)
const jsonStr = imgBuf.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim()
let parsed
try { parsed = JSON.parse(jsonStr) } catch { console.error('[FAIL] GetImageKey 输出不是 JSON:', jsonStr.slice(0, 200)); process.exit(1) }
const accounts = parsed.accounts ?? []
if (!accounts.length) { console.error('[FAIL] accounts 为空'); process.exit(1) }

// 读取配置中的真实 wxid（明文字段），并收集候选 wxid
const CFG_PATH = join(process.env.APPDATA, 'msg', 'WeFlow-config.json')
let cfgMyWxid = ''
try { cfgMyWxid = JSON.parse(readFileSync(CFG_PATH, 'utf8')).myWxid || '' } catch { }
const wxidCands = []
const pushWxid = (w) => { const c = cleanWxid(String(w || '').trim()); if (c && !wxidCands.includes(c)) wxidCands.push(c) }
if (cfgMyWxid) pushWxid(cfgMyWxid)
for (const acc of accounts) pushWxid(acc.wxid)
if (!wxidCands.length) wxidCands.push('unknown')
console.log('  config myWxid =', cfgMyWxid, '| wxid 候选:', wxidCands.join(', '))

const keySets = []
const seen = new Set()
for (const acc of accounts) {
  for (const k of acc.keys ?? []) {
    for (const wx of wxidCands) {
      const d = deriveImageKeys(k.code, wx)
      const sig = `${d.xorKey}|${d.aesKey}`
      if (seen.has(sig)) continue
      seen.add(sig)
      keySets.push({ name: `wxid=${wx} code=${k.code}`, xor: d.xorKey, aes: d.aesKey, code: k.code, wxid: wx })
    }
  }
}
console.log('  accounts:', accounts.map((a) => `${a.wxid}:codes=[${(a.keys ?? []).map((k) => k.code).join(',')}]`).join(' | '))
for (const ks of keySets) console.log(`  keyset: ${ks.name} xor=0x${ks.xor.toString(16).padStart(2, '0')} aes=${mask(ks.aes)}`)

const primary = keySets.find((ks) => ks.wxid === cleanWxid(cfgMyWxid)) || keySets[0]
console.log(`[2/4] 主密钥集: ${primary.name}`)

// ─── 2. 加载解密模块并抽样 ───
console.log('[2/4] 加载原生解密模块')
const addon = require(ADDON)
const files = collectDatFiles(ATTACH, 200000)
const thumbs = files.filter((f) => f.isThumb)
const fulls = files.filter((f) => !f.isThumb)
const pick = (arr, n) => {
  if (arr.length <= n) return arr
  const step = Math.max(1, Math.floor(arr.length / n))
  return arr.filter((_, i) => i % step === 0).slice(0, n)
}
const nThumb = Math.min(Math.floor(LIMIT / 2), thumbs.length)
const nFull = LIMIT - nThumb
const sample = [...pick(thumbs, nThumb), ...pick(fulls, nFull)]
console.log(`  扫描 ${files.length} 个 DAT（缩略图 ${thumbs.length} / 高清 ${fulls.length}）`)
console.log(`  抽样 ${sample.length} 个（缩略图 ${nThumb} / 高清 ${nFull}）`)

// ─── 3. 解密分类 ───
console.log('[3/4] 解密并分类')
const stats = {
  ok: 0, okThumb: 0, wxgfEmbed: 0, wxgfFfmpegOk: 0, wxgfFfmpegFail: 0,
  addonNull: 0, addonThrow: 0, bad: 0, badButOtherKey: 0,
}
const fails = []
const wxgfPending = []
let ffmpegRuns = 0

function decryptOne(path, ks) {
  let r = null
  try { r = addon.decryptDatNative(path, ks.xor, ks.aes) } catch (e) {
    return { err: e && e.message ? String(e.message) : 'throw' }
  }
  if (!r || !Buffer.isBuffer(r.data)) return { err: 'null' }
  return { buf: r.data, meta: r }
}

function tryAllKeySets(path) {
  const okSets = []
  for (const ks of keySets) {
    const res = decryptOne(path, ks)
    if (res.buf && (detectMagic(res.buf) || isWxgf(res.buf))) okSets.push(ks.name)
  }
  return okSets
}

for (const f of sample) {
  const res = decryptOne(f.path, primary)
  if (res.err) {
    if (res.err === 'null') {
      stats.addonNull++
      fails.push({ path: f.path, size: f.size, isThumb: f.isThumb, kind: 'addon-null', header: '' })
    } else {
      stats.addonThrow++
      fails.push({ path: f.path, size: f.size, isThumb: f.isThumb, kind: `addon-throw(${res.err})`, header: '' })
    }
    continue
  }
  const buf = res.buf
  const magic = detectMagic(buf)
  if (magic) {
    stats.ok++
    if (f.isThumb) stats.okThumb++
    continue
  }
  if (isWxgf(buf)) {
    const emb = findEmbedded(buf)
    if (emb) { stats.wxgfEmbed++; continue }
    if (ffmpegRuns < FFMPEG_MAX) {
      ffmpegRuns++
      const fr = tryFfmpeg(buf.subarray(4))
      if (fr.ok) { stats.wxgfFfmpegOk++; continue }
      stats.wxgfFfmpegFail++
      fails.push({ path: f.path, size: f.size, isThumb: f.isThumb, kind: 'wxgf-ffmpeg-fail', header: fmtHeader(buf) })
    } else {
      wxgfPending.push(f)
    }
    continue
  }
  // 非有效图片：尝试所有其他密钥集（多设备/多 code 场景）
  const okSets = tryAllKeySets(f.path)
  if (okSets.length > 0) {
    stats.badButOtherKey++
    fails.push({ path: f.path, size: f.size, isThumb: f.isThumb, kind: `other-key(${okSets[0]})`, header: fmtHeader(buf) })
  } else {
    stats.bad++
    fails.push({
      path: f.path, size: f.size, isThumb: f.isThumb, kind: 'bad-image',
      header: fmtHeader(buf),
      meta: { ext: res.meta.ext, isWxgf: Boolean(res.meta.isWxgf), version: res.meta.version, aesSize: res.meta.aesSize ?? res.meta.aes_size, xorSize: res.meta.xorSize ?? res.meta.xor_size, flag: res.meta.flag }
    })
  }
}

// ─── 4. 汇报 ───
try { CleanupHook() } catch { }
console.log('\n===== 解密结果统计 =====')
console.log(`正常图片            : ${stats.ok}（其中缩略图 ${stats.okThumb}）`)
console.log(`WXGF 内嵌图片       : ${stats.wxgfEmbed}`)
console.log(`WXGF ffmpeg 解码成功: ${stats.wxgfFfmpegOk}（实测 ${ffmpegRuns} 次）`)
console.log(`WXGF ffmpeg 解码失败: ${stats.wxgfFfmpegFail}`)
console.log(`addon 返回 null     : ${stats.addonNull}`)
console.log(`addon 抛异常        : ${stats.addonThrow}`)
console.log(`解密后非有效图片    : ${stats.bad}`)
console.log(`需其他设备密钥      : ${stats.badButOtherKey}`)
console.log(`抽样总数            : ${sample.length}`)
if (wxgfPending.length) console.log(`未跑 ffmpeg 的 WXGF  : ${wxgfPending.length} 个（超出 --ffmpeg 配额）`)

if (fails.length > 0) {
  const monthCount = {}
  for (const f of fails) {
    const m = monthOf(f.path)
    monthCount[m] = (monthCount[m] || 0) + 1
  }
  console.log('\n失败文件按月份分布:', JSON.stringify(monthCount, null, 0))
  console.log('\n===== 失败样本（最多 25 条） =====')
  for (const f of fails.slice(0, 25)) {
    console.log(`[${f.kind}] ${f.path.replace(WX_ROOT, '<wx>')} size=${f.size} thumb=${f.isThumb}`)
    if (f.header) console.log(`    header: ${f.header}`)
    if (f.meta) console.log(`    meta: ${JSON.stringify(f.meta)}`)
  }
  if (fails.length > 25) console.log(`…… 其余 ${fails.length - 25} 条略`)
}

process.exit(0)
