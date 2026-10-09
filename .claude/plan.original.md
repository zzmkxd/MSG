# 实施方案

> 方案 A：Electron + TypeScript + React，以 WeFlow 为主骨架。WM/GW 补充。

---

## 第一层：功能拆解

### 1. 账号管理
- 多微信账号检测（Weixin.exe 进程枚举）、目录选择（`xwechat_files\*\db_storage`）
- 进程状态检测、多账号配置切换（加密存储）

### 2. 数据库
- DB 密钥自动获取（wx_key.dll 注入，已验证 v4.1.x）
- WCDB 原生 C++ 桥直连（208KB，80+ 操作，不落盘）
- 多数据库自动挂载（session / message_0~N / contact / hardlink / emotion 等）

### 3. 聊天记录浏览
- 会话列表 + 聊天气泡（全消息类型：文本/表情/图片/视频/语音/文件/链接/引用/拍一拍/合并转发/名片/位置/通话/转账/收藏笔记/红包/视频号/企业名片/系统消息）
- 虚拟列表（react-virtuoso）、图片查看器、视频/语音播放（Whisper 转录）
- WF 覆盖 17 种消息类型，WM 补充 3 种（红包/视频号/企业名片）+ 4 种增强（转账/表情包/文件/收藏笔记）

### 4. 联系人
- 联系人列表（搜索 + 拼音索引）、详情（备注/昵称/微信号/头像/地区/签名/性别）
- 群成员列表、公众号/服务号列表

### 5. 朋友圈（SNS）—— v1
- 时间线 + 图片/视频 + 点赞/评论 + SNS 导出
- WF `snsService.ts` + `src/pages/Sns/` 直接复用

### 6. 导出
- **WF 保留**：CSV / HTML / JSON / TXT / Markdown / Excel / SQL（7 种格式化器）
- **TS 移植**：DOCX（参考 WM `exporter_docx.py`）+ AI 训练 TXT（参考 WM `exporter_ai_txt.py`）
- Excel 补充 WM 公众号专用模式（支付/收款/步数/快递）

### 7. 分析与报告
- **WF 保留**：聊天统计（analyticsService）、年度报告、双人报告、洞察（insightService，LLM 需自备 Key）
- **TS 移植**：词频/词云（jieba-wasm + ECharts，2026-10-09 已接线）；独立 HTML 报告不移植（WF 年报等价）
- 人格/MBTI：**不做**（2026-10-09 决策）

### 8. 解密系统（全链路 WF，WM 解密舍弃）
- DB 密钥（wx_key.dll 注入）、图片 XOR/AES 密钥（kvcomm 推导 + 内存扫描）
- DAT V1/V2 解密、wxgf HEVC→JPEG（ffmpeg）、批量流水线
- Silk→MP3（pysilk + ffmpeg 子进程）

### 9. 其他
- 隐私擦除（导出过滤手机号/邮箱/身份证/密码）—— WM 参考，TS 移植
- 密钥安全存储（DPAPI + PBKDF2/AES-256-GCM）+ 7 套主题（OKLCH）
- Windows Hello 锁屏 + HTTP API（5031）+ electron-builder NSIS 打包
- 备份/恢复 → v2；本地 AI 推理 → **取消**（2026-10-09：不做 AI/LLM）

### 10. 性能边界

| 场景 | 机制 | 参数 |
|------|------|------|
| 消息列表 | react-virtuoso | overscan=140px，10 万+ 消息 |
| DB 查询 | WCDB cursor 分批 | 50 条/批，Worker 子线程 |
| 导出 | 流式分批 flush | 80-160 条/批，1-6 会话并发 |
| 媒体缓存 | LRU 磁盘 | 6 GB / 12 万文件 / 45 天 TTL |
| 群统计 | 分批读取 | 360 条/批，上限 3000 条/群 |
| AI 画像 | 按月分批 | 800 条/月 |
| 图片解密 | Worker 线程池 | 独立线程 |

