# WeFlow 源码审计报告

> 审计日期：2026-07-09。四维度并行审计：路由/组件、国际化、平台假设、技术债。

---

## 一、总览

| 维度 | 结论 | 风险等级 |
|------|------|----------|
| 路由/组件 | 30+ 路由全部跨平台，但底层有三大块 macOS/Linux 专属代码需剥离 | 中 |
| 国际化 | **覆盖率为 0%** — 无框架、无翻译文件、102+ 文件硬编码中文 | **高** |
| 平台假设 | 6 文件可删、5 处需重构、CI 需精简 | 低 |
| 技术债 | 4 个万行级单体文件、80+ 空 catch、零测试、webSecurity:false ×4 | **高** |

---

## 二、路由与组件

### 2.1 路由全景（30+ 路由）

**HashRouter**，定义在 `src/App.tsx:25-49`，所有页面组件懒加载。

| 路由 | 组件 | 类型 |
|------|------|------|
| `/`, `/home` | HomePage (24行) | 主页 |
| `/chat` | ChatPage (12,656行) | 聊天 |
| `/chat-history/:sessionId/:messageId` | ChatHistoryPage | 聊天历史 |
| `/contacts` | ContactsPage (1,247行) | 联系人 |
| `/sns` | SnsPage (2,820行) | 朋友圈 |
| `/export` | ExportPage + 子模块 (~4,500行) | 导出 |
| `/analytics` | ChatAnalyticsHubPage | 分析中心 |
| `/analytics/private/view` | AnalyticsPage (857行) | 私聊分析 |
| `/analytics/group` | GroupAnalyticsPage (1,853行) | 群分析 |
| `/annual-report`, `/annual-report/view` | AnnualReportPage + Window | 年度报告 |
| `/dual-report`, `/dual-report/view` | DualReportPage + Window | 双人报告 |
| `/footprint` | MyFootprintPage (983行) | AI 足迹 |
| `/insight-inbox` | InsightInboxPage (580行) | 灵感信箱 |
| `/biz` | BizPage (442行) | 公众号 |
| `/resources` | ResourcesPage (2,832行) | 资源浏览 |
| `/backup` | BackupPage (305行) | 备份 |
| `/account-management` | AccountManagementPage (612行) | 账号管理 |
| `/settings` | SettingsPage (5,685行) | 设置（覆盖层） |
| `/onboarding-window` | WelcomePage (1,248行) | 独立窗口 |
| `/agreement-window` | AgreementPage (52行) | 独立窗口 |
| `/video-player-window` | VideoWindow (199行) | 独立窗口 |
| `/image-viewer-window` | ImageWindow (276行) | 独立窗口 |
| `/notification-window` | NotificationWindow (330行) | 独立窗口 |

所有路由均为跨平台 React 组件。

### 2.2 Zustand Stores（9 个，1,347 行）

| Store | 行数 | 领域 | 持久化 |
|-------|------|------|--------|
| chatStore | 206 | 聊天连接、会话、消息 | 否 |
| appStore | 91 | DB 连接、更新、锁屏状态 | 否 |
| themeStore | 96 | 7 套主题、亮/暗/系统模式 | 是 |
| analyticsStore | 93 | 统计缓存 | 是 |
| imageStore | 173 | 图片扫描、解密状态 | 否 |
| exportTaskStore | 91 | 导出任务、进度 | 否 |
| batchImageDecryptStore | 216 | 批量图片解密进度 | 否 |
| batchTranscribeStore | 234 | 批量语音转写进度 | 否 |
| contactTypeCountsStore | 147 | 联系人类型计数 | 否 |

全部跨平台，无平台特定逻辑。

### 2.3 需剥离的 macOS/Linux 专属代码

| 文件 | 行数 | 说明 |
|------|------|------|
| `electron/services/keyServiceMac.ts` | 1,483 | 完整 macOS 密钥服务（mach 内核调用 + xkey_helper） |
| `electron/services/keyServiceLinux.ts` | 477 | 完整 Linux 密钥服务（ptrace + sudo-prompt） |
| `electron/services/systemNotificationService.ts` | ~110 | Linux/macOS 通知中心 |
| `scripts/after-pack.cjs` | ~50 | 纯 macOS dylib 修复脚本 |
| `resources/installer/linux/` | 目录 | Linux 安装器资源 |

