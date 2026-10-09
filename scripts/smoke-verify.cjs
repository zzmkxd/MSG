/**
 * MSG 规范化自测编排器
 *
 * 用法:
 *   npm run smoke              # 全自动层（无需人工）
 *   npm run smoke:wechat       # + 微信注入/密钥/WCDB 开库（微信需已登录或可登录）
 *   npm run smoke:pack         # + 完整打包（耗时长）后做产物护栏
 *   npm run smoke:all          # smoke + wechat + pack
 *
 * 人工节点: 脚本结束会打印 CHECKPOINT，你只需按清单看 GUI 成果。
 * 报告: .claude/smoke-report.json + .claude/smoke-report.md
 */

const { spawnSync } = require('child_process');
const { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const reportDir = join(root, '.claude');
const args = new Set(process.argv.slice(2));
const WITH_WECHAT = args.has('--wechat') || args.has('--all');
const WITH_PACK = args.has('--pack') || args.has('--all');
const QUICK = args.has('--quick'); // 跳过 typecheck（更快）

const results = [];

function run(id, title, cmd, cmdArgs, opts = {}) {
  console.log(`\n======== [${id}] ${title} ========`);
  const started = Date.now();
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeout ?? 10 * 60 * 1000,
    env: { ...process.env, ...opts.env },
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (out) {
    const lines = out.split(/\r?\n/);
    const clipped = lines.length > 80 ? [...lines.slice(0, 40), '…', ...lines.slice(-30)] : lines;
    console.log(clipped.join('\n'));
  }
  const code = r.status ?? (r.error ? 1 : 0);
  const ok = opts.allowFail ? true : code === 0;
  const softFail = opts.allowFail && code !== 0;
  results.push({
    id,
    title,
    ok: opts.allowFail ? code === 0 || opts.treatSkipAsOk : ok,
    code,
    softFail,
    skipped: false,
    ms: Date.now() - started,
    tail: out.split(/\r?\n/).slice(-8).join('\n'),
  });
  if (!ok && !opts.allowFail) {
    console.log(`\n[ABORT] ${id} 失败 (exit ${code})`);
  }
  return code === 0;
}

function skip(id, title, reason) {
  console.log(`\n======== [${id}] ${title} ========`);
  console.log(`  [SKIP] ${reason}`);
  results.push({ id, title, ok: true, skipped: true, reason, ms: 0, code: 0, tail: reason });
}

function wechatRunning() {
  const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq Weixin.exe', '/FO', 'CSV', '/NH'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  return /"Weixin\.exe","\d+"/.test(r.stdout || '');
}

function hasKey() {
  const p = join(reportDir, 'e2e-key.json');
  if (!existsSync(p)) return false;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    return Boolean(j.dbKeyObtained || j.dbKey);
  } catch {
    return false;
  }
}

