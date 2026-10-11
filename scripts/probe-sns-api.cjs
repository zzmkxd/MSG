// 朋友圈媒体加载诊断（走运行中应用的 HTTP API，纯 Node）
// 用法：node scripts/probe-sns-api.cjs [--port 5031] [--limit 40]
// 流程：health → sns/timeline（media=false 拿 fixSnsUrl 后的 URL）→
//       对抽样 URL 调 /api/v1/sns/media/proxy 记录应用侧真实结果；
//       同时用自己的请求头直连 CDN（http/https 变体）对照。

const http = require('http')
const { writeFileSync } = require('fs')
const { join } = require('path')

const argv = process.argv.slice(2)
const argNum = (n, d) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] ? parseInt(argv[i + 1], 10) : d }
const PORT = argNum('--port', 5031)
const LIMIT = argNum('--limit', 40)
const OUT = join(__dirname, '.probe-sns-api-out.txt')

const logLines = []
const log = (line) => { const s = String(line); logLines.push(s); console.log(s) }

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 20000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }))
      res.on('error', reject)
    })
    req.on('timeout', () => { req.destroy(new Error('timeout')); reject(new Error('timeout')) })
    req.on('error', reject)
  })
}

function cdnGet(url) {
  return new Promise((resolve) => {
    let mod
    try { mod = url.startsWith('https:') ? require('https') : http } catch { return resolve({ err: 'bad-url' }) }
    const req = mod.get(url, {
      headers: { 'User-Agent': 'MicroMessenger Client', 'Accept': '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', 'Connection': 'keep-alive' },
      timeout: 8000
    }, (res) => {
      let size = 0
      res.on('data', (c) => { size += c.length; if (size > 65536) res.destroy() })
      res.on('end', () => resolve({ status: res.statusCode, size }))
      res.on('error', () => resolve({ status: res.statusCode, size }))
    })
    req.on('timeout', () => { req.destroy(new Error('t')); resolve({ err: 'timeout' }) })
    req.on('error', (e) => resolve({ err: e.code || 'error' }))
  })
}

function isVideoUrl(url) {
  if (!url) return false
  const l = url.toLowerCase()
  return (l.includes('snsvideodownload') || l.includes('.mp4') || l.includes('video')) && !l.includes('vweixinthumb')
}

async function main() {
  try {
    const h = await apiGet('/api/v1/health')
    log(`health -> ${h.status} ${h.body}`)
    if (h.status !== 200) { log('[FAIL] 应用 API 未就绪'); return 1 }
  } catch (e) {
    log(`health err: ${e.message}`)
    return 1
  }

  let timeline
  try {
    const r = await apiGet('/api/v1/sns/timeline?limit=200&media=false')
    log(`timeline -> ${r.status}, body len ${r.body.length}`)
    const j = JSON.parse(r.body)
    timeline = j.timeline || []
    log(`帖子数 = ${timeline.length}`)
  } catch (e) {
    log(`timeline err: ${e.message}`)
    return 1
  }

  const media = []
  for (const post of timeline) {
    const ts = post.createTime || 0
    for (const m of Array.isArray(post.media) ? post.media : []) {
      for (const [kind, u, k] of [
        ['url', m.url, m.key],
        ['thumb', m.thumb, m.key],
        ['live', m.livePhoto?.url, m.livePhoto?.key || m.key],
        ['live-thumb', m.livePhoto?.thumb, m.livePhoto?.key || m.key]
      ]) {
        if (!u || typeof u !== 'string' || !/^https?:\/\//i.test(u)) continue
        let host = ''
        try { host = new URL(u).hostname } catch { continue }
        media.push({ url: u, key: k || '', createTime: ts, host, kind, isVideo: isVideoUrl(u) })
      }
    }
  }
  log(`媒体条目 = ${media.length}`)

  const skip = ['mmbiz.qpic.cn', 'wxapp.tc.qq.com']
  const cand = media.filter((m) => !skip.includes(m.host))
  const step = Math.max(1, Math.floor(cand.length / LIMIT))
  const sample = cand.filter((_, i) => i % step === 0).slice(0, LIMIT)
  log(`抽样 ${sample.length} 条`)

  const stats = { appOk: 0, appFail: 0, cdnOk: 0, cdnFail: 0 }
  const byHost = {}
  const failures = []

  for (const m of sample) {
    // 应用侧（完整拉取+解密管线）
    let appStatus = '', appErr = ''
    try {
      const keyParam = m.key ? `&key=${encodeURIComponent(m.key)}` : ''
      const r = await apiGet(`/api/v1/sns/media/proxy?url=${encodeURIComponent(m.url)}${keyParam}`)
      if (r.status === 200) { appStatus = '200'; stats.appOk++ }
      else {
        let msg = ''
        try { msg = (JSON.parse(r.body) || {}).error || '' } catch { }
        appStatus = String(r.status); appErr = msg
        stats.appFail++
      }
    } catch (e) {
      appStatus = 'ERR:' + e.message; stats.appFail++
    }

    // 直连 CDN 对照（fixed https；失败再试 http）
    let cdn = await cdnGet(m.url)
    let upgraded = ''
    if (!(cdn.status === 200 || cdn.status === 206) && m.url.startsWith('https:')) {
      const r2 = await cdnGet(m.url.replace('https:', 'http:'))
      if (r2.status === 200 || r2.status === 206) { cdn = r2; upgraded = ' (http可通)' }
    }
    const cdnStatus = cdn.status ?? cdn.err
    const bk = `${m.host}|${cdnStatus}`
    byHost[bk] = (byHost[bk] || 0) + 1
    if (cdnStatus === 200 || cdnStatus === 206) stats.cdnOk++
    else stats.cdnFail++

    if (appStatus !== '200' || (cdnStatus !== 200 && cdnStatus !== 206)) {
      failures.push({
        date: new Date((m.createTime || 0) * 1000).toISOString().slice(0, 10),
        kind: m.kind, video: m.isVideo, host: m.host, hasKey: Boolean(m.key),
        app: appStatus + (appErr ? ` ${appErr}` : ''),
        cdn: String(cdnStatus) + upgraded,
        url: m.url
      })
    }
  }

  log('\n===== 统计 =====')
  log(`应用 proxy 成功: ${stats.appOk} / 失败: ${stats.appFail}`)
  log(`直连 CDN 成功: ${stats.cdnOk} / 失败: ${stats.cdnFail}`)
  for (const [k, c] of Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 14)) log(`  ${k} × ${c}`)
  if (failures.length) {
    log('\n===== 失败样本（最多 25） =====')
    for (const f of failures.slice(0, 25)) {
      const short = f.url.length > 110 ? f.url.slice(0, 110) + '…' : f.url
      log(`[${f.date}] ${f.kind} video=${f.video} key=${f.hasKey ? 'Y' : 'N'} host=${f.host}`)
      log(`  app=${f.app}`)
      log(`  cdn=${f.cdn} ${short}`)
    }
  }
  writeFileSync(OUT, logLines.join('\n'), 'utf8')
  log(`\n[已写入 ${OUT}]`)
  return 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e); process.exit(1) })
