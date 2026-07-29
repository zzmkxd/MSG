// ⚠️ 已弃用 — 此脚本使用 npx tsx (Node 22.x)，WCDB SDK 需要 Electron/Node 24.x 运行时。
//    tsx 环境下 wcdb_init() 会返回 -1006。请改用 scripts/e2e-wcdb-electron.cjs（Electron 环境）。
//    保留此文件仅作为 CJS 参考实现。
//
// E2E 步骤 3：通过 WcdbCore 测试数据库连接（已弃用，勿直接运行）
import { WcdbCore } from '../electron/services/wcdbCore'
import { join } from 'path'
import { readFileSync } from 'fs'

const KEY_FILE = join(__dirname, '..', '.claude', 'e2e-key.json')
const RESOURCES = join(__dirname, '..', 'resources')
const USER_DATA = join(__dirname, '..', 'data')

const keyData = JSON.parse(readFileSync(KEY_FILE, 'utf8'))
if (!keyData.dbKeyObtained) {
  console.error('[FAIL] 密钥文件不存在或未获取到密钥')
  process.exit(1)
}

const hexKey: string = keyData.dbKey
const BASE = 'E:/Tool_zone/Tencent/WeChat/xwechat_files'
const ACCOUNTS = ['wxid_l63apcsdl9nl22_eda4', 'wxid_xx1zzo5hut8e22_8c04']

async function main() {
  const wcdb = new WcdbCore()
  wcdb.setLogEnabled(true)
  wcdb.setPaths(RESOURCES, USER_DATA)

  console.log('[1] 初始化 WcdbCore...')
  const initOk = await wcdb.initialize()
  console.log('    initialize() =>', initOk)
  if (!initOk) {
    console.error('[FAIL] WcdbCore 初始化失败')
    process.exit(1)
  }

  for (const acct of ACCOUNTS) {
    const accountDir = join(BASE, acct)
    console.log(`\n[2] 测试连接: ${acct}`)
    console.log('    accountDir:', accountDir)

    const result = await wcdb.testConnection(accountDir, hexKey)
    console.log('    result:', JSON.stringify(result, null, 2))

    if (result.success) {
      console.log(`\n[PASS] 账号 ${acct} 连接成功!`)
      process.exit(0)
    }
  }

  console.log('\n[FAIL] 所有账号连接失败')
  process.exit(1)
}

main().catch(e => {
  console.error('异常:', e)
  process.exit(1)
})