---

## 三、国际化 — 覆盖率 0%

### 3.1 现状

- **无 i18n 框架**：package.json 中无 `react-i18next`、`i18next`、`react-intl` 等依赖
- **无翻译文件**：不存在 `src/locales/`、`public/locales/` 目录，无任何 JSON/YAML 语言包
- **无 `t()` 函数**：代码库中不存在 `useTranslation`、`t()` 或等效 API 调用
- **config.ts `language: 'zh-CN'` 字段未被 UI 消费**，仅作为配置占位

### 3.2 硬编码字符串规模

- **102+ 文件**包含硬编码中文字符串（`src/` 下所有 .tsx/.ts）
- 估算 **800-1,500 条**可翻译字符串
- 重灾区：SettingsPage (66+ 处)、ChatPage、Sidebar、WelcomePage、electron/main.ts

### 3.3 决策

**不做国际化**。WF 本身是纯中文应用，硬编码中文字符串 ~800-1,500 条。项目定位为 Windows 纯中文版，不引入 i18n 框架，不创建翻译文件。WF 现有中文 UI 直接沿用。

---

## 四、平台假设

### 4.1 需删除的文件（6 项）

| 文件 | 原因 |
|------|------|
| `electron/services/keyServiceMac.ts` | macOS 专属密钥服务 |
| `electron/services/keyServiceLinux.ts` | Linux 专属密钥服务 |
| `electron/services/systemNotificationService.ts` | Linux/macOS 通知中心 |
| `scripts/after-pack.cjs` | 纯 macOS dylib 修复 |
| `resources/installer/linux/` | Linux 安装器 |
| CI `.github/workflows/release.yml` 中 `release-linux` + `deploy-aur` 作业 | Linux 构建 |

### 4.2 需重构的代码（5 处）

| 位置 | 改动 |
|------|------|
| `electron/main.ts:626-631` | KeyService 三路 `switch(darwin/linux/default)` → 直连 `new KeyService()` |
| `electron/windows/notificationWindow.ts:7-9, 314-483` | 移除 `usesSystemNotifications` + Linux/macOS 系统通知路径 (~170行) |
| `electron/services/wcdbCore.ts:2993,3098,3343` | 验证 `process.platform === 'darwin'` SQL 回退分支在 Windows 上是否执行；确认原生 `wcdbGetContact` 等效后可移除 |
| `electron/transcribeWorker.ts:16-31` | 移除 `DYLD_LIBRARY_PATH` / `LD_LIBRARY_PATH`，只留 `PATH` |
| `electron/services/voiceTranscribeService.ts:63-87` | 同上，简化库路径环境变量设置 |

### 4.3 需清理的 UI 字符串

- `src/pages/WelcomePage.tsx:20-24` — macOS/Linux 路径占位符
- `src/pages/SettingsPage.tsx:82-87` — macOS/Linux 路径占位符 + `dbDirName`
- 两处的 `isMac` / `isLinux` 用户代理解析可移除

### 4.4 WeChat 路径发现（Windows 部分）

`electron/services/dbPathService.ts` 的 Windows 逻辑：
- 默认路径：`~/Documents/xwechat_files`（正确，v4.x）
- 密钥服务通过注册表（`advapi32.dll` via koffi）读取安装路径
- 进程枚举用 `tasklist` + `taskkill`（正确，Windows 原生）
- 窗口检测用 `user32.dll` + `kernel32.dll`（正确，纯 Windows API）

---

## 五、技术债

### 5.1 单体巨型文件（CRITICAL）

