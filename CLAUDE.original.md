# CLAUDE.md — MSG Project

## 项目定位
Windows 微信消息浏览/导出工具。以 WeFlow 为骨架，Electron + TypeScript + React。纯 Windows + 纯中文，不做国际化。
仓库：`github.com/zzmkxd/MSG`（origin，推送链路已验证）。

## 参考项目（只读，不改动）
- `WeFlow_for_archlinux-main/` — **主骨架**：Electron/React/WCDB/解密/导出/配置/主题/SNS/API（代码复用率 ~80%）
- `WeChatMsg-master/` — 补充参考：DOCX/AI_TXT 导出、3 种补充解析器（红包/视频号/企业名片）、Excel 公众号模式（WM 解密全部舍弃，Silk 与 WF 等价）
- `ginger_wechat_portrait/` — 补充参考：仅 stats（词频）已移植；visualizer/personality/report **不移植**（2026-10-09 决策，见「关键决策」）

## 规划文档
- `.claude/plan.md` — 四层实施方案（总纲，含第一层功能拆解）
- `.claude/status.md` — 实施进度（阶段 0-7 + 2026-10-09 更新）
- `.claude/comparison-matrix.md` — 跨项目功能对比（第二层，含 §10 可视化/UI 层面）
- `.claude/WeChatMsg_visualization_analysis.md` — WM HTML 导出 UI 参考（未落地，见文内注）
- `.claude/wcdb-troubleshooting.md` — WCDB 连接失败排查指南（含 2026-10-09 `-101` 事件）
- `.claude/wf-audit.md` / `gw-audit.md` / `dependency-audit.md` — 参考项目审计（2026-07-09，存档）
- `.claude/HANDOVER.md` / `NEXT-STEPS.md` — 2026-09-11 可视化验收交接 + 待办（2026-10-09 已更新）
- **必读（本机 gitignored 取证目录 `audit/`，仅本机可见）**：
  - `audit/verify/KNOWN-STATE-2026-10-09.md` — 数据访问层停摆全记录（`-101` / welive 过期 / wx_key 干净）
  - `audit/verify/UPSTREAM-PORT-CANDIDATES.md` — 上游 103 文件分级、28 文件可移植候选

## 当前已知状态（2026-10-09）

**数据访问层停摆 — 根因厂商侧，非本项目 bug：**
- `wcdb_api.dll` 的 `InitProtection()` 对 6 个候选路径（含回旧路径实验）全部返回 `-101` → `wcdbCore.initialize()` false → 连接报兜底码 `-3999` → **所有依赖 DB 的功能 blocked**（聊天浏览/统计/年报/双人报告/足迹/灵感信箱/资源浏览/全部导出）
- `welive.exe` 自报 `this build has expired` → 即使 DB 恢复，导出链路仍失效
- `wx_key.dll` **干净可用**（无自毁逻辑、无 `InitProtection`、无 WinHTTP 回连）
- 厂商侧：hicccc77 于 2026-09-28 撤库重写（当前公共源码 = 5.0.0 剥解密版）、删除发布仓（v6.1.0 不可得）、`api.weflow.top` 已无响应
- 应用仍可启动、主窗口正常（2026-10-09 探针：G12 托盘回退 PASS、类型闸门通过）
- **不建议**回拨系统时间 / 伪造 `api.weflow.top` 响应绕过保护；`DATA_CORRUPTED_BY_PIRACY_PROTECTION` 写入目标未知，勿反复启动试探真实微信库

**2026-10-09 已提交（b0e4dfb）：可视化层接线 G1-G6/G12** — DOCX 导出接线、`activeDays` 假指标修复、消息长度直方图、年报热力图接线、词频服务接线、托盘图标回退。2026-09-16 实测（当时 DB 正常）：`activeDays=557`（修复前假值 400）、直方图 `sum=71,707==totalMessages`、热力图 `.h-cell=168`（严格 7×24）、词频 `scanned=15,437` / `distinct=6,246`。DOCX 端到端导出**未验**（受 welive/DB 停摆阻断，见 KNOWN-STATE §8）。

**历史（2026-07-30）：阶段 0-7 完成。** Dev 与打包均曾正常运行。打包 `-1006` 根因：WCDB SDK 校验宿主 EXE 名，仅允许 `electron.exe` → `package.json` `executableName: "electron"`。已修复阻塞：`wcdb_init()=-1006`（tsx/Node 22 不兼容，需 Electron/Node 24）；React 19.2.3≠19.2.7 界面空白 → 对齐 19.2.7。

