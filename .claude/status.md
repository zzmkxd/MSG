# 实施进度 — 2026-07-11

## 2026-10-09 更新（当前状态）

### 数据访问层停摆（根因厂商侧，非本项目 bug）
- `wcdb_api.dll` `InitProtection()` 6 个候选路径全部 `-101`（含回旧路径 `E:\Learn_zone\Code_zone\VSC\msg` 实验仍 -101）→ DB 功能全部 blocked；`welive.exe` 报 `this build has expired`；`wx_key.dll` 干净可用。
- 必读：`audit/verify/KNOWN-STATE-2026-10-09.md`（本机 gitignored 取证目录）。

### 2026-10-09 已提交（b0e4dfb）：可视化层接线 G1-G6/G12
- DOCX 导出接线（`ExportOrchestrator.ts:37` import、format union 加 `'docx'`）；`activeDays` 改真实天数；消息长度直方图（IPC `analytics:getMessageLengthHistogram`）；年报热力图渲染（`AnnualReportWindow.tsx:645`）；词频接线（IPC `analytics:getWordFrequency` + AnalyticsPage 调用）；托盘图标回退。
- 2026-09-16 实测（当时 DB 正常）：`activeDays=557`（修复前假值 400）；直方图 `sum=71,707==totalMessages`；热力图 `.h-cell=168`；词频 `scanned=15,437` / `distinct=6,246`。
- DOCX 端到端导出**未验**（受 welive/DB 停摆阻断，见 KNOWN-STATE §8）。

### 2026-10-09 决策
- 不做 AI/LLM；不做人格/MBTI → **G7 大五雷达图取消**。
- **G5 死资源 `src/assets/gw/*` 已解锁**：可删除或归档（Big5/MBTI 段无未来用途）。
- 上游对比结论：103 文件分级 / 28 文件可移植候选 / 40.6% 排除；`wxid`→`accountId` 改名不可照抄。必读 `audit/verify/UPSTREAM-PORT-CANDIDATES.md`。

## 已完成（文件核实通过）

### 阶段 0-3：实施前置
- [x] 环境确认、工程骨架、平台剥离（删 6 文件 + 重构 6 文件）、四层验证（编译→模块→WCDB→注入）
- [x] 缺失文件补齐：`public/splash.html`、`public/icon.ico`、`public/assets/`（从 WF 复制）
- [x] Electron 启动验证：splash 正常，通知窗口正常，KeyService 初始化无报错
- [x] 6 个重构文件运行时回归：代码审查 + tsc + 启动日志，全过

### 阶段 4(A)：vite externals 清理 ✅
已移除 6 个无效 external：
- `better-sqlite3`(0 imports)、`fsevents`(macOS, 0 imports)、`whisper-node`(仅类型文件)、`shelljs`(0 imports)、`node-llama-cpp`(0 imports)、`@vscode/sudo-prompt`(已从 deps 删除)
- 删了 `electron/types/whisper-node.d.ts`
- tsc 0 错误，vite build 通过

### 阶段 4(B)：空 catch 审计 ✅（2026-07-11）
48 个空 catch {} 全为容错类，无需改：
- **资源清理**（~15）：wcdbFreeString、rmSync、stopMonitor、cloudStop、wcdbShutdown — best-effort
- **文件/注册表探测**（~18）：existsSync、statSync — 异常当控制流，有 fallback
- **数据转换回退**（~10）：decodeURIComponent、Buffer.from 多编码尝试
- **目录遍历跳过**（~3）：递归扫描跳过问题条目
- **错误信息增强**（~2）：koffi.decode — 有状态码兜底

### 阶段 4(C)：文档同步 ✅（2026-07-11）
- plan.md §3.6 技术债表格：更新全部 8 行状态列，5 项已完成/已验证
- plan.md 第四层：补全阶段 0-4 实施记录
- CLAUDE.md 阶段 4：全部 [x]

## 待处理（按优先级）

### D: 平台死代码清理（已跳过 — 2026-07-11 核实）
6 文件 30 处引用（cloudControlService 已零引用），全是 `=== 'darwin'`/`=== 'linux'` 死分支或 win32 卫语句。永不执行，零危害，删有编辑风险。**判定：跳过。**

