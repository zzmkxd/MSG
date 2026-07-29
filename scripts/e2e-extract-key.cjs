// E2E 步骤 2：重启微信 + 注入 + 获取密钥
// 用法：node scripts/e2e-extract-key.cjs
// 流程：启动微信 → 注入 → 提示用户登录 → 轮询密钥 → 保存到 .claude/e2e-key.json

const koffi = require('koffi');
const { execFileSync } = require('child_process');
const { join } = require('path');
const { writeFileSync, existsSync } = require('fs');

const DLL = join(__dirname, '..', 'resources', 'key', 'win32', 'x64', 'wx_key.dll');
const WECHAT_EXE = 'E:\\Tool_zone\\Tencent\\Weixin\\Weixin.exe';
const OUTPUT = join(__dirname, '..', '.claude', 'e2e-key.json');

// ---- 1. 加载 DLL + 解析符号 ----
console.log('[1/5] 加载 wx_key.dll');
if (!existsSync(DLL)) {
  console.error('  [FAIL] DLL 不存在:', DLL);
  process.exit(1);
}
const lib = koffi.load(DLL);

const InitializeHook  = lib.func('bool InitializeHook(uint32 targetPid)');
const PollKeyData      = lib.func('bool PollKeyData(_Out_ char *keyBuffer, int bufferSize)');
const GetImageKey      = lib.func('bool GetImageKey(_Out_ char *resultBuffer, int bufferSize)');
const GetStatusMessage = lib.func('bool GetStatusMessage(_Out_ char *msgBuffer, int bufferSize, _Out_ int *outLevel)');
const GetLastErrorMsg  = lib.func('const char* GetLastErrorMsg()');
const CleanupHook      = lib.func('bool CleanupHook()');
console.log('  [OK] 6/6 符号');

// ---- 2. 确认微信已关闭 ----
console.log('[2/5] 确认微信已关闭');
const findWeChat = () => {
  try {
    const out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5000 });
    const lines = out.split('\n');
    let pid = null, maxMem = 0;
    for (const line of lines) {
      const m = line.match(/"Weixin\.exe","(\d+)","[^"]*","\d+","([\d,]+)\s*K"/);
      if (m) {
        const p = parseInt(m[1], 10);
        const mem = parseInt(m[2].replace(/,/g, ''), 10);
        if (mem > maxMem) { maxMem = mem; pid = p; }
      }
    }
    return pid;
  } catch { return null; }
};

if (findWeChat()) {
  console.log('  [WARN] 微信仍在运行，请先关闭');
  process.exit(1);
}
console.log('  [OK] 微信已关闭');

// ---- 3. 启动微信 ----
console.log('[3/5] 启动微信...');
require('child_process').exec(`"${WECHAT_EXE}"`, { windowsHide: true });
// 等待微信进程出现
let newPid = null;
for (let i = 0; i < 30; i++) {
  const s = Date.now(); while (Date.now() - s < 500) {} // sleep 500ms
  newPid = findWeChat();
  if (newPid) break;
}
if (!newPid) {
  console.error('  [FAIL] 微信启动超时（15秒内未检测到进程）');
  process.exit(1);
}
console.log('  [OK] 微信已启动，PID:', newPid);

// ---- 4. 注入 ----
console.log('[4/5] 注入 hook...');
const hookOk = InitializeHook(newPid);
if (!hookOk) {
  let err = '';
  try { const p = GetLastErrorMsg(); if (p) err = koffi.decode(p, 'char', -1); } catch {}
  console.error('  [FAIL] InitializeHook 失败' + (err ? ': ' + err : ''));
  process.exit(1);
}
console.log('  [OK] Hook 已就位');

// ---- 5. 等待用户登录 + 轮询密钥 ----
console.log('');
console.log('========================================');
console.log('  >>> 请立即登录微信！<<<');
console.log('  脚本正在轮询等待密钥派生...');
console.log('========================================');
console.log('');

const keyBuf = Buffer.alloc(256);
const deadline = Date.now() + 120000; // 最多等 2 分钟
let gotKey = false;
let dbKey = '';
let lastStatus = '';

while (Date.now() < deadline) {
  try {
    if (PollKeyData(keyBuf, keyBuf.length)) {
      const nullIdx = keyBuf.indexOf(0);
      const key = keyBuf.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim();
      if (key.length >= 32) {
        dbKey = key;
        gotKey = true;
        console.log('\n  [OK] DB 密钥获取成功！长度:', key.length);
        console.log('  密钥: ' + key.substring(0, 16) + '...' + key.substring(key.length - 16));
        break;
      }
    }
  } catch {}

  // 每 2 秒输出一次状态
  const elapsed = Math.round((Date.now() + 120000 - deadline) / 1000) || 0;  // just show dots
  const now = Date.now();
  if (now % 2000 < 100) {
    try {
      const statusBuf = Buffer.alloc(512);
      const levelOut = [0];
      GetStatusMessage(statusBuf, statusBuf.length, levelOut);
      const nullIdx = statusBuf.indexOf(0);
      const msg = statusBuf.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim();
      if (msg && msg !== lastStatus) {
        console.log('  状态:', msg);
        lastStatus = msg;
      }
    } catch {}
  }

  const s = Date.now(); while (Date.now() - s < 100) {} // spin 100ms
}

// ---- 6. 获取图片密钥 ----
let imageKey = '';
console.log('[6] 获取图片密钥...');
try {
  const imgBuf = Buffer.alloc(8192);
  if (GetImageKey(imgBuf, imgBuf.length)) {
    const nullIdx = imgBuf.indexOf(0);
    imageKey = imgBuf.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim();
    console.log('  [OK] 图片密钥长度:', imageKey.length);
  } else {
    console.log('  [WARN] GetImageKey 返回 false');
  }
} catch (e) {
  console.log('  [WARN] GetImageKey 异常:', e.message);
}

// ---- 7. 清理 + 保存 ----
CleanupHook();
console.log('  Hook 已清理');

const result = {
  timestamp: new Date().toISOString(),
  dbKeyObtained: gotKey,
  dbKey: dbKey || null,
  dbKeyLength: dbKey.length,
  imageKeyLength: imageKey.length,
};
writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
console.log('\n结果已保存至:', OUTPUT);

if (gotKey) {
  console.log('\n========================================');
  console.log('  [PASS] E2E 步骤 2 完成 — DB 密钥获取成功');
  console.log('========================================');
  process.exit(0);
} else {
  console.log('\n========================================');
  console.log('  [FAIL] 未在 2 分钟内获取到密钥');
  console.log('  请确认已登录微信');
  console.log('========================================');
  process.exit(1);
}