## 关键决策
- 技术栈：Electron + TypeScript + React，照搬 WeFlow 骨架，代码复用 ~80%
- 解密：WeFlow wx_key.dll 注入（已验证 v4.1.x，普通权限无需管理员），WM 解密全部舍弃
- 数据库：WCDB 原生 C++ 桥直连（不落盘）
- GUI：WF React 组件（30+ 路由、40+ 组件、9 个 Zustand store）
- 消息解析：WF 覆盖 17 种 + WM 补充 3 种（红包/视频号/企业名片）
- 导出：WF 格式化器 + WM DOCX TS 移植（2026-10-09 已接线，E2E 未验）
- 分析：WF analytics/insight + **GW stats（词频）TS 移植**（2026-10-09 已接线）；**GW visualizer/personality 明确不做**（2026-10-09 决策；visualizer 与 WF ECharts 重叠，personality 产出 Big5/MBTI 但本项目不做人格/MBTI）
- **不做 AI/LLM**（2026-10-09 决策）；**不做人格/MBTI → G7 大五雷达图已取消**
- **G5 死资源 `src/assets/gw/*` 已解锁**：可删除或归档（其 Big5/MBTI 段无未来用途）
- **上游对比结论（2026-10-09）**：28 文件可移植候选 / 40.6% 排除（必读 `audit/verify/UPSTREAM-PORT-CANDIDATES.md`）；**`wxid`→`accountId` 改名不可照抄**（MSG 读真实微信数据）；上游 ABI 改名（`wcdb_set_my_account_id` 等 4 符号）与本机 DLL 不匹配
- SNS/锁屏/主题/HTTP API：WF 直接复用（v1）
- 国际化：不做，纯中文版
- 平台：纯 Windows，删 6 文件 + 重构 5 处剥离 macOS/Linux
- 旧 `app/` 目录全部舍弃
- Silk：pysilk + ffmpeg 子进程（WF/WM 方案等价）

## 已知限制
- 部分图片 "解密失败"：wx_key.dll 密钥注入不覆盖所有加密参数变体（非 bug，属 SDK 限制）
- 资源浏览图片重复 3 份：WCDB 原生跨分片返回（前端已部分去重）
- 2026-10-09 起：第三方原生组件失效（见「当前已知状态」），DB 依赖功能全部 blocked

## 实施前置工作（历史清单）

### 阶段 0：环境确认 ✅
- [x] Node.js ≥22（Electron 43 内置）、npm 最新版
- [x] Windows Build Tools（VS 2022 + C++ 桌面开发，原生模块编译）
- [x] 三个参考项目目录存在且可读

### 阶段 1：工程骨架搭建 ✅
- [x] 从 WF 复制 package.json，应用依赖审计修正
- [x] `npm install`，验证 5/5 关键原生/WASM 模块加载（Layer 2）
- [x] 配置 electron-builder asarUnpack
- [x] 从 WF 复制 `electron/`、`src/`、`scripts/`、`resources/` 到项目

### 阶段 2：平台剥离 ✅
- [x] 删除 6 个 macOS/Linux 专属文件（keyServiceMac/Linux、systemNotificationBridge、installer 等）
- [x] 重构 5 处平台分支代码（KeyService → 直连、notificationWindow、transcribeWorker、voiceTranscribeService、WelcomePage、SettingsPage）

### 阶段 3：关键路径验证 ✅
- [x] koffi 加载 WCDB DLLs — 当时 InitProtection=0, 6/6 符号解析通过（Layer 3）〔2026-10-09 起返回 -101，见上〕
- [x] wx_key.dll 加载 + 6/6 符号解析通过，注入 WeChat v4.1.x **无需管理员权限**（Layer 4）
- [x] ffmpeg-static 加载运行正常（Layer 2）
- [x] silk-wasm 加载正常（Layer 2），Silk→MP3 子进程等待 WCDB 连接就绪后实测〔仍待 DB 恢复〕

### 阶段 4：技术债最低修复 ✅
- [x] vite externals 清理 — 移除 6 个无效 external（better-sqlite3/fsevents/whisper-node/shelljs/node-llama-cpp/@vscode/sudo-prompt）
- [x] 空 catch 审计 — 48 个全部判定为容错类（清理/探测/回退），无需修改
- [x] installer.nsh VC++ 兜底 — 已有完整检测→下载→安装逻辑(22-65行)，无需额外处理

### 阶段 5：E2E 冒烟测试 ✅
- [x] 密钥注入提取 — wx_key.dll 普通权限注入，DB + 图片密钥获取一致
- [x] WCDB 数据库连接 — Electron (Node 24.x) 中全链路通过；tsx (Node 22.x) 返回 -1006
- [x] 界面空白修复 — React 版本不匹配（19.2.3 ≠ 19.2.7）→ 对齐 19.2.7
- [x] 引导流程 — 协议 → 账号配置 → 密钥 → DB → 主界面全链路通过