### E: GW/WM TS 移植（v1 功能开发，阶段 6）
来源文件核实存在（2026-07-11 更正路径与行数）：

GW（`ginger_wechat_portrait-main/`）:
| 文件 | 行数 | 移植内容 |
|------|------|----------|
| `stats.py` | 57 | 11维统计指标（jieba→nodejieba） |
| `visualizer.py` | 262 | 7种图表（matplotlib→ECharts）〔不移植〕 |
| `personality.py` | 141 | 11维人格分析 + Claude prompt〔不移植〕 |
| `report.py` | 1,014 | HTML报告（jinja2→React，CSS/JS复用）〔不移植〕 |

WM（`WeChatMsg-master/WeChatMsg-master/`）:
| 文件 | 行数 | 移植内容 |
|------|------|----------|
| `exporter/exporter_docx.py` | 337 | DOCX导出（python-docx→docx.js） |
| `exporter/exporter_ai_txt.py` | 51 | AI训练文本导出 |
| `wxManager/db_v4/biz_message.py` | 316 | 3种补充解析器（红包/视频号/企业名片） |

**总移植量：2,178 行 Python → TS**（更正：此前误记 ~800 行）

## 阶段 5：端到端冒烟测试 ✅（2026-07-11 完成）

### 5A：文档修正 ✅
### 5B：端到端测试 — 全部通过 ✅

#### 问题修复记录
| 问题 | 根因 | 修复 | 状态 |
|------|------|------|------|
| WCDB `wcdb_init()` = -1006 | tsx 运行在 Node 22.x，WCDB SDK 需要 Electron/Node 24.x | 在 Electron 中运行 WCDB | ✅ |
| Electron 界面空白 | `react: 19.2.3` vs `react-dom: 19.2.7` 不匹配，React 抛错 | `npm install react@19.2.7 react-dom@19.2.7` | ✅ |

