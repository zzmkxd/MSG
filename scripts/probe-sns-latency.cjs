// 朋友圈图片加载延迟基准：对抽样图片调用 /api/v1/sns/media/proxy，记录每次耗时
// 用法：node scripts/probe-sns-latency.cjs [--n 12]
const http = require('http')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const TOKEN = (readFileSync(join(__dirname, '.probe-sns-token.txt'), 'utf8') || '').trim()
const PORT = 5031
const N = (() => { const i = process.argv.indexOf('--n'); return i !== -1 && process.argv[i + 1] ? parseInt(process.argv[i + 1], 10) : 12 })()

function apiGet(path, keepBody = false) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?'
    const full = `${path}${sep}access_token=${encodeURIComponent(TOKEN)}`
    const t0 = Date.now()
    const req = http.get({ host: '127.0.0.1', port: PORT, path: full, timeout: 60000 }, (res) => {
      if (res.statusCode !== 200 || keepBody) {
        const cs = []
        res.on('data', (c) => cs.push(c))
        res.on('end', () => resolve({ status: res.statusCode, ms: Date.now() - t0, body: Buffer.concat(cs).toString('utf8') }))
        res.on('close', () => resolve({ status: res.statusCode, ms: Date.now() - t0, body: Buffer.concat(cs).toString('utf8') }))
        res.on('error', () => resolve({ status: res.statusCode, ms: Date.now() - t0, body: '' }))
      } else {
        try { res.destroy() } catch { }
        resolve({ status: 200, ms: Date.now() - t0, body: '' })
      }
    })
    req.on('timeout', () => { try { req.destroy() } catch { } reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

async function main() {
  const tl = await apiGet('/api/v1/sns/timeline?limit=200&media=false', true)
  const timeline = JSON.parse(tl.body).timeline || []
  const imgs = []
  for (const p of timeline) {
    for (const m of Array.isArray(p.media) ? p.media : []) {
      for (const u of [m.thumb, m.url]) {
        if (!u || !/^https?:\/\//i.test(u)) continue
        let host = ''
        try { host = new URL(u).hostname } catch { continue }
        if (['mmbiz.qpic.cn', 'wxapp.tc.qq.com'].includes(host)) continue
        if (u.includes('video') || u.includes('snsvideodownload') || u.includes('vweixinthumb')) continue
        imgs.push({ url: u, key: m.key || '', host })
      }
    }
  }
  const step = Math.max(1, Math.floor(imgs.length / N))
  const sample = imgs.filter((_, i) => i % step === 0).slice(0, N)
  console.log(`图片样本 ${sample.length} 条（共 ${imgs.length}）`)

  // 先跑一轮“冷”请求，再跑一轮“热”请求（缓存命中）
  const run = async (label) => {
    const times = []
    const fails = []
    for (const m of sample) {
      const keyParam = m.key && m.key !== '0' ? `&key=${encodeURIComponent(m.key)}` : ''
      try {
        const r = await apiGet(`/api/v1/sns/media/proxy?url=${encodeURIComponent(m.url)}${keyParam}`)
        if (r.status === 200) times.push(r.ms)
        else {
          let err = ''
          try { err = (JSON.parse(r.body) || {}).error || '' } catch { }
          fails.push(`${r.status} ${err}`)
        }
      } catch (e) {
        fails.push('ERR ' + e.message)
      }
    }
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
    const max = times.length ? Math.max(...times) : 0
    const min = times.length ? Math.min(...times) : 0
    console.log(`[${label}] 成功 ${times.length}/${sample.length} 平均 ${avg}ms 最快 ${min}ms 最慢 ${max}ms`)
    if (fails.length) console.log(`  失败: ${fails.slice(0, 5).join(' | ')}`)
    return times
  }

  const cold = await run('冷(首轮)')
  const warm = await run('热(缓存)')
  writeFileSync(join(__dirname, '.probe-sns-latency.json'), JSON.stringify({ cold, warm }, null, 2))
  console.log('已写入 .probe-sns-latency.json')
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
