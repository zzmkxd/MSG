// 视频首段 128KB 解密变体实验
// 下载原始视频（直连），对前 131072 字节用 ISAAC(encKey) 各布局变体 XOR，
// 每次写出后用 ffmpeg 校验可解析性，找出正确变体。
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const https = require('https')
const { spawnSync } = require('child_process')

const WASM_JS = path.join(__dirname, '..', 'electron', 'assets', 'wasm', 'wasm_video_decode.js')
const WASM_BIN = path.join(__dirname, '..', 'electron', 'assets', 'wasm', 'wasm_video_decode.wasm')
const FFMPEG = path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
const ENC_KEY = '3093797657'
const ENCLEN = 131072

const VIDEO_URL = (() => {
  const v = JSON.parse(fs.readFileSync(path.join(__dirname, '.video-json-sample.json'), 'utf8'))
  return v.media[0].url
})()

function loadWasm() {
  const wasmBinary = fs.readFileSync(WASM_BIN)
  const state = { captured: null }
  const mockGlobal = {
    console, Buffer, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
    Float32Array, Float64Array, BigInt64Array, BigUint64Array,
    Array, Object, Function, String, Number, Boolean, Error, Promise,
    require, process, setTimeout, clearTimeout, setInterval, clearInterval,
  }
  let onReady
  const ready = new Promise((r) => { onReady = r })
  mockGlobal.Module = { onRuntimeInitialized: () => onReady(), wasmBinary, print: () => { }, printErr: (t) => console.error('[wasm]', t) }
  mockGlobal.self = mockGlobal
  mockGlobal.location = { href: WASM_JS }
  mockGlobal.WorkerGlobalScope = function () { }
  mockGlobal.VTS_WASM_URL = `file://${WASM_BIN}`
  mockGlobal.wasm_isaac_generate = (ptr, size) => {
    state.captured = new Uint8Array(mockGlobal.Module.HEAPU8.buffer.slice(ptr, ptr + size))
  }
  new vm.Script(fs.readFileSync(WASM_JS, 'utf8'), { filename: WASM_JS }).runInContext(vm.createContext(mockGlobal))
  return { ready, module: () => mockGlobal.Module, captured: () => state.captured }
}

function download(url, out) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'MicroMessenger Client' }, timeout: 60000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const cs = []
      res.on('data', (c) => cs.push(c))
      res.on('end', () => { fs.writeFileSync(out, Buffer.concat(cs)); resolve(Buffer.concat(cs)) })
    }).on('error', reject)
  })
}

function rawKs(module, key, size) {
  const isaac = new module.WxIsaac64(key)
  isaac.generate(size)
  if (isaac.delete) isaac.delete()
  return Buffer.from(module.capturedRef)
}

function checkMp4(buf) {
  const p = path.join(__dirname, '.video-test.mp4')
  fs.writeFileSync(p, buf)
  const r = spawnSync(FFMPEG, ['-hide_banner', '-i', p, '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 })
  const out = (r.stderr || '')
  const ok = !out.includes('moov atom not found') && !out.includes('Invalid data found') && out.includes('Duration')
  return { ok, head: out.split('\n').slice(0, 4).join(' | ').slice(0, 300) }
}

async function main() {
  const { ready, module, captured } = loadWasm()
  await ready
  const mod = module()
  console.log('wasm ok, WxIsaac64 =', Boolean(mod.WxIsaac64))
  const raw = await download(VIDEO_URL, path.join(__dirname, '.video-raw.bin'))
  console.log('raw video size =', raw.length, 'head =', raw.subarray(0, 16).toString('hex'))
  console.log('first 128K ftyp region:', raw.subarray(4, 12).toString('ascii'))

  const align = Math.ceil(ENCLEN / 8) * 8
  const isaac = new mod.WxIsaac64(ENC_KEY)
  isaac.generate(align)
  if (isaac.delete) isaac.delete()
  const ks = Buffer.from(captured())
  console.log('keystream len =', ks.length)

  const variants = {}
  variants['app-reversed'] = (() => { const r = Buffer.from(ks); r.reverse(); return r.subarray(0, ENCLEN) })()
  variants['raw-direct'] = ks.subarray(0, ENCLEN)
  // 每 8 字节交换 32 位半区
  variants['halfswap32'] = (() => {
    const o = Buffer.allocUnsafe(ks.length)
    for (let i = 0; i + 8 <= ks.length; i += 8) { ks.copy(o, i + 4, i, i + 4); ks.copy(o, i, i + 4, i + 8) }
    return o.subarray(0, ENCLEN)
  })()
  variants['halfswap32+rev'] = (() => { const r = Buffer.from(variants['halfswap32']); r.reverse(); return r })()
  variants['no-decrypt'] = Buffer.alloc(0)

  for (const [name, ksv] of Object.entries(variants)) {
    const out = Buffer.from(raw)
    const n = Math.min(ENCLEN, out.length)
    if (ksv.length) {
      for (let i = 0; i < n; i++) out[i] ^= ksv[i]
    }
    const r = checkMp4(out)
    console.log(`\n[${name}] ffmpeg ok=${r.ok}\n  ${r.head}`)
    if (r.ok) { console.log(`\n*** HIT: ${name} ***`); process.exit(0) }
  }
  console.log('\nno variant ok')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
