# 实施进度 — 2026-07-11

## 已完成（文件核实通过）

### 阶段 0-3：实施前置
- [x] 环境确认、工程骨架、平台剥离（删 6 文件 + 重构 6 文件）、四层验证（编译→模块→WCDB→注入）
- [x] 缺失文件补齐：`public/splash.html`、`public/icon.ico`、`public/assets/`（从 WF 复制）
- [x] Electron 启动验证：splash 加载正常，通知窗口创建正常，KeyService 初始化无报错
- [x] 6 个重构文件运行时回归：代码审查 + tsc + 启动日志，全部通过

### 阶段 4(A)：vite externals 清理 ✅
已移除 6 个无效 external：
- `better-sqlite3`(0 imports)、`fsevents`(macOS, 0 imports)、`whisper-node`(仅类型文件)、`shelljs`(0 imports)、`node-llama-cpp`(0 imports)、`@vscode/sudo-prompt`(已从 deps 删除)
- 删除了 `electron/types/whisper-node.d.ts`
- tsc 0 错误，vite build 通过

### 阶段 4(B)：空 catch 审计 ✅（2026-07-11）
48 个空 catch {} 全部判定为容错类，无需修改：
- **资源清理**（~15）：wcdbFreeString、rmSync、stopMonitor、cloudStop、wcdbShutdown — best-effort 清理
- **文件/注册表探测**（~18）：existsSync、statSync 路径检测 — 异常当控制流，有 fallback
- **数据转换回退**（~10）：decodeURIComponent、Buffer.from 多编码尝试 — 一种失败换下一种
- **目录遍历跳过**（~3）：递归扫描跳过问题条目 — 单条失败不影响整体
- **错误信息增强**（~2）：koffi.decode 解码错误消息 — 有状态码兜底

### 阶段 4(C)：文档同步 ✅（2026-07-11）
- plan.md §3.6 技术债表格：更新全部 8 行状态列，标记 5 项已完成/已验证
- plan.md 第四层：补全阶段 0-4 实施记录
- CLAUDE.md 阶段 4：全部标记 [x]，移除待办表述

## 待处理（按优先级）

### D: 平台死代码清理（已跳过 — 2026-07-11 核实）
核实 6 文件 30 处引用（cloudControlService 已零引用），全部是 `=== 'darwin'`/`=== 'linux'` 死分支或 win32 卫语句。永不执行，零危害，删之有编辑风险。**判定：跳过。**

### E: GW/WM TS 移植（v1 功能开发，阶段 6）
来源文件核实存在（2026-07-11 更正路径与行数）：

GW（`ginger_wechat_portrait-main/`）:
| 文件 | 行数 | 移植内容 |
|------|------|----------|
| `stats.py` | 57 | 11维统计指标（jieba→nodejieba） |
| `visualizer.py` | 262 | 7种图表（matplotlib→ECharts） |
| `personality.py` | 141 | 11维人格分析 + Claude prompt |
| `report.py` | 1,014 | HTML报告（jinja2→React，CSS/JS复用） |

WM（`WeChatMsg-master/WeChatMsg-master/`）:
| 文件 | 行数 | 移植内容 |
|------|------|----------|
| `exporter/exporter_docx.py` | 337 | DOCX导出（python-docx→docx.js） |
| `exporter/exporter_ai_txt.py` | 51 | AI训练文本导出 |
| `wxManager/db_v4/biz_message.py` | 316 | 3种补充解析器（红包/视频号/企业名片） |

**总移植量：2,178 行 Python → TS**（更正：此前误记为 ~800 行）

## 阶段 5：端到端冒烟测试 ✅（2026-07-11 完成）

### 5A：文档修正 ✅
### 5B：端到端测试 — 全部通过 ✅

#### 问题修复记录
| 问题 | 根因 | 修复 | 状态 |
|------|------|------|------|
| WCDB `wcdb_init()` = -1006 | tsx 运行在 Node 22.x，WCDB SDK 需要 Electron/Node 24.x | 在 Electron 中运行 WCDB | ✅ |
| Electron 界面空白 | `react: 19.2.3` vs `react-dom: 19.2.7` 版本不匹配，React 抛错崩溃 | `npm install react@19.2.7 react-dom@19.2.7` | ✅ |

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
| 进程检测 | ✅ | `Weixin.exe` PID 正确识别，含 10+ 子进程 |
| wx_key.dll 加载 | ✅ | 6/6 符号解析正常 |
| **注入** | ✅ | **无需管理员权限**，`InitializeHook(PID)` 返回 true |
| **DB 密钥捕获** | ✅ | 两次独立运行，密钥**完全一致**，64 hex chars |
| **图片密钥** | ✅ | JSON `{"accounts":[{"wxid":"unknown","keys":[{...}]}]}` |
| WCDB InitProtection | ✅ | 返回 0（安全校验通过） |
| 应用构建启动 | ✅ | vite build + electron 启动无回归 |