function checkPackArtifacts() {
  console.log('\n======== [L6b] 打包产物护栏 ========');
  const release = join(root, 'release');
  const checks = [];
  if (!existsSync(release)) {
    checks.push({ ok: false, msg: 'release/ 不存在 — 先跑 npm run build' });
  } else {
    const names = readdirSync(release);
    const setup = names.find((n) => /Setup\.exe$/i.test(n) || /MSG-.*\.exe$/i.test(n));
    const winUnpacked = names.find((n) => /win-unpacked/i.test(n) || /win-/i.test(n) && !/\.exe$/i.test(n));
    // electron-builder 常见布局: release/win-unpacked/electron.exe
    const unpackedDir = join(release, 'win-unpacked');
    const exeCandidates = [
      join(unpackedDir, 'electron.exe'),
      join(release, 'electron.exe'),
    ];
    let exe = exeCandidates.find((p) => existsSync(p));
    if (!exe && existsSync(unpackedDir)) {
      const files = readdirSync(unpackedDir);
      const hit = files.find((f) => f.toLowerCase() === 'electron.exe');
      if (hit) exe = join(unpackedDir, hit);
      const wrong = files.find((f) => /^MSG\.exe$/i.test(f) || /^msg\.exe$/i.test(f));
      if (wrong) checks.push({ ok: false, msg: `发现错误 EXE 名 ${wrong} — 会导致 WCDB -1006` });
    }
    if (exe) checks.push({ ok: true, msg: `宿主 EXE: ${exe}` });
    else checks.push({ ok: false, msg: '未找到 electron.exe（win-unpacked）' });

    if (setup) checks.push({ ok: true, msg: `安装包: ${setup}` });
    else checks.push({ ok: false, msg: '未找到 Setup.exe 安装包（可仅有 dir 目标）' });

    // asarUnpack workers
    const unpackWorkers = join(unpackedDir, 'resources', 'app.asar.unpacked', 'dist-electron');
    if (existsSync(unpackWorkers)) {
      const ws = readdirSync(unpackWorkers).filter((f) => /Worker\.js$/i.test(f));
      if (ws.length) checks.push({ ok: true, msg: `asar 解包 Worker: ${ws.length} 个` });
      else checks.push({ ok: false, msg: 'app.asar.unpacked/dist-electron 无 *Worker.js' });
    } else {
      checks.push({ ok: false, msg: '缺少 app.asar.unpacked/dist-electron（Worker 可能在 asar 内）' });
    }

    // WCDB resources
    const wcdb = join(unpackedDir, 'resources', 'resources', 'wcdb', 'win32', 'x64', 'wcdb_api.dll');
    const wcdbAlt = join(unpackedDir, 'resources', 'wcdb', 'win32', 'x64', 'wcdb_api.dll');
    if (existsSync(wcdb) || existsSync(wcdbAlt)) checks.push({ ok: true, msg: '打包产物含 wcdb_api.dll' });
    else checks.push({ ok: false, msg: '打包产物缺少 wcdb_api.dll' });
  }

  for (const c of checks) console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.msg}`);
  const ok = checks.every((c) => c.ok);
  results.push({
    id: 'L6b',
    title: '打包产物护栏',
    ok,
    skipped: false,
    code: ok ? 0 : 1,
    ms: 0,
    tail: checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}: ${c.msg}`).join('\n'),
  });
  return ok;
}

function writeReport() {
  mkdirSync(reportDir, { recursive: true });
  const failed = results.filter((r) => !r.ok && !r.skipped);
  const summary = {
    timestamp: new Date().toISOString(),
    mode: { WITH_WECHAT, WITH_PACK, QUICK },
    passed: results.filter((r) => r.ok && !r.skipped).length,
    failed: failed.length,
    skipped: results.filter((r) => r.skipped).length,
    results,
    checkpoint: {
      title: '人工验收节点（仅需你看成果）',
      steps: [
        '1. 若刚打包：安装或直接跑 release/win-unpacked/electron.exe',
        '2. 引导：协议 → 账号 → 密钥 → DB → 进主界面（应无 -1006）',
        '3. 会话列表点开一条聊天，确认消息气泡正常',
        '4. 资源页：点一张图解密；可选批量勾选解密',
        '5. （可选）语音消息能否转 MP3/播放 — Silk 实测',
        '6. 已知可接受：部分图「解密失败」；资源图可能重复约 3 份',
      ],
      knownLimits: [
        '部分图片解密失败 = SDK 密钥变体限制，非回归',
        '资源浏览重复 ≈ WCDB 跨分片，前端已部分去重',
      ],
    },
  };

  const jsonPath = join(reportDir, 'smoke-report.json');
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const md = [];
  md.push(`# MSG Smoke 报告`);
  md.push(`\n生成时间: ${summary.timestamp}`);
  md.push(`\n模式: wechat=${WITH_WECHAT} pack=${WITH_PACK} quick=${QUICK}`);
  md.push(`\n结果: ✅ ${summary.passed}  ❌ ${summary.failed}  ⏭ ${summary.skipped}\n`);
  md.push(`| 层 | 标题 | 结果 | 耗时 |`);
  md.push(`|----|------|------|------|`);
  for (const r of results) {
    const mark = r.skipped ? '⏭ SKIP' : r.ok ? '✅ PASS' : '❌ FAIL';
    md.push(`| ${r.id} | ${r.title} | ${mark} | ${r.ms}ms |`);
  }
  md.push(`\n## 人工验收节点\n`);
  for (const s of summary.checkpoint.steps) md.push(`- ${s}`);
  md.push(`\n## 已知可接受限制\n`);
  for (const s of summary.checkpoint.knownLimits) md.push(`- ${s}`);
  if (failed.length) {
    md.push(`\n## 失败详情\n`);
    for (const f of failed) {
      md.push(`### ${f.id} ${f.title}\n\`\`\`\n${f.tail || '(no output)'}\n\`\`\`\n`);
    }
  }
  const mdPath = join(reportDir, 'smoke-report.md');
  writeFileSync(mdPath, md.join('\n'));
  return { jsonPath, mdPath, summary };
}