| 文件 | 行数 | 问题 |
|------|------|------|
| `electron/services/chatService.ts` | **12,859** | 混合 DB 查询 + 会话管理 + 消息 CRUD + 导出统计 |
| `src/pages/ChatPage.tsx` | **12,656** | 混合 UI 渲染 + 图片解密 + 语音转写 + 消息搜索 |
| `electron/services/export/core/ExportContext.ts` | **5,813** | 消息类型分发 + 格式化 + 导出上下文 |
| `src/pages/SettingsPage.tsx` | **5,685** | 12 个设置 Tab 全部堆在一个文件 |
| `electron/main.ts` | **4,795** | 8 种窗口创建 + 40+ IPC handler + 服务初始化 |
| `electron/services/wcdbCore.ts` | **5,001** | 80+ DB 操作全集 |

### 5.2 错误处理（CRITICAL）

- **80+ 空 catch 块** — 数据库错误、备份失败、解密异常被静默吞噬
  - wcdbCore.ts: ~20 处
  - chatService.ts: ~15 处
  - backupService.ts: ~15 处
  - snsService.ts: ~15 处
- **60+ `.catch(() => {})`** 静默丢弃 — fire-and-forget 模式在关键路径上使用

### 5.3 安全（HIGH）

- **4 个 BrowserWindow 设置 `webSecurity: false`**（main、video、image、chat-window）
- **证书错误绕过**：`qq.com`、`wechat.com` 子域名的 TLS 证书校验被跳过（main.ts:1131-1143）
- **无 CSP**（Content-Security-Policy）：`index.html` 无 `<meta>` 标签
- **密码哈希用 SHA-256**（config.ts）：应用层密码存储应使用 bcrypt/argon2（但有 safeStorage 加密缓解）

正确做法：
- `contextIsolation: true` + `nodeIntegration: false` — 全部窗口正确设置
- `contextBridge.exposeInMainWorld` — preload 正确使用

### 5.4 测试（CRITICAL）

- **零测试文件**：无 `*.test.*`、`*.spec.*`、`__tests__/`
- **无测试框架**：package.json 中无 jest/vitest/mocha/playwright
- **影响**：所有重构、平台迁移只能手动验证

### 5.5 依赖问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| React 19 RC | HIGH | `react@^19.2.3` + `react-dom@^19.2.7` 为预发布版 |
| TypeScript 6.0.3 | HIGH | 刚发布的大版本，第三方类型定义可能不兼容 |
| 缺失依赖 | HIGH | `better-sqlite3`、`whisper-node`、`shelljs`、`node-llama-cpp` 在 vite.config.ts 标记为 external 但不在 package.json |
| pnpm overrides 无效 | MEDIUM | `pnpm.overrides` 下的 CVE 修复在 npm 下不生效 |
| 89 处 `any` 类型 | MEDIUM | SettingsPage.tsx 中 44 处最严重 |
| `noUnusedLocals: false` | LOW | 允许死代码累积 |

### 5.6 TypeScript 严格度

- `strict: true` ✅
- `noUnusedLocals: false` ⚠️
- `noUnusedParameters: false` ⚠️
- 零 `@ts-ignore` / `@ts-expect-error` ✅

---

## 六、汇总：对规划的影响

| 原假设 | 审计结论 | 需调整 |
|--------|----------|--------|
| "WF ~80% 代码复用" | 路由/组件/Services 可复用，但需剥离 ~3,000 行平台代码 | 量化更新 |
| "国际化（WF 基础版）进 v1" | **WF 无国际化，不做** | 纯中文版，不引入 i18n |
| "WeFlow 直接复用" | 技术债显著（万行单体、零测试、空 catch） | 增加风险评估 |
| Windows 专属剥离工作量 | 6 文件删除 + 5 处重构 + UI 清理 ≈ 2-3 天 | 新增到实施计划 |
| 代码质量可接受 | 80+ 空 catch + webSecurity:false ×4 需修复 | 新增到 v1 必要条件 |

### 建议：v1 新增前置任务

1. **平台剥离**：删除 6 文件 + 重构 5 处（~1 天）
2. **安全修复**：webSecurity:false 改为 protocol.registerFileProtocol（或评估是否可安全移除）
3. **关键路径加错误日志**：wcdbCore/chatService/backupService 的空 catch 至少加 `console.error`
