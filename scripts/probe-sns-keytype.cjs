// 按密钥类型分组实测应用侧解密：key="0" / 19位(108x) / 20位(993x)
// 用法：node scripts/probe-sns-keytype.cjs
const http = require('http')
const { readFileSync } = require('fs')
const { join } = require('path')

const TOKEN = (readFileSync(join(__dirname, '.probe-sns-token.txt'), 'utf8') || '').trim()
const PORT = 5031

function apiGet(path, keepBody = false) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?'
    const full = `${path}${sep}access_token=${encodeURIComponent(TOKEN)}`
    const req = http.get({ host: '127.0.0.1', port: PORT, path: full, timeout: 60000 }, (res) => {
      if (res.statusCode !== 200 || keepBody) {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('close', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', () => resolve({ status: res.statusCode, body: '' }))
      } else {
        try { res.destroy() } catch { }
        resolve({ status: 200, body: '' })
      }
    })
    req.on('timeout', () => { try { req.destroy() } catch { } reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

async function main() {
  const r = await apiGet('/api/v1/sns/timeline?limit=200&media=false', true)
  const timeline = JSON.parse(r.body).timeline || []
  const groups = { zero: [], k108x: [], k993x: [] }
  for (const p of timeline) {
    for (const m of Array.isArray(p.media) ? p.media : []) {
      for (const [kind, u] of [['url', m.url], ['thumb', m.thumb]]) {
        if (!u || !/^https?:\/\//i.test(u)) continue
        const k = String(m.key || '').trim()
        let g = null
        if (k === '0' || k === '') g = 'zero'
        else if (k.length === 20 && k.startsWith('108')) g = 'k108x'
        else if (k.length === 19 && k.startsWith('99')) g = 'k993x'
        if (!g) continue
        if (groups[g].length >= 10) continue
        groups[g].push({ url: u, key: k, kind, date: new Date((p.createTime || 0) * 1000).toISOString().slice(0, 10) })
      }
    }
  }
  for (const [g, items] of Object.entries(groups)) {
    console.log(`\n===== 组 ${g}（${items.length} 条） =====`)
    let ok = 0, fail = 0
    for (const it of items) {
      const keyParam = it.key ? `&key=${encodeURIComponent(it.key)}` : ''
      const res = await apiGet(`/api/v1/sns/media/proxy?url=${encodeURIComponent(it.url)}${keyParam}`)
      let err = ''
      try { err = (JSON.parse(res.body) || {}).error || '' } catch { }
      if (res.status === 200) { ok++ } else { fail++ }
      console.log(`  [${it.date}] ${it.kind} key=${it.key || '(空)'} -> ${res.status} ${err}`)
    }
    console.log(`  组内成功 ${ok} / 失败 ${fail}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
