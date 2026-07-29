# CLAUDE.md — MSG Project

## 项目定位
Windows 微信消息浏览/导出工具。以 WeFlow 为骨架，Electron + TypeScript + React。纯 Windows + 纯中文，不做国际化。

## 参考项目（只读，不改动）
- `WeFlow_for_archlinux-main/` — **主骨架**：Electron/React/WCDB/解密/导出/配置/主题/SNS/API（代码复用率 ~80%）
- `WeChatMsg-master/` — 补充参考：DOCX/AI_TXT 导出、3 种补充解析器（红包/视频号/企业名片）、Excel 公众号模式（WM 解密全部舍弃，Silk 与 WF 等价）
- `ginger_wechat_portrait/` — 补充参考：stats/visualizer/personality（需 TS 移植）

## 规划文档
- `.claude/plan.md` — 四层实施方案（总纲，含第一层功能拆解）
- `.claude/comparison-matrix.md` — 跨项目功能对比（第二层，含 §10 可视化/UI 层面）
- `.claude/WeChatMsg_visualization_analysis.md` — WM HTML 导出 UI 参考（精简版，实现时读源文件）
- `.claude/wcdb-troubleshooting.md` — WCDB 连接失败排查指南
- `.claude/wf-audit.md` — WeFlow 源码四维审计报告（2026-07-09）
- `.claude/gw-audit.md` — Ginger WeChat Portrait 逐文件量化审计（2026-07-09）
- `.claude/dependency-audit.md` — 依赖许可证/Windows 兼容/原生模块审计（2026-07-09）

## 当前状态
**阶段 0-6 全部完成。** 应用正常运行：引导 → 密钥 → DB → 会话列表 → 消息浏览全链路通过。GW/WM 补充功能 TS 移植完成（词频服务 + DOCX 导出 + CSS/JS 静态资源）。2026-07-29。

**已修复的阻塞**：
- WCDB `wcdb_init() = -1006`：需要 Electron (Node 24.x) 运行时，tsx (Node 22.x) 不兼容
- 界面空白：`react: 19.2.3` ≠ `react-dom: 19.2.7` 版本不匹配 → 对齐 19.2.7

## 关键决策
- 技术栈：Electron + TypeScript + React，照搬 WeFlow 骨架，代码复用 ~80%
- 解密：WeFlow wx_key.dll 注入（已验证 v4.1.x），WM 解密全部舍弃
- 数据库：WCDB 原生 C++ 桥直连（80+ 操作，不落盘）
- GUI：WF React 组件（30+ 路由、40+ 组件、9 个 Zustand store）
- 消息解析：WF 覆盖 17 种 + WM 补充 3 种（红包/视频号/企业名片）
- 导出：WF 7 种格式化器 + WM DOCX/AI_TXT TS 移植
- 分析：WF analytics/insight + GW stats/visualizer/personality TS 移植（~1,500 行业务逻辑新增）
- SNS/锁屏/主题/HTTP API：WF 直接复用（v1）
- 国际化：不做，纯中文版
- 平台：纯 Windows，删 6 文件 + 重构 5 处剥离 macOS/Linux
- 旧 `app/` 目录全部舍弃
- Silk：pysilk + ffmpeg 子进程（WF/WM 方案等价）

## 实施前置工作

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
- [x] koffi 加载 WCDB DLLs — InitProtection=0, 6/6 符号解析通过（Layer 3）
- [x] wx_key.dll 加载 + 6/6 符号解析通过，注入 WeChat v4.1.x **无需管理员权限**（Layer 4）
- [x] ffmpeg-static 加载运行正常（Layer 2）
- [x] silk-wasm 加载正常（Layer 2），Silk→MP3 子进程等待 WCDB 连接就绪后实测

### 阶段 4：技术债最低修复 ✅
- [x] vite externals 清理 — 移除 6 个无效 external（better-sqlite3/fsevents/whisper-node/shelljs/node-llama-cpp/@vscode/sudo-prompt）
- [x] 空 catch 审计 — 48 个全部判定为容错类（清理/探测/回退），无需修改
- [x] installer.nsh VC++ 兜底 — 已有完整检测→下载→安装逻辑(22-65行)，无需额外处理

### 阶段 5：E2E 冒烟测试 ✅
- [x] 密钥注入提取 — wx_key.dll 普通权限注入，DB + 图片密钥获取一致
- [x] WCDB 数据库连接 — Electron (Node 24.x) 中全链路通过；tsx (Node 22.x) 返回 -1006
- [x] 界面空白修复 — React 版本不匹配（19.2.3 ≠ 19.2.7）→ 对齐 19.2.7
- [x] 引导流程 — 协议 → 账号配置 → 密钥 → DB → 主界面全链路通过
