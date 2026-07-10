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

### D: 平台死代码清理（可选，低优先级）
~10 文件有 macOS/Linux 死分支（main.ts 10+、wcdbCore.ts 10+、keyService.ts 1 处、cloudControlService.ts、dbPathService.ts、nativeImageDecrypt.ts、weliveBridge.ts）。均无害，永不执行。

### E: GW/WM TS 移植（v1 功能开发，远期）
来源文件核实存在：
- GW: `stats.py`(~320行)、`visualizer.py`、`personality.py`(142行)、`report.py`(375行)
- WM: `exporter_docx.py`、`exporter_ai_txt.py`、`biz_message.py`、`msg.py`(红包/视频号)

## 核实过的关键事实

| 声明 | 核实结果 |
|------|---------|
| installer.nsh 缺 VC++ 兜底 | **不属实** — 已有完整检测→下载→安装逻辑(22-65行) |
| vite externals 需审计 | **属实** — 已清理 6/12 个无效项 |
| WF 30+ 路由、40+ 组件、9 个 store | **存在** — 从 WF 完整复制 |
| WCDB DLL 链路 | **验证通过** — koffi→WCDB.dll→wcdb_api.dll, InitProtection=0, 6/6 符号 |
| wx_key.dll 符号 | **验证通过** — 6/6 符号解析正常，注入需 WeChat 运行 |
| GW/WM 来源文件 | **存在** — 见上方 E 项 |

## 验证脚本
- `scripts/verify-native-modules.cjs` — Layer 2: 5/5 原生模块
- `scripts/verify-wcdb-link.cjs` — Layer 3: WCDB 链路
- `scripts/verify-wechat-inject.cjs` — Layer 4: WeChat 注入