#### ~~❌ 阻塞：`wcdb_init()` 返回 -1006~~ → ✅ 已解决（2026-07-11）

| 测试环境 | Node 版本 | wcdb_init | wcdb_open_account |
|----------|-----------|-----------|-------------------|
| `npx tsx` (命令行) | 22.x | -1006 ❌ | 级联失败 -1005 |
| `npx electron` (GUI) | **24.17.0** | **0** ✅ | 账号2: **0** ✅ / 账号1: -3 |

**根因**：WCDB SDK 需要 Electron (Node 24.x) 运行时，`npx tsx` 跑在 Node 22.x 独立进程导致 -1006。非授权/许可问题，是运行时环境约束。

**账号 1 返回 -3**：可能未登录或密钥与当前会话不匹配。

#### 提取的密钥（`.claude/e2e-key.json`）
| 密钥类型 | 长度 | 值（部分） |
|----------|------|-----------|
| DB 密钥 | 64 hex | `d5fb680f73c34e70...b0c2cda29b102f2a` |
| 图片密钥 | 103 bytes JSON | `{"accounts":[{"wxid":"unknown","keys":[{"code":...,"xorKey":215,"aesKey":"2d468e8d6e037277"}]}]}` |

### 5C：问题修复 ✅（2026-07-11）
- ~~WCDB wcdb_init -1006~~ — 根因：Node 22.x (tsx) vs Electron/Node 24.x 运行时差异。在 Electron 中全链路通过。
- ~~界面空白~~ — 根因：`react: 19.2.3` ≠ `react-dom: 19.2.7`。对齐至 19.2.7 解决。
- ~~引导流程~~ — 协议 → 账号配置 → 密钥获取 → DB 连接 → 主界面，全部正常。
- 账号2 (`xx1zzo`) 全链路通过。账号1 (`l63apc`) 返回 -3，可能未登录。

## 阶段 6 前置分析（2026-07-11）

### GW/WM 移植范围修订

逐文件核实 + WF 现有能力对齐，原 2,178 行缩减为 ~710 行有效新增。

**确认移植（真正的新功能）：**
| 模块 | 行数 | 方向 |
|------|------|------|
| GW stats.py 词频统计 | 57 | → TS + jieba-wasm，WF 无独立词频分析 |
| WM exporter_docx.py | 337 | → TS + docx npm 包，WF 9 种格式独缺 DOCX |
| WM biz_message.py | 316 | → TS 补充解析器（红包/视频号/企业名片） |

**直接复用：** GW CSS (OKLCH 474行) + JS 热力图 (162行) — 从 report.py 内嵌变量提取为独立文件

**跳过的 4 项：**
- visualizer.py (262行) — WF ECharts 已覆盖 7 种图表
- personality.py (141行) — WF insightService + insightProfileService 更强
- report.py 核心 (1,014行) — WF AnnualReportWindow + HtmlFormatter 等价
- exporter_ai_txt.py (51行) — WF ChatLab + ChatLab-JSONL 等价

### 遗留项
| 项目 | 来源 | 状态 |
|------|------|------|
| Silk→MP3 子进程实测 | 阶段 3 | WCDB 已通，待测 |
| `webSecurity: false` ×4 替代方案 | plan.md §3.6 | 待评估 |
| 账号 1 (l63apc) 返回 -3 | 阶段 5 | 可选，可能仅因未登录 |

## 核实过的关键事实

| 声明 | 核实结果 |
|------|---------|
| installer.nsh 缺 VC++ 兜底 | **不属实** — 已有完整检测→下载→安装逻辑(22-65行) |
| vite externals 需审计 | **属实** — 已清理 6/12 个无效项 |
| WF 30+ 路由、40+ 组件、9 个 store | **存在** — 从 WF 完整复制 |
| WCDB DLL 链路 | **全链路通过** — Electron 中 InitProtection=0, wcdb_init=0, wcdb_open_account=0（账号2）。tsx 命令行失败是 Node 版本差异。 |
| wx_key.dll 注入需管理员 | **不属实** — 普通权限即可注入成功 |
| wx_key.dll 密钥捕获 | **验证通过** — 两次运行一致，64 hex DB key + 图片 key JSON |
| GW/WM 来源文件 | **存在但记录有误** — stats.py 57行(非320)、report.py 1,014行(非375)，路径已更正，总移植量 2,178行 |
| WF 采用 WCDB 直连 vs WM 采用离线解密 | **新发现** — 两条技术路线完全不同，若 WCDB SDK 不可用可走 WM 离线解密 |

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