// ---------- 执行 ----------
console.log('MSG Smoke Verify');
console.log(`  wechat=${WITH_WECHAT}  pack=${WITH_PACK}  quick=${QUICK}`);
console.log(`  wechatRunning=${wechatRunning()}  hasKey=${hasKey()}`);

let aborted = false;

// L0 打包配置
if (!run('L0', '打包配置护栏', 'node', ['scripts/smoke-pack-config.cjs'])) aborted = true;

// L1 typecheck
if (!aborted) {
  if (QUICK) skip('L1', 'TypeScript 检查', '--quick 跳过');
  else if (!run('L1', 'TypeScript 检查', 'npx', ['tsc', '--noEmit'], { timeout: 5 * 60 * 1000 })) aborted = true;
}

// L2 原生模块
if (!aborted && !run('L2', '原生模块加载', 'node', ['scripts/verify-native-modules.cjs'])) aborted = true;

// L3 WCDB DLL 链路（Node 侧，wcdb_init=-1006 可为 WARN）
if (!aborted && !run('L3', 'WCDB DLL 链路', 'node', ['scripts/verify-wcdb-link.cjs'])) aborted = true;

// L4 注入符号（微信未运行则 SKIP 注入，仍算过）
if (!aborted && !run('L4', 'wx_key 符号/注入', 'node', ['scripts/verify-wechat-inject.cjs'])) aborted = true;

// L5 Electron WCDB 全链路（需要密钥）
if (!aborted) {
  if (!WITH_WECHAT) {
    skip('L5', 'Electron WCDB 开库', '未加 --wechat；有密钥时可 npm run smoke:wechat');
  } else if (!hasKey()) {
    skip('L5', 'Electron WCDB 开库', '缺少 .claude/e2e-key.json — 请先: node scripts/e2e-extract-key.cjs（需登录微信）');
  } else {
    run('L5', 'Electron WCDB 开库', 'npx', ['electron', 'scripts/e2e-wcdb-electron.cjs'], {
      timeout: 3 * 60 * 1000,
    });
  }
}

// L6 打包 / L6b 产物护栏（已有 release/ 时免费检查，不必每次重打包）
if (!aborted) {
  if (WITH_PACK) {
    const built = run('L6', '完整打包 build', 'npm', ['run', 'build'], { timeout: 30 * 60 * 1000 });
    if (built) checkPackArtifacts();
    else skip('L6b', '打包产物护栏', 'L6 失败，跳过');
  } else {
    skip('L6', '完整打包 build', '未加 --pack；需要时: npm run smoke:pack');
    if (existsSync(join(root, 'release'))) checkPackArtifacts();
    else skip('L6b', '打包产物护栏', '无 release/；加 --pack 或先 npm run build');
  }
}

const { jsonPath, mdPath, summary } = writeReport();

console.log('\n========================================');
console.log('  SMOKE 汇总');
console.log('========================================');
for (const r of results) {
  const mark = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.id} ${r.title}${r.skipped && r.reason ? ` — ${r.reason}` : ''}`);
}
console.log(`\n报告: ${mdPath}`);
console.log(`JSON: ${jsonPath}`);

console.log('\n========================================');
console.log('  CHECKPOINT — 请你看成果（仅此节点需人工）');
console.log('========================================');
for (const s of summary.checkpoint.steps) console.log(`  ${s}`);
console.log('========================================\n');

process.exit(summary.failed > 0 ? 1 : 0);
