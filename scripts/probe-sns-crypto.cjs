// 朋友圈图片解密方案暴力实验
// 用应用的 wasm_video_decode.wasm（WxIsaac64）生成密钥流，对 成功/失败 样本
// 尝试多种 XOR 变体（反转/偏移/字节序）与 AES-GCM 派生，找出失败样本的正确方案。
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const https = require('https')
const zlib = require('zlib')
const crypto = require('crypto')

const WASM_JS = path.join(__dirname, '..', 'electron', 'assets', 'wasm', 'wasm_video_decode.js')
const WASM_BIN = path.join(__dirname, '..', 'electron', 'assets', 'wasm', 'wasm_video_decode.wasm')
const MANIFEST = path.join(__dirname, '.sample-manifest.json')

const magicOf = (b) => {
  if (!b || b.length < 12) return null
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return '.gif'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return '.png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return '.webp'
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return '.mp4/ftyp'
  return null
}

function download(url, out, useEncoding = false) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'MicroMessenger Client' }
    if (useEncoding) {
      headers['Accept'] = '*/*'
      headers['Accept-Encoding'] = 'gzip, deflate, br'
      headers['Accept-Language'] = 'zh-CN,zh;q=0.9'
      headers['Connection'] = 'keep-alive'
    }
    const req = https.get(url, { headers, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)) }
      const chunks = []
      let stream = res
      const encoding = (res.headers['content-encoding'] || '').toString().toLowerCase()
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip())
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate())
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress())
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => {
        const data = Buffer.concat(chunks)
        fs.writeFileSync(out, data)
        resolve({ file: out, contentEncoding: encoding, compressedLen: res.headers['content-length'] || '', len: data.length, xEnc: String(res.headers['x-enc'] || '') })
      })
      stream.on('error', (e) => reject(e))
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

function loadWasmModule() {
  const wasmBinary = fs.readFileSync(WASM_BIN)
  const mockGlobal = {
    console, Buffer, Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
    Float32Array, Float64Array, BigInt64Array, BigUint64Array,
    Array, Object, Function, String, Number, Boolean, Error, Promise,
    require, process, setTimeout, clearTimeout, setInterval, clearInterval,
  }
  const state = { captured: null }
  let onReady = null
  const readyPromise = new Promise((r) => { onReady = r })
  mockGlobal.Module = {
    onRuntimeInitialized: () => onReady(),
    wasmBinary,
    print: (t) => console.log('[wasm]', t),
    printErr: (t) => console.error('[wasm-err]', t),
  }
  mockGlobal.self = mockGlobal
  mockGlobal.location = { href: WASM_JS }
  mockGlobal.WorkerGlobalScope = function () { }
  mockGlobal.VTS_WASM_URL = `file://${WASM_BIN}`
  mockGlobal.wasm_isaac_generate = (ptr, size) => {
    state.captured = new Uint8Array(mockGlobal.Module.HEAPU8.buffer.slice(ptr, ptr + size))
  }
  const script = new vm.Script(fs.readFileSync(WASM_JS, 'utf8'), { filename: WASM_JS })
  script.runInContext(vm.createContext(mockGlobal))
  return { readyPromise, getModule: () => mockGlobal.Module, getCaptured: () => state.captured }
}

function genRawKeystream(module, key, size, getCaptured) {
  let err = null
  try {
    const isaac = new module.WxIsaac64(key)
    isaac.generate(size)
    if (isaac.delete) isaac.delete()
  } catch (e) {
    err = e && e.message ? String(e.message) : String(e)
  }
  const got = getCaptured()
  if (!got) {
    console.log(`  [keystream] 失败 key=${key} err=${err || '(callback 未触发)'}`)
    return null
  }
  return Buffer.from(got)
}

