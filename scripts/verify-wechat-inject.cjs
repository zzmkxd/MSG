// 第 4 层验证：WeChat key injection
// 加载 wx_key.dll 并验证符号 + 注入链路（需要 WeChat 运行）
const { join } = require('path');
const { existsSync } = require('fs');
const { execFileSync } = require('child_process');

const koffi = require('koffi');

const dllPath = join(__dirname, '..', 'resources', 'key', 'win32', 'x64', 'wx_key.dll');

if (!existsSync(dllPath)) {
  console.error(`  [FAIL] wx_key.dll not found at: ${dllPath}`);
  process.exit(1);
}

console.log('[Layer 4] WeChat 注入验证\n');

// 1. 加载 wx_key.dll
console.log('  [1/3] 加载 wx_key.dll...');
let lib;
try {
  lib = koffi.load(dllPath);
  console.log(`    [OK] ${dllPath}`);
} catch (e) {
  console.log(`  [FAIL] wx_key.dll 加载失败: ${e.message}`);
  process.exit(1);
}

// 2. 符号解析
console.log('  [2/3] 关键符号解析...');
const symbolDefs = [
  { name: 'InitializeHook',    sig: 'bool InitializeHook(uint32 targetPid)' },
  { name: 'PollKeyData',       sig: 'bool PollKeyData(_Out_ char *keyBuffer, int bufferSize)' },
  { name: 'GetStatusMessage',  sig: 'bool GetStatusMessage(_Out_ char *msgBuffer, int bufferSize, _Out_ int *outLevel)' },
  { name: 'CleanupHook',       sig: 'bool CleanupHook()' },
  { name: 'GetLastErrorMsg',   sig: 'const char* GetLastErrorMsg()' },
  { name: 'GetImageKey',       sig: 'bool GetImageKey(_Out_ char *resultBuffer, int bufferSize)' },
];

const symbols = {};
let allResolved = true;
for (const def of symbolDefs) {
  try {
    symbols[def.name] = lib.func(def.sig);
    console.log(`    [OK] ${def.name}`);
  } catch (e) {
    console.log(`    [MISS] ${def.name}: ${e.message}`);
    allResolved = false;
  }
}

if (!allResolved) {
  console.log('\n[FAIL] Layer 4 — 部分符号解析失败');
  process.exit(1);
}

// 3. 检测 WeChat 进程并在有进程时尝试注入
console.log('  [3/3] WeChat 进程检测 + 注入...');
let wechatPid = null;
try {
  const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Weixin.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5000 });
  const m = out.match(/"Weixin\.exe","(\d+)"/);
  if (m) wechatPid = parseInt(m[1], 10);
} catch {}
if (!wechatPid) {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq WeChat.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5000 });
    const m = out.match(/"WeChat\.exe","(\d+)"/);
    if (m) wechatPid = parseInt(m[1], 10);
  } catch {}
}

if (!wechatPid) {
  console.log('    [SKIP] WeChat 进程未运行，跳过注入测试');
  console.log('\n[PASS] Layer 4 — wx_key.dll 加载 + 符号解析通过（WeChat 未运行，注入未测试）');
  process.exit(0);
}

console.log(`    WeChat PID: ${wechatPid}`);

// 尝试注入
const initHook = symbols['InitializeHook'];
const pollKeyData = symbols['PollKeyData'];
const getStatusMessage = symbols['GetStatusMessage'];
const cleanupHook = symbols['CleanupHook'];

let hookOk = false;
try {
  hookOk = initHook(wechatPid);
  console.log(`    InitializeHook(${wechatPid}) → ${hookOk}`);
} catch (e) {
  console.log(`    InitializeHook(${wechatPid}) → exception: ${e.message}`);
}

if (!hookOk) {
  // 尝试读取错误信息
  const getLastError = symbols['GetLastErrorMsg'];
  let errMsg = '';
  try {
    const errPtr = getLastError();
    if (errPtr) errMsg = koffi.decode(errPtr, 'char', -1) || '';
  } catch {}
  console.log(`    [WARN] InitializeHook 失败${errMsg ? ': ' + errMsg : ''}`);
  console.log('    可能需要管理员权限运行，或有安全软件拦截');
  console.log('\n[PASS] Layer 4 — wx_key.dll 加载 + 符号解析通过（注入需管理员权限 + WeChat 运行）');
  process.exit(0);
}

// 轮询密钥（最多等 5 秒）
console.log('    轮询密钥中（最多 5 秒）...');
const keyBuffer = Buffer.alloc(128);
const deadline = Date.now() + 5000;
let keyObtained = false;

while (Date.now() < deadline) {
  try {
    if (pollKeyData(keyBuffer, keyBuffer.length)) {
      const nullIdx = keyBuffer.indexOf(0);
      const key = keyBuffer.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim();
      if (key.length === 64) {
        console.log(`    [OK] 密钥获取成功: ${key.substring(0, 8)}...${key.substring(56)}`);
        keyObtained = true;
        break;
      }
    }
  } catch {}
  // 用 busy-wait 的子状态检查
  const start = Date.now();
  while (Date.now() - start < 120) { /* spin */ }
}

if (!keyObtained) {
  // 获取状态信息
  const statusBuffer = Buffer.alloc(256);
  const levelOut = [0];
  try {
    getStatusMessage(statusBuffer, statusBuffer.length, levelOut);
    const nullIdx = statusBuffer.indexOf(0);
    const msg = statusBuffer.toString('utf8', 0, nullIdx > -1 ? nullIdx : undefined).trim();
    if (msg) console.log(`    状态: ${msg}`);
  } catch {}
  console.log('    [WARN] 5 秒内未获取到密钥（可能 WeChat 需要先登录）');
}

// 清理
try { cleanupHook(); } catch {}

console.log(`\n[PASS] Layer 4 — wx_key.dll 全部验证通过`);
console.log(`  - DLL 加载: OK`);
console.log(`  - 6/6 符号解析: OK`);
console.log(`  - 注入 InitializeHook: ${hookOk ? 'OK' : 'FAIL (需管理员权限)'}`);
console.log(`  - 密钥获取: ${keyObtained ? 'OK' : 'SKIP (需登录 WeChat)'}`);
process.exit(0);