#### 环境信息
| 项目 | 值 |
|------|-----|
| 微信版本 | v4.1.8.107 |
| 安装路径 | `E:\Tool_zone\Tencent\Weixin\Weixin.exe` |
| 数据目录 | `E:\Tool_zone\Tencent\WeChat\xwechat_files\` |
| 账号 1 | `wxid_l63apcsdl9nl22_eda4` |
| 账号 2 | `wxid_xx1zzo5hut8e22_8c04` |
| 管理员权限 | 不需要（注入在普通权限下成功） |

#### 已验证通过
| 步骤 | 结果 | 细节 |
|------|------|------|
| 进程检测 | ✅ | `Weixin.exe` PID 正确，含 10+ 子进程 |
| wx_key.dll 加载 | ✅ | 6/6 符号解析正常 |
| **注入** | ✅ | **无需管理员**，`InitializeHook(PID)` 返回 true |
| **DB 密钥捕获** | ✅ | 两次独立运行，密钥**完全一致**，64 hex chars |
| **图片密钥** | ✅ | JSON `{"accounts":[{"wxid":"unknown","keys":[{...}]}]}` |
| WCDB InitProtection | ✅ | 返回 0（当时；2026-10-09 起 -101，见文首） |
| 应用构建启动 | ✅ | vite build + electron 启动无回归 |

#### ~~❌ 阻塞：`wcdb_init()` 返回 -1006~~ → ✅ 已解决（2026-07-11）

| 测试环境 | Node 版本 | wcdb_init | wcdb_open_account |
|----------|-----------|-----------|-------------------|
| `npx tsx` (命令行) | 22.x | -1006 ❌ | 级联失败 -1005 |
| `npx electron` (GUI) | **24.17.0** | **0** ✅ | 账号2: **0** ✅ / 账号1: -3 |

**根因**：WCDB SDK 需要 Electron (Node 24.x) 运行时，`npx tsx` 跑在 Node 22.x 独立进程致 -1006。非授权/许可问题，是运行时环境约束。

**账号 1 返回 -3**：可能未登录或密钥与当前会话不匹配。

#### 提取的密钥（`.claude/e2e-key.json`）
| 密钥类型 | 长度 | 值（部分） |
|----------|------|-----------|
| DB 密钥 | 64 hex | `d5fb680f73c34e70...b0c2cda29b102f2a` |
| 图片密钥 | 103 bytes JSON | `{"accounts":[{"wxid":"unknown","keys":[{"code":...,"xorKey":215,"aesKey":"2d468e8d6e037277"}]}]}` |

### 5C：问题修复 ✅（2026-07-11）
- ~~WCDB wcdb_init -1006~~ — 根因：Node 22.x (tsx) vs Electron/Node 24.x 运行时差异。Electron 中全链路通过。
- ~~界面空白~~ — 根因：`react: 19.2.3` ≠ `react-dom: 19.2.7`。对齐 19.2.7 解决。
- ~~引导流程~~ — 协议 → 账号配置 → 密钥获取 → DB 连接 → 主界面，全正常。
- 账号2 (`xx1zzo`) 全链路通过。账号1 (`l63apc`) 返回 -3，可能未登录。

## 阶段 6：GW/WM 补充功能 TS 移植 ✅（2026-07-29 完成）

二次逐文件核实，原 7 项缩减为 2 项移植 + 1 项资源复用。全部完成。

| 任务 | 来源 | 输出 | 行数 | 状态 |
|------|------|------|------|------|
| 6D-assets | GW report.py 内嵌 | `src/assets/gw/report.css`(462) + `heatmap.js`(168) | 630 | ✅ 已提取，零代码引用 → 2026-10-09 解锁：可删除/归档 |
| 6A | GW stats.py | `electron/services/wordFrequencyService.ts` | 253 | ✅ 已接线（2026-10-09，IPC/preload/AnalyticsPage） |
| 6E | WM exporter_docx.py | `electron/services/export/formatters/DocxFormatter.ts` | 322 | ✅ 已接线（2026-10-09；E2E 未验，受停摆阻断） |
| ~~6G~~ | WM biz_message.py | 删除 — SQLite 查询封装，WF chatService 已覆盖 | — | ❌ |

新增依赖：`docx` v9.7.1。

## 阶段 6 前置分析（2026-07-11，2026-07-29 更新）

### GW/WM 移植范围修订

逐文件核实 + WF 现有能力对齐，原 2,178 行缩减为 ~710 行有效新增。

**确认移植（真正的新功能）：**
| 模块 | 行数 | 方向 |
|------|------|------|
| GW stats.py 词频统计 | 57 | → TS + jieba-wasm，WF analyticsService 无分词/词云 |
| WM exporter_docx.py | 337 | → TS + docx npm 包，WF 8 种格式独缺 DOCX |

**直接复用：** GW CSS (OKLCH 474行) + JS 热力图 (162行) — 从 report.py 内嵌变量提取为独立文件

**跳过的 5 项：**
- visualizer.py (262行) — WF ECharts 已覆盖同类图表（「7 种」口径存疑，见 HANDOVER §7.3）
- personality.py (141行) — **2026-10-09 决策不做人格/MBTI（G7 取消）**。原「insightService 更强」判断形态错位：insightService 是 LLM 自由文本，无 Big5/MBTI 结构化输出（HANDOVER §3.6），但方向一致：不移植
- report.py 核心 (1,014行) — WF AnnualReportWindow + HtmlFormatter 等价
- exporter_ai_txt.py (51行) — WF ChatLab + ChatLab-JSONL 等价
- biz_message.py (316行) — **SQLite 查询封装，非解析器**。红包/视频号/名片检测已存在 chatService.ts:4795-4806/91-95/108-111。SQL→WCDB 不可翻译。2026-07-29 二次核实后删除。

### 遗留项
| 项目 | 来源 | 状态 |
|------|------|------|
| Silk→MP3 子进程实测 | 阶段 3 | WCDB 2026-10-09 起停摆，仍待 DB 恢复后测 |
| `webSecurity: false` ×4 替代方案 | plan.md §3.6 | 待评估 |
| 账号 1 (l63apc) 返回 -3 | 阶段 5 | 可选，可能仅因未登录 |

## 阶段 7：打包修复 + 运行时 bug（2026-07-29）

### 7A：打包后 WCDB 启动失败

| 阶段 | 错误码 | 根因 | 修复 | 状态 |
|------|--------|------|------|------|
| 第一版打包 | -1006 | Worker 文件打进 `app.asar`，Node.js `new Worker()` 无法从 ASAR 加载 | 创建 `electron/utils/resolveWorkerPath.ts`，8 处 `new Worker()` 统一用 ASAR→unpacked 路径映射；`package.json` `asarUnpack` 新增 `dist-electron/*Worker.js` | ✅ |
| 第二版打包 | -1006 | WCDB SDK 许可校验检查宿主 EXE 名，仅允许 `electron.exe` | `executableName: "electron"` | ✅ |

**影响文件：**
- `electron/utils/resolveWorkerPath.ts` — 新建，ASAR→unpacked 路径映射
- `electron/services/wcdbService.ts` — `join(__dirname,...)` → `resolveWorkerPath()`
- `electron/services/apiMessageMapperPool.ts` — 同上
- `electron/services/nativeImageDecrypt.ts` — 同上，去 dead imports
- `electron/main.ts` — 5 处 `join(__dirname,...)` → `resolveWorkerPath()`
- `package.json` — `asarUnpack` 新增 `dist-electron/*Worker.js`

### 7B：ResourcesPage setState-in-render 栈溢出 ✅

**根因**：`ResourcesPage.tsx:2227` — `toggleSelect` 在 `setSelectedKeys` 函数式 updater **内部**调用 `updateMediaCardState` → `notify()` → `useSyncExternalStore` listener。React 检测到跨组件 render 阶段 setState → 级联重渲染 → `RangeError: Maximum call stack size exceeded`。

**修复**：`updateMediaCardState` 移到 `setSelectedKeys` 外面，在事件处理器上下文调用。1 行改动。

### 7C：ResourcesPage 资源浏览数据异常 ✅（2026-07-30 修复）

**根因链**：

| # | 问题 | 根因 | 修复 | 状态 |
|---|------|------|------|------|
| 1 | 点击图片 "未找到本地数据" | `decryptOne` / `batchDecryptImage` 传 `hardlinkOnly: true` → `resolveDatPath:780` 阻断文件系统 DAT 扫描 | `hardlinkOnly: true` → `false` | ✅ |
| 2 | RangeError 栈溢出（隐式） | `nativeImageDecrypt.ts` 局部函数 `resolveWorkerPath()` 遮蔽导入 → 无限递归 | 导入改别名 `resolveWorker`，局部函数改名 `getDecryptWorkerPath` | ✅ |
| 3 | 原生解密 "join is not defined" | 阶段 7A 误删 `import { join } from 'path'` 和 `import { existsSync } from 'fs'` | 恢复两个 import | ✅ |
| 4 | JS 解密 fallback 对 v2 DAT 无 AES key 时跳过 | `tryDecryptDatWithJs`: `datVersion===2` 且 `aesKeyText.length<16` → 两候选分支全跳过 → null | 追加 v2 无 AES key 时 XOR-only 回退 | ✅ |
| 5 | "解密失败"（部分图片） | 注入密钥不覆盖所有加密参数变体 | 预期行为，不可修 | — |
| 6 | 同一联系人图片重复 4 份 → 3 份 | `getSessionRows()` 无 sessionId 去重（1 份）+ 原生 `wcdb_scan_media_stream` 跨 4 分片返回（3 份残留） | sessionId 去重（部分缓解） | ⚠️ |
| 7 | 批量解密按钮不可用 | MediaCard 无可见选中控件 | 加 `floating-check` 复选框 + 全选/取消全选按钮 | ✅ |
| 8 | 无预览缩略图（部分恢复） | 首屏预览仍走 `hardlinkOnly: true`，点击解密后写缓存可命中 | 间接修复 | ✅ |

> 统计数字（资源数量、最后时间）正常。可能是 WeFlow 原有 bug，非本次修改引入。

### 7D：已确认正常运行的功能

- 引导流程（协议 → 账号配置 → 密钥 → DB → 主界面）
- 会话列表 → 消息浏览
- 统计栏目（数字获取正常）
- 联系人列表
- ECharts 图表渲染
- SNS 朋友圈（CDN 过期链接受限是预期行为）

## 核实过的关键事实

| 声明 | 核实结果 |
|------|---------|
| installer.nsh 缺 VC++ 兜底 | **不属实** — 已有完整检测→下载→安装逻辑(22-65行) |
| vite externals 需审计 | **属实** — 已清理 6/12 个无效项 |
| WF 30+ 路由、40+ 组件、9 个 store | **存在** — 从 WF 完整复制 |
| WCDB DLL 链路 | **当时全链路通过** — Electron 中 InitProtection=0, wcdb_init=0, wcdb_open_account=0（账号2）。tsx 命令行失败是 Node 版本差异。**2026-10-09 起 InitProtection 全 -101（厂商侧），见文首** |
| wx_key.dll 注入需管理员 | **不属实** — 普通权限即可 |
| wx_key.dll 密钥捕获 | **验证通过** — 两次运行一致，64 hex DB key + 图片 key JSON |
| GW/WM 来源文件 | **存在但记录有误** — stats.py 57行(非320)、report.py 1,014行(非375)，总移植量 2,178行 |
| WF 采用 WCDB 直连 vs WM 采用离线解密 | **新发现** — 两条技术路线不同，若 WCDB SDK 不可用可走 WM 离线解密 |

## 生成的脚本文件
- `scripts/e2e-extract-key.cjs` — 自动启动微信 + 注入 + 轮询密钥
- `scripts/e2e-wcdb-connect.ts` — ~~通过 WcdbCore 测试数据库连接~~（tsx 环境不可用，已弃用）
- `scripts/e2e-wcdb-electron.cjs` — **Electron 环境中 WCDB 全链路测试**（InitProtection → wcdb_init → wcdb_open_account）
- `.claude/e2e-key.json` — 提取的密钥（已排除版本控制）
- `.claude/e2e-wcdb-electron-result.json` — Electron WCDB 测试结果详情

## 验证脚本
- `scripts/verify-native-modules.cjs` — Layer 2: 5/5 原生模块
- `scripts/verify-wcdb-link.cjs` — Layer 3: WCDB 链路
- `scripts/verify-wechat-inject.cjs` — Layer 4: WeChat 注入

## 2026-10-11 更新：安装包两大故障修复（commit d4cfd79）

用户安装 `MSG-0.1.0-Setup.exe` 后报告：年报/双人报告 `Worker 错误: Cannot find module ...app.asar.unpacked.unpacked\dist-electron\wcdbWorker.js`；资源浏览部分图片 `解密后不是有效图片`。两处均为真实代码 bug，已修复并重打包：

1. **报告 Worker 路径双层 `.unpacked`** — asarUnpack 解包 `dist-electron/*Worker.js` 后，报告 worker（codeSplitting:false 内联了 wcdbService）的 `__dirname` 已含 `app.asar.unpacked`，`resolveWorkerPath` 旧逻辑 `replace('.asar', '.asar.unpacked')` 再替换一次 → 双层路径 → worker 异步 error → 报错。修复：幂等守卫（含 `app.asar.unpacked` 则不再替换）+ 锚定 `dist-electron` 根。
2. **`_t_NW.dat` 明文图片误报** — 取证探针（`scripts/probe-image-decrypt.cjs`，wx_key.dll 注入取 kvcomm code → 派生 xor/aes）均衡抽样 500 DAT：失败 25 个全是 `*_t_NW.dat`，实证其为**明文 JPEG/PNG**（多设备同步文件不加密）；原生 addon 对 version=0 文件盲目全量 XOR → 垃圾输出且非 null → 应用信任原生产物直接报错。修复：原生产物无效时回退 `tryDecryptDatWithJs`（directExt 明文识别 + v3 XOR + v4 AES）。
3. **顺带发现**：Electron 43 safeStorage 密文与写入进程绑定（dev 解不开打包版写入的 `safe:` 值）；换安装目录重装可能导致旧配置密钥不可读，需重新引导。
4. 类型检查 110 错误 = 基线，0 新增；探针 WXGF ffmpeg 解码 30/30 成功；安装包已重建（224,210,367 B @ 2026-10-11 0:32:50），包内 main.js / annualReportWorker.js 已含两处修复（asar 抽检确认）。
5. 遗留：dev 下朋友圈视频无法预览（CDN 链接过期同类问题？），待诊。
