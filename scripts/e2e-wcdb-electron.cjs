// E2E 方案 B 续：在 Electron 中完整测试 WCDB 连接
// 用法：npx electron scripts/e2e-wcdb-electron.cjs
// wcdb_init() 在 Electron 中返回 0 → 继续测试 wcdb_open_account

const { app } = require('electron');
const koffi = require('koffi');
const { join, dirname, basename } = require('path');
const { existsSync, readFileSync, writeFileSync, readdirSync, statSync } = require('fs');

const DllDir = join(__dirname, '..', 'resources', 'wcdb', 'win32', 'x64');
const KEY_FILE = join(__dirname, '..', '.claude', 'e2e-key.json');
const OUTPUT = join(__dirname, '..', '.claude', 'e2e-wcdb-electron-result.json');
const BASE = 'E:/Tool_zone/Tencent/WeChat/xwechat_files';
const ACCOUNTS = ['wxid_l63apcsdl9nl22_eda4', 'wxid_xx1zzo5hut8e22_8c04'];

// PATH 优先级
process.env.PATH = [join(process.cwd(), 'resources')].join(';') + ';' + (process.env.PATH || '');

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

// 递归查找 session.db
function findSessionDb(dir) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      try {
        const st = statSync(full);
        if (st.isFile() && entry === 'session.db') return full;
        if (st.isDirectory() && !entry.startsWith('.')) {
          const found = findSessionDb(full);
          if (found) return found;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return null;
}

app.whenReady().then(() => {
  log('=== Electron WCDB 完整连接测试 ===');
  log(`Electron: ${process.versions.electron}  Node: ${process.versions.node}`);
  log('');

  const result = {
    timestamp: new Date().toISOString(),
    initProtection: null,
    wcdbInit: null,
    accounts: {},
    summary: '',
  };

  // 读取密钥
  let keyData;
  try {
    keyData = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
    if (!keyData.dbKeyObtained) throw new Error('密钥未获取');
    log(`[OK] 密钥已加载: ${keyData.dbKey.substring(0, 8)}...`);
  } catch (e) {
    result.summary = `FAIL: 密钥文件不可用 — ${e.message}`;
    writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
    log(result.summary);
    app.quit();
    return;
  }

  try {
    // Step 1: 加载 DLL
    log('[1] 加载 DLL 链...');
    const sdl2 = join(DllDir, 'SDL2.dll');
    if (existsSync(sdl2)) koffi.load(sdl2);
    koffi.load(join(DllDir, 'WCDB.dll'));
    const lib = koffi.load(join(DllDir, 'wcdb_api.dll'));
    log('[OK] 3/3 DLL 加载完成');

    // Step 2: InitProtection
    log('[2] InitProtection...');
    const InitProtection = lib.func('int32 InitProtection(const char* resourcePath)');
    let protCode = -1;
    for (const p of [DllDir, dirname(DllDir), join(process.cwd(), 'resources')]) {
      protCode = Number(InitProtection(p));
      log(`  ${p} => ${protCode}`);
      if (protCode === 0) break;
    }
    result.initProtection = protCode;
    log(`[${protCode === 0 ? 'OK' : 'FAIL'}] InitProtection = ${protCode}`);

    // Step 3: wcdb_init
    log('[3] wcdb_init...');
    const wcdbInit = lib.func('int32 wcdb_init()');
    const initRc = Number(wcdbInit());
    result.wcdbInit = initRc;
    log(`[${initRc === 0 ? 'OK' : 'FAIL'}] wcdb_init = ${initRc}`);

    if (initRc !== 0) {
      result.summary = `FAIL: wcdb_init = ${initRc}`;
      writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
      log(result.summary);
      app.quit();
      return;
    }

    // Step 4: 定义 + 调用 wcdb_open_account
    log('[4] wcdb_open_account...');
    const wcdbOpenAccount = lib.func('int32 wcdb_open_account(const char* path, const char* key, _Out_ int64* handle)');
    const wcdbCloseAccount = lib.func('int32 wcdb_close_account(int64 handle)');
    const hexKey = keyData.dbKey;

    for (const acct of ACCOUNTS) {
      const accountDir = join(BASE, acct);
      const dbStorage = join(accountDir, 'db_storage');
      log(`\n  账号: ${acct}`);
      log(`  db_storage: ${dbStorage}`);

      if (!existsSync(dbStorage)) {
        log(`  [SKIP] db_storage 不存在`);
        result.accounts[acct] = { error: 'db_storage 不存在' };
        continue;
      }

      const sessionDb = findSessionDb(dbStorage);
      if (!sessionDb) {
        log(`  [SKIP] 未找到 session.db`);
        result.accounts[acct] = { error: '未找到 session.db' };
        continue;
      }

      log(`  session.db: ${sessionDb}`);
      const handleOut = [0];
      const openRc = Number(wcdbOpenAccount(sessionDb, hexKey, handleOut));
      log(`  wcdb_open_account => ${openRc}, handle=${handleOut[0]}`);

      if (openRc === 0 && handleOut[0] > 0) {
        log(`  [PASS] 数据库连接成功!`);
        result.accounts[acct] = { success: true, handle: handleOut[0], sessionDb };
        // 关闭测试连接
        try { wcdbCloseAccount(handleOut[0]); log('  已关闭连接'); } catch {}
      } else {
        log(`  [FAIL] openAccount = ${openRc}`);
        result.accounts[acct] = { success: false, code: openRc, sessionDb };
      }
    }

  } catch (e) {
    log(`[FATAL] ${e.message}`);
    result.summary = `异常: ${e.message}`;
  }

  const anySuccess = Object.values(result.accounts).some(a => a.success);
  result.summary = anySuccess
    ? 'PASS — Electron 中 WCDB 全链路连接成功'
    : `FAIL — wcdb_init 通过但 openAccount 失败，详见 accounts`;

  writeFileSync(OUTPUT, JSON.stringify(result, null, 2));
  log(`\n=== ${result.summary} ===`);
  log(`结果: ${OUTPUT}`);
  app.quit();
});