### v1 vs v2

| v1 | v2 |
|----|-----|
| 1-10 全部子功能（SNS/锁屏/HTTP API/主题/安全存储/打包） | 备份/恢复、单体文件拆分、测试（本地 AI 推理已取消） |

---

## 第二层：逐项对照可复用来源
→ `.claude/comparison-matrix.md`（3项目 × 9类别 全功能对比矩阵，含 §10 可视化/UI 层面）

---

## 第三层：架构

### 3.1 总体决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 技术栈 | Electron + TypeScript + React | 照搬 WeFlow，代码复用 ~80% |
| 解密 | WeFlow wx_key.dll 注入 | DLL 已验证 v4.1.x |
| 数据库 | WCDB 原生 C++ 桥 | 80+ 操作，已验证 |
| GUI | WeFlow React | 30+ 路由、40+ 组件、9 个 Zustand store |
| 导出 | WF 10 种 + WM DOCX/AI_TXT 补充 | WF 已有 7 种格式化器 |
| 消息解析 | WF 17 种 + WM 补充 3 种 | 红包/视频号/企业名片 |
| 分析 | WF analytics/insight + GW stats（词频） | visualizer/personality 不做（2026-10-09 决策） |
| SNS/主题/锁屏/API | WF 直接复用 | v1 即可 |
| `app/` 旧代码 | 全部舍弃 | Python 架构，与 Electron 不兼容 |

### 3.2 目标工程结构

```
msg/
├── electron/
│   ├── main.ts / preload.ts
│   └── services/
│       ├── keyService.ts          # DB密钥（wx_key.dll 注入）
│       ├── imageDecryptService.ts # 图片解密（XOR/AES/wxgf）
│       ├── wcdbCore.ts            # WCDB 桥（80+ 操作）
│       ├── exportService/         # 导出（10 种格式）
│       ├── analyticsService.ts    # 聊天统计
│       ├── insightService.ts      # AI 分析（+ GW personality）
│       ├── snsService.ts          # 朋友圈
│       ├── config.ts              # 配置管理
│       └── dbPathService.ts       # 路径解析
├── src/
│   ├── App.tsx                    # 30+ 路由
│   ├── components/                # 40+ 通用组件
│   ├── pages/                     # 聊天/分析/报告/导出/SNS/联系人/设置
│   ├── stores/                    # 9 个 Zustand store
│   └── workers/                   # 8 个 worker
├── scripts/silk_worker.py         # Silk→MP3
└── package.json
```

### 3.3 需要 TS 移植的模块（2026-07-11 修订）

WF 已有的模块直接保留。经过 2026-07-29 逐文件二次核实 + WF 能力对齐，**原 7 项缩减为 2 项移植 + 1 项资源复用**。

#### 确认移植（真正的新功能）

| 模块 | 来源 | 行数 | 难度 | 原因 |
|------|------|------|------|------|
| 词频统计（stats） | GW Python | 57 | 低 — jieba→jieba-wasm（已在 deps） | WF analyticsService 无 jieba/分词/词云 |
| DOCX 导出 | WM Python | 337 | 中 — → docx npm 包 | WF 8 种格式独缺 DOCX |

#### 直接复用（无需移植代码）

| 资源 | 来源 | 行数 | 方式 |
|------|------|------|------|
| GW CSS（OKLCH 主题） + JS 热力图 | GW report.py 内嵌 | 636 | 提取为独立 .css/.js 文件 |

#### 跳过的模块（WF 已有等价或更强的实现）

