// 打包配置护栏：防止阶段 7 已修过的 -1006 回归
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const build = pkg.build || {};
const win = build.win || {};
const asarUnpack = build.asarUnpack || [];

const checks = [];
const fail = (id, msg) => checks.push({ id, ok: false, msg });
const pass = (id, msg) => checks.push({ id, ok: true, msg });

// 1. EXE 名必须是 electron（WCDB GetModuleFileName 校验）
if (win.executableName === 'electron') {
  pass('executableName', 'win.executableName = "electron"');
} else {
  fail('executableName', `期望 "electron"，实际 ${JSON.stringify(win.executableName)} — 打包后会 -1006`);
}

// 2. Worker 必须 asarUnpack
const workerUnpack = asarUnpack.some((p) => String(p).includes('*Worker.js') || String(p).includes('Worker'));
if (workerUnpack) {
  pass('asarUnpack.workers', 'asarUnpack 含 Worker 解包规则');
} else {
  fail('asarUnpack.workers', '缺少 dist-electron/*Worker.js — Worker 无法从 asar 加载');
}

// 3. 关键原生模块 asarUnpack
for (const mod of ['koffi', 'ffmpeg-static', 'silk-wasm']) {
  const hit = asarUnpack.some((p) => String(p).includes(mod));
  if (hit) pass(`asarUnpack.${mod}`, `asarUnpack 含 ${mod}`);
  else fail(`asarUnpack.${mod}`, `asarUnpack 缺少 ${mod}`);
}

// 4. 资源 DLL 目录存在
const requiredPaths = [
  ['resources/wcdb/win32/x64/wcdb_api.dll', 'WCDB API'],
  ['resources/wcdb/win32/x64/WCDB.dll', 'WCDB'],
  ['resources/key/win32/x64/wx_key.dll', 'wx_key'],
  ['public/icon.ico', '安装图标'],
  ['installer.nsh', 'NSIS 脚本'],
];
for (const [rel, label] of requiredPaths) {
  const abs = join(root, rel);
  if (existsSync(abs)) pass(`file.${rel}`, `${label} 存在`);
  else fail(`file.${rel}`, `${label} 缺失: ${rel}`);
}

// 5. resolveWorkerPath 源文件存在
const rwp = join(root, 'electron/utils/resolveWorkerPath.ts');
if (existsSync(rwp)) pass('resolveWorkerPath', 'resolveWorkerPath.ts 存在');
else fail('resolveWorkerPath', '缺少 electron/utils/resolveWorkerPath.ts');

const failed = checks.filter((c) => !c.ok);
console.log('[Smoke] 打包配置护栏\n');
for (const c of checks) {
  console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.id}: ${c.msg}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.log('[FAIL] 打包配置护栏未通过');
  process.exit(1);
}
console.log('[PASS] 打包配置护栏通过');
process.exit(0);