function xor(data, ks, offset) {
  const out = Buffer.allocUnsafe(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ ks[offset + i]
  return out
}

function tryIsaacVariants(label, data, key, rawKs) {
  // 以 WASM 原始密钥流（rawKs，8 字节对齐）为基准，枚举块级/字节级布局变体：
  //  - identity：原样顺序
  //  - chunk-swap-halves：每 8 字节交换两个 32 位半区（DLL 精确算法）
  //  - chunk-rev：每 8 字节内部反转
  //  - whole-rev：整条流反转（应用当前 wasmService 行为）
  // 及其两两组合 + 0..7 偏移
  const chunkN = Math.floor(rawKs.length / 8)
  const build = (tfm) => {
    const out = Buffer.allocUnsafe(chunkN * 8)
    for (let i = 0; i < chunkN; i++) {
      const src = rawKs.subarray(i * 8, i * 8 + 8)
      tfm(src, out, i * 8)
    }
    return out
  }
  const ident = (s, o, off) => s.copy(o, off)
  const swapHalves = (s, o, off) => { s.copy(o, off + 4, 0, 4); s.copy(o, off, 4, 8) }
  const chunkRev = (s, o, off) => { for (let i = 0; i < 8; i++) o[off + i] = s[7 - i] }
  const base = [
    ['w-identity', build(ident)],
    ['w-chunk-swap32', build(swapHalves)],
    ['w-chunk-rev', build(chunkRev)],
  ]
  const variants = []
  for (const [n, b] of base) {
    variants.push([n, b])
    const r = Buffer.from(b); r.reverse()
    variants.push([`${n}+whole-rev`, r])
  }

  const seen = new Set()
  for (const [baseName, full] of variants) {
    for (let off = 0; off < 8; off++) {
      const name = off === 0 ? baseName : `${baseName}+off${off}`
      const k2 = `${baseName}|${off}`
      if (seen.has(k2)) continue
      seen.add(k2)
      const out = Buffer.allocUnsafe(data.length)
      for (let i = 0; i < data.length; i++) out[i] = data[i] ^ full[off + i]
      const m = magicOf(out)
      if (m) {
        console.log(`  [${label}] HIT: ${name} -> ${m} (head ${out.subarray(0, 8).toString('hex')})`)
        return { name, magic: m }
      }
    }
  }
  console.log(`  [${label}] 无变体命中; 原始 head=${data.subarray(0, 8).toString('hex')}`)
  return null
}

function tryGcmVariants(label, data, keyStr) {
  const keyTries = []
  const k16 = Buffer.from(keyStr, 'utf8').subarray(0, 16)
  if (k16.length === 16) keyTries.push(['utf8-16', k16])
  keyTries.push(['md5', crypto.createHash('md5').update(keyStr).digest()])
  keyTries.push(['sha256-16', crypto.createHash('sha256').update(keyStr).digest().subarray(0, 16)])
  const layouts = []
  if (data.length > 28) {
    layouts.push(['tail-nonce12-tag16', data.subarray(data.length - 28, data.length - 16), data.subarray(0, data.length - 28), data.subarray(data.length - 16)])
  }
  if (data.length > 16) {
    layouts.push(['tail-tag16', data.subarray(0, 12), data.subarray(12, data.length - 16), data.subarray(data.length - 16)])
  }
  layouts.push(['head-nonce12-tag16', data.subarray(0, 12), data.subarray(12, data.length - 16), data.subarray(data.length - 16)])
  for (const [lname, nonce, ct, tag] of layouts) {
    for (const [kname, key] of keyTries) {
      try {
        const d = crypto.createDecipheriv('aes-128-gcm', key, nonce)
        d.setAuthTag(tag)
        const out = Buffer.concat([d.update(ct), d.final()])
        const m = magicOf(out)
        if (m) { console.log(`  [${label}] GCM HIT: ${lname} + ${kname} -> ${m}`); return { name: `gcm-${lname}-${kname}`, magic: m } }
      } catch { }
    }
  }
  return null
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
  const { readyPromise, getModule, getCaptured } = loadWasmModule()
  await readyPromise
  const mod = getModule()
  console.log('wasm ready, has WxIsaac64 =', Boolean(mod.WxIsaac64))
  for (const [name, info] of Object.entries(manifest)) {
    console.log(`\n===== ${name} key=${info.key} =====`)
    const file = path.join(__dirname, `.sample-${name}.bin`)
    let meta
    try {
      meta = await download(info.url, file, true)
    } catch (e) {
      console.log('  download failed:', e.message)
      continue
    }
    const data = fs.readFileSync(file)
    console.log(`  size=${data.length} rawHead=${data.subarray(0, 12).toString('hex')} meta=${JSON.stringify(meta)}`)
    const rawMagic = magicOf(data)
    if (rawMagic) { console.log(`  明文直接识别: ${rawMagic}`); continue }
    const aligned = Math.ceil(data.length / 8) * 8
    const rawKs = genRawKeystream(mod, info.key, aligned, getCaptured)
    if (!rawKs) { console.log('  wasm 密钥流生成失败'); continue }
    const hit = tryIsaacVariants(name, data, info.key, rawKs)
    if (!hit) {
      const g = tryGcmVariants(name, data, info.key)
      if (!g) console.log('  [无方案命中]')
    }
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