| 模块 | 来源 | 行数 | 跳过原因 |
|------|------|------|----------|
| visualizer.py（7种图表） | GW Python | 262 | WF ECharts 已覆盖饼图/柱状/折线/热力图/词云 |
| personality.py（11维人格） | GW Python | 141 | 2026-10-09 决策不做人格/MBTI（G7 取消）；产出 Big5/MBTI 结构化维度，insightService（LLM 自由文本）不可互替（HANDOVER §3.6），方向一致：不移植 |
| report.py（HTML 报告） | GW Python | 1,014 | WF AnnualReportWindow + HtmlFormatter 等价 |
| exporter_ai_txt.py（AI 训练文本） | WM Python | 51 | WF ChatLab + ChatLab-JSONL 两种 AI 训练格式 |
| biz_message.py（补充消息解析器） | WM Python | 316 | **非解析器**，是 SQLite 查询封装（BizMessageDB）。红包/视频号/名片检测已存在 chatService.ts:4795-4806/91-95/108-111。SQL→WCDB 不可翻译 |

> 有效新增：~400 行 TS + ~636 行直接复用 CSS/JS。较原估算 2,178 行缩减 81%。

### 3.4 数据流

```
微信客户端 (Weixin.exe v4.1.x)
         │
         ▼
  ┌─────────────┐
  │ wx_key.dll  │──── DB密钥 ────┐
  │ (注入hook)  │                │
  └─────────────┘                │
         │                       ▼
         └── 图片密钥 ──▶  WCDB 原生 C++ 桥
                                │
         ┌──────────────────────┘
         ▼
  React Store (Zustand ×9) ──▶ React 组件（30+ 路由）
```

### 3.5 Windows 平台剥离（v1 前置，~1 天）

| 操作 | 目标 |
|------|------|
| 删除 | `keyServiceMac.ts` (1,483行)、`keyServiceLinux.ts` (477行)、`systemNotificationService.ts` |
| 删除 | `scripts/after-pack.cjs`、`resources/installer/linux/`、CI linux jobs |
| 重构 | `main.ts` KeyService 三路 switch → 直连；`notificationWindow.ts` 去 macOS/Linux 通知 |
| 重构 | `transcribeWorker.ts` + `voiceTranscribeService.ts` 去 DYLD/LD 环境变量 |
| 清理 | `WelcomePage.tsx` + `SettingsPage.tsx` macOS/Linux 路径占位符 |

### 3.6 技术债（v1 关注）— 2026-07-11 状态

| 风险 | 严重度 | 处理 | 状态 |
|------|--------|------|------|
| 4 个万行级单体文件 | CRITICAL | v1 不拆，修改时小心 | 持续 |
| 48 个空 catch {}（3 文件） | CRITICAL | 全部判定为容错类（清理/探测/回退），无需修改 | ✅ 已分析（2026-07-11） |
| 零测试 | CRITICAL | v1 加 smoke 测试（DB 连接、导出、关键 IPC） | 待 v1 |
| `webSecurity: false` ×4 | HIGH | 评估 `protocol.registerFileProtocol` 替代 | 待评估 |
| React 19 RC + TS 6.0.3 | HIGH | 锁定精确版本 | ✅ 已锁定 |
| vite externals 6 个无效项 | HIGH | 已移除 better-sqlite3/fsevents/whisper-node/shelljs/node-llama-cpp/@vscode/sudo-prompt | ✅ 已清理（2026-07-11） |
| npm overrides 缺漏 | MEDIUM | 从 pnpm.overrides 合并 CVE 修复 | ✅ 已合并 |
| installer.nsh VC++ 兜底 | LOW | 已有完整检测→下载→安装逻辑（22-65行），无需额外处理 | ✅ 已验证（2026-07-11） |

---

## 第四层：实施计划

### 阶段 0-3：实施前置 ✅（2026-07-10 完成）
- 环境确认（Node.js ≥22、VS 2022、参考项目可读）
- 工程骨架搭建（package.json、npm install、electron/、src/、scripts/、resources/）
- 平台剥离（删 6 文件 + 重构 6 文件：main.ts、notificationWindow.ts、transcribeWorker.ts、voiceTranscribeService.ts、WelcomePage.tsx、SettingsPage.tsx）
- 四层验证通过：编译 → 5/5 原生模块 → WCDB 6/6 符号 → wx_key.dll 6/6 符号

### 阶段 4(A)：vite externals 清理 ✅（2026-07-11 完成）
- 移除 6 个无效 external：better-sqlite3、fsevents、whisper-node、shelljs、node-llama-cpp、@vscode/sudo-prompt
- 删除 `electron/types/whisper-node.d.ts`
- tsc 0 错误，vite build 通过

### 阶段 4(B)：空 catch 审计 ✅（2026-07-11 完成）
- 48 个空 catch {} 全部判定为容错类（清理/探测/回退），无需修改

### 阶段 4(C)：文档同步 ✅（2026-07-11 完成）
- installer.nsh VC++ 兜底已实现（22-65行），修正 plan.md §3.6
- 阶段 0-3 和 A/B 完成状态同步

### 阶段 5：E2E 冒烟测试 ✅（2026-07-11 完成）
- 密钥注入提取验证通过（wx_key.dll, 普通权限）
- WCDB 连接全链路通过（Electron/Node 24.x 环境，账号2）
- 修复：React 版本不匹配（react 19.2.3 ≠ react-dom 19.2.7 → 对齐 19.2.7）
- 应用正常运行：引导 → 密钥 → DB → 会话列表 → 消息浏览

### 阶段 6：GW/WM 补充功能 TS 移植 ✅（2026-07-29 完成）

经过 2026-07-29 逐文件二次核实 + WF 能力对齐，原 7 项缩减为 2 项移植 + 1 项资源复用，全部完成。

| 任务 | 模块 | 行数 | 输出 | 状态 |
|------|------|------|------|------|
| 6A | GW stats.py → TS 词频统计 | 57 | `electron/services/wordFrequencyService.ts` (253行) | ✅ 已接线（2026-10-09） |
| 6D-assets | GW CSS/JS → 静态资源提取 | 630 | `src/assets/gw/report.css`(462) + `heatmap.js`(168) | ✅ 已提取，零引用 → 2026-10-09 解锁可删/归档 |
| 6E | WM exporter_docx.py → TS DOCX | 337 | `electron/services/export/formatters/DocxFormatter.ts` (322行) | ✅ 已接线（2026-10-09；E2E 未验） |

**跳过的 5 项**（WF 已有等价或更强实现）：visualizer.py（ECharts 覆盖）、personality.py（insightService 更强）、report.py 核心逻辑（AnnualReportWindow 等价）、exporter_ai_txt.py（ChatLab 格式等价）、biz_message.py（SQLite 查询封装，非解析器；红包/视频号/名片检测已存在 chatService.ts）。

**遗留项**：
- Silk→MP3 子进程实测（WCDB 2026-10-09 起停摆，待 DB 恢复后测）
- `webSecurity: false` ×4 评估替代方案（plan.md §3.6）

### 待推进
- **D（可选）**：平台死代码清理（~10 文件 macOS/Linux 分支，无害）

---

## 2026-10-09 更新

1. **数据访问层停摆（根因厂商侧）**：`wcdb_api.dll` `InitProtection()` 全 `-101`、`welive.exe` 过期、`wx_key.dll` 干净。必读 `audit/verify/KNOWN-STATE-2026-10-09.md`。DB 依赖功能全部 blocked。
2. **G1-G6/G12 已接线提交（b0e4dfb）**：DOCX 导出、activeDays 修复（实测 557）、直方图、年报热力图、词频、托盘回退。DOCX E2E 未验（停摆阻断）。
3. **决策**：不做 AI/LLM；不做人格/MBTI → G7 取消；G5 死资源 `src/assets/gw/*` 已解锁（可删除/归档）。
4. **上游移植候选（新主线）**：28 文件可移植（批次 0-5）、40.6% 排除；`wxid`→`accountId` 不可照抄。必读 `audit/verify/UPSTREAM-PORT-CANDIDATES.md`。
