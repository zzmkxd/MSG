# MSG 项目 · 可视化层「真实数据验收」交接文档

> **HANDOVER.md** ｜ 生成于 2026-09-11 ｜ 撰写者：交接文档 agent
> **2026-10-09 状态更新**：① 数据访问层停摆（`wcdb_api.dll` `InitProtection` 全 `-101`、`welive.exe` 过期，根因厂商侧），必读 `audit/verify/KNOWN-STATE-2026-10-09.md`；② G1-G6/G12 已接线提交（b0e4dfb）；③ 决策：不做人格/MBTI → **G7 大五雷达图取消**；④ **G5 死资源 `src/assets/gw/*` 已解锁**（可删除/归档，Big5/MBTI 段无未来用途）。本文其余内容为 2026-09-11 验收的历史记录。
> **读者定位**：完全没有参与过这轮验收的人，或未来的 agent。读完本文你应当能：知道项目是什么、知道这轮做了什么、知道哪些结论可信哪些不可信、知道证据在哪、知道下一步该从哪里下手。
> **本文的硬约束**：只写有出处的事实。所有「未验证」项在 §7 单列，**不与已确证结论混写**。本文未修改任何业务代码或既有文档。

---

## 0. 先读这一段（30 秒速览）

| 问题 | 答案 |
|------|------|
| 这轮验收的对象是什么 | `E:\Code_zone\Msg_weflow` 的**可视化层**（10 条路由 / 8 个 ECharts 实例 / 4 类静态缺口） |
| 结论一句话 | **静态层确实空了一大片；运行时层是健康的**（`audit/VISUAL_AUDIT.md:12` 原文加粗） |
| 用户能不能正常用 | 能。10 条路由全部真的进去了，8/8 图表全部画出真图，控制台零报错。唯一失败项 `dual-report/view` 已闭环为**正常守卫**（非用户可遇） |
| 有没有真问题 | 有，但都是**静态/文档层面**的：1 个假指标（`activeDays`）、3 个零引用孤儿文件、2 个承诺未实现的图表、1 个用户可感知的功能缺失（DOCX 导出） |
| 改了几行业务代码 | **0 行**。整树 SHA256 开工/完工一致（`audit/VISUAL_AUDIT.md:271-274`） |
| 最大的坑 | **`audit/` 被 `.gitignore` 忽略** → 全部证据（含真实聊天截图）只在本地，不在版本库。见 §4.3 |
| 最该先修什么 | DOCX 导出接线（B4）→ `activeDays` 假指标（B1）→ 消息长度直方图（D1）。见 §3.9 〔2026-10-09 均已接线，见 §3.10〕 |

---

## 1. 项目是什么

### 1.1 定位

**MSG** = Windows 微信消息浏览/导出工具。**纯 Windows + 纯中文**，不做国际化。
`package.json:2-5`：`"name": "msg"`、`"version": "0.1.0"`、`"description": "Windows 微信消息浏览/导出工具"`、`"main": "dist-electron/main.js"`。

### 1.2 技术栈

| 层 | 技术 | 出处 |
|---|---|---|
| 运行时 | Electron 43.0.0（Node 24.17.0 / Chrome 150.0.7871.46，实测值） | `audit/raw/harness-env.json` |
| 语言 | TypeScript | `package.json` |
| 前端 | React 19（`react`/`react-dom` 均 **19.2.7**，曾因 19.2.3 ≠ 19.2.7 界面空白，已对齐） | `CLAUDE.md` |
| 图表 | `echarts: ^6.1.0` + `echarts-for-react: ^3.0.2` | `package.json:26,27` |
| 路由 | react-router v6（**`matchPath` 默认 `caseSensitive=false`**，见 §6.1） | `audit/RUNTIME_FINDINGS.md:169-171` |
| 数据库 | WCDB 原生 C++ 桥直连，**不落盘**；JS 侧 koffi FFI 绑定 | `CLAUDE.md`「关键决策」 |
| 原生二进制 | `resources/wcdb/win32/x64/` 三 DLL：`SDL2.dll`(2,500,096B) / `wcdb_api.dll`(1,387,008B) / `WCDB.dll`(9,664,512B) | `audit/GAP_FEASIBILITY.md:190-192` |
| 状态管理 | Zustand（9 个 store，数字**未核实**，见 §7） | `CLAUDE.md` |
| 打包 | electron-builder；`executableName: "electron"`（WCDB SDK 要求宿主 EXE 名为 `electron.exe`） | `CLAUDE.md`「阶段 7」 |

**⚠️ 关键工程约束**：`wcdb_api.dll` 的 **C++ 源码不在本仓库**（预编译二进制）。全仓递归搜 `*.cpp/*.h/*.hpp/*.cc/*.c`（排除 `node_modules`）**只找到 1 个文件，且是无关的 macOS 参考项目残留**：`WeFlow_for_archlinux-main/resources/key/macos/source/image_scan_helper.c`（`audit/GAP_FEASIBILITY.md:195-199`）。
→ **任何「改 C++ 层」的方案在本仓库都不可执行。** 这一条决定了所有缺口方案的形态。

### 1.3 三个只读参考项目

| 项目 | 目录 | 角色 | 复用率 |
|---|---|---|---|
| **WeFlow** | `WeFlow_for_archlinux-main/` | **主骨架**：Electron/React/WCDB/解密/导出/配置/主题/SNS/API | **~80%** |
| **WeChatMsg** | `WeChatMsg-master/` | 补充参考：DOCX/AI_TXT 导出、3 种补充解析器（红包/视频号/企业名片）、Excel 公众号模式。**WM 解密全部舍弃**（Silk 与 WF 等价） | **~10%** |
| **ginger_wechat_portrait** | `ginger_wechat_portrait/` | 补充参考：stats / visualizer / personality（**需 TS 移植**）〔2026-10-09：仅 stats 移植，其余不做〕 | **~10%** |

出处：`msg/CLAUDE.md`「参考项目（只读，不改动）」；三者在 `.gitignore` 中均被忽略（`WeFlow_for_archlinux-main/`、`WeChatMsg-master/`、`ginger_wechat_portrait/`）。

### 1.4 项目既有文档地图（全部只读）

| 文件 | 内容 | 本轮相关性 |
|---|---|---|
| `msg/CLAUDE.md` | 项目定位、关键决策、阶段 0-7 状态 | **有矛盾**，见 §3.6〔2026-10-09 已裁决修正〕 |
| `msg/.claude/plan.md` | 四层实施方案（总纲） | 阶段 6 表格 `:218-226` 有失真〔已订正〕 |
| `msg/.claude/status.md` | 各阶段完成状态 | **阶段 6 三条 ✅ 全部为「属实但未接线」**，见 §3.3-3.5〔2026-10-09 已接线〕 |
| `msg/.claude/comparison-matrix.md` | 跨项目功能对比（**§10 可视化/UI 层**） | §10.2/§10.3 多条声称不成立〔已订正〕 |
| `msg/.claude/wf-audit.md` / `gw-audit.md` / `dependency-audit.md` | WeFlow 源码审计 / GW 逐文件量化审计 / 依赖审计 | 本轮未复核 |

---

## 2. 这轮验收做了什么、怎么做的

### 2.1 任务分型

这是一轮**「可视化层真实数据验收」**，不是开发任务。三条硬约束贯穿全程：

1. **业务代码零改动** —— `src/`、`electron/`、`scripts/`、`.claude/` 一律只读。
2. **必须在真实数据上验收** —— 用本机真实微信库（v4.1.8.107，账号 `wxid_xx1zzo5hut8e22_8c04`），不用人造 fixture。
3. **禁止启动应用的约束只对静态/分析 agent 生效** —— 运行时 agent 被授权注入真实主进程。

### 2.2 组织形式：一名监督者 + 三名执行 agent

| 角色 | 分工 | 主交付物 |
|---|---|---|
| **监督者（总监督）** | 冻结基线、独立核实答案键、设计暗卷、跑 M0 实测、合并 M4 总报告 | `E:\Learn_zone\.msg-supervisor-notes.md`（**不进仓库**，仅判卷用）；`audit/VISUAL_AUDIT.md` |
| **Agent A｜静态取证** | 纯静态：代码级 grep + 二进制级字节扫描。**明令禁止启动应用 / 跑 dev / 跑 build** | `audit/A-static/STATIC_FINDINGS.md`（666 行）；原始输出 `audit/A-static/raw-static/evidence.txt` |
| **Agent B｜运行时截图取证** | 注入真实主进程，跑 10 条路由，截图 + 逐 canvas 像素取证 | `audit/RUNTIME_FINDINGS.md`（225 行）；证据 `audit/raw/`、`audit/raw-negative/`、`audit/harness/` |
| **Agent C｜缺口可达性分析** | 判断两个缺口（长度直方图 / 大五雷达图）能不能做、要改哪几个文件 | `audit/GAP_FEASIBILITY.md`（492 行） |

三份待裁决清单（各自独立写，不共享文件）：
`audit/BLOCKED-B.md`（4 项，其中 1 项自行闭环）、`audit/BLOCKED-C.md`（B-1~B-4）、`audit/A-static/BLOCKED-A.md`（B1~B6）。

> **A 的文件落点曾发生迁移**：`BLOCKED-A.md:61-72` 记载 A 原本把产物写在 `E:\Learn_zone\audit\`（工作区根），因为它判断「工作区根 = `E:\Learn_zone`」。最终这些文件出现在 `msg\audit\A-static\` 下（含 `raw-static/evidence.txt`）。**迁移动作由谁执行、是否有内容改动，本文未验证**（见 §7）。

### 2.3 监督者的验收机制：明卷 + 暗卷

**明卷（复跑复现）**：每条结论必须附可复现命令或产物路径。监督者亲手复跑关键命令、独立复算像素、独立核对指纹。

**暗卷（不写进任何执行 agent 的提示词）** —— `E:\Learn_zone\.msg-supervisor-notes.md:74-79` 原文 5 条：

1. 抽查 agent 报告里任一「0 命中」搜索，亲手复跑，比对是否真 0
2. 抽查 `audit/raw/` 中 2 张 PNG：尺寸合理、非纯色、含预期 UI 元素，而非空白/错误页
3. 用整树指纹核对业务代码零改动（**独立于 `git diff`**）
4. 抽查「canvas 已绘制」结论是否附真实尺寸与像素方差
5. 核 `git rev-parse HEAD` 是否仍为 `5357cdb`（检测偷偷提交）

**冻结基线**（`E:\Learn_zone\.msg-supervisor-notes.md:5-14`）：

| 项 | 值 |
|---|---|
| HEAD | `5357cdb9e182dadcefe41a50de245c7b002263da` |
| 业务目录文件数 | 304（`src`/`electron`/`scripts`/`.claude`） |
| 整树 SHA256 | `906ecb3103fc0f9f0a8da52e52472395bed185d1c7f1566459599353a8fe5390` |
| 开工时既存改动 | `M .gitignore`、`M package.json`、`?? scripts/smoke-pack-config.cjs`、`?? scripts/smoke-verify.cjs` |

**监督者的 M0 实测基线**（`msg-supervisor-notes.md:16-22`）：`npm run typecheck` 退出码 0（9.3s）；`npm run smoke:quick` 退出码 0（8.1s，PASS L0/L2/L3/L4/L6b，SKIP L1/L5/L6）；**测试框架 0 个 `*.test.*`，无 vitest / playwright**。

### 2.4 Agent B 的验收台：怎么在「不改一行业务代码」的前提下拿到运行时证据

**核心手法**（`audit/RUNTIME_FINDINGS.md:38-40`）：

```powershell
NODE_OPTIONS=--require audit/harness/inject.cjs  →  electron.exe .
```

`inject.cjs` 被注入**真实应用主进程**（`app.getName()='msg'`、`userData=%APPDATA%\msg`、`isPackaged=false`，与用户双击启动一致），再由它用 `BrowserWindow.getAllWindows()` / `webContents.executeJavaScript()` / `capturePage()` 取证。

**这一步是绕开 CDP 不可用的必需手段** —— 见 §6.5。

**命令面**（`audit/RUNTIME_FINDINGS.md:31-36`）：

```powershell
cd E:\Code_zone\Msg_weflow
node audit/harness/run.cjs                 # entry 闸门 → GREEN，退出码 0
node audit/harness/run.cjs --gate=full     # 严格闸门（+渲染就绪+截图非空页）→ RED 9/10
node audit/harness/run.cjs --negative      # 反向验证 → 退出 0 且把错路径判 FAIL
```

**两档闸门定义**（`audit/RUNTIME_FINDINGS.md:41-47`）：

- `entry`：10 份 JSON + 10 张 PNG 齐全，且每条路由 `hash 相符 && 页面锚点存在` → 本轮 **GREEN，退出码 0**
- `full`：额外要求 10 条全部 `renderState=ready` 且 10 张 PNG 全部 `contentful` → 本轮 **RED（9/10）**，差额全部来自 `/dual-report/view`（已闭环为正常守卫）
- **PNG「非纯色」判定阈值（v2 已收紧，旧阈值是假绿灯的来源）**：`variance ≥ 15` **且** `distinctColors ≥ 32`（精确 24bit 色）**且** `dominantSharePercent ≤ 90%`。实测值见 `audit/raw/summary.json` 的 `thresholds` 字段。

**「真的进去了」的判定依据是双条件**（`audit/RUNTIME_FINDINGS.md:46-47`）：最终 `location.hash` 与请求一致 **且** 该页特征锚点（如 `.analytics-page-shell`）存在。
**⚠️ 只看 hash 会出假绿灯** —— 未匹配的路径 hash 不会变（反向验证轮证实：`#/analytics/private/viwe` hash 保持不变，但主内容区空白）。

### 2.5 监督者自己犯的两个方法论错误（在验收台里被抓住）

这两条写进了 `audit/RUNTIME_FINDINGS.md:70-73` 和 `audit/VISUAL_AUDIT.md:70-73`，值得后来者知道：

1. **`nonSolid` 阈值过松构成假绿灯**：旧阈值 `variance>5 且 colors>8` 挡不住加载中的空页，两张近纯色截图被判「通过」。
2. **`errorCount` 只统计控制台错误，漏掉页内错误文案**：`/dual-report/view` 首轮显示 `Report Initialization Failed 缺少好友信息` 却记 `errorCount: 0`。

→ 返工后新增 `errorTexts` 字段并拆成 `entry`/`full` 两道闸门。

---

## 3. 核实过的关键事实（重点：文档声称 vs 代码现实）

> **判读三分类**（`audit/A-static/STATIC_FINDINGS.md:462`）：
> **属实** = 描述与代码一致；**属实但未接线** = 产物存在但没有任何代码路径使用它（用户看不到效果）；**不存在** = 代码里根本没有。

### 3.1 【🔴 用户可见】假指标 `activeDays` —— 全项目唯一的假指标

**代码现实**：

| 环节 | 位置 | 内容 |
|---|---|---|
| 生产 | `electron/services/analyticsService.ts:682` | `activeDays: activeMonths * 20, // 粗略估算，或改为返回活跃月份` |
| 上游 | `electron/services/analyticsService.ts:666` | `const activeMonths = Object.keys(d.monthly).length` |
| key 格式 | `electron/services/analyticsService.ts:388` | `const monthKey = \`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}\`` → **`YYYY-MM`，跨年不去重** |
| IPC | `electron/main.ts:3892` | `ipcMain.handle('analytics:getOverallStatistics', ...)` |
| preload | `electron/preload.ts:428` | `getOverallStatistics: (force?) => ipcRenderer.invoke(...)` |
| **UI 消费 1** | `src/pages/AnalyticsPage.tsx:723` | `<span className="stat-value">{statistics?.activeDays \|\| 0}</span>` |
| **UI 文案** | `src/pages/AnalyticsPage.tsx:724` | `<span className="stat-label">活跃天数</span>` |
| **UI 消费 2** | `src/pages/GroupAnalyticsPage.tsx:1456` | 群成员同款 |
| 类型 | `src/types/analytics.ts:16`、`src/stores/analyticsStore.ts:16`、`src/types/electron.d.ts:1091,1251` | `activeDays: number` |

**口径自相矛盾（同名字段，两个真实现）**：
- `electron/services/groupAnalyticsService.ts:1633` → `stats.activeDays = dailySet.size`（真去重天数）
- `electron/services/insightProfileService.ts:810` → `activeDays: daySet.size,`，且 `:824` 拼进 prompt

→ **全站日报/群体分析用真实天数，唯独 AnalyticsPage 用假数字。**

**🔴 运行时闭环确认（真机现形）**：`/analytics/private/view` 页面实际渲染文本为
`10.1万 总消息数 · 5.5万 发送消息 · 4.5万 接收消息 · 400 活跃天数 · 数据范围: 2025…`
`400 = activeMonths(约20) × 20` —— **静态分析与运行时观察在此闭环**（`audit/VISUAL_AUDIT.md:64-68`）。

**复现**：`git grep -n "activeDays" -- src electron`（`audit/A-static/STATIC_FINDINGS.md:29-47` 有完整原始输出）

**⚠️ 未定量化的部分**：`d.monthly` 有两条来源 —— TS 游标回退路径（`:388`，已确认 `YYYY-MM`）与 **原生路径 `wcdb_api.dll`（key 格式未验证）**。若原生 key 是 `MM`（不带年），`activeDays` 恒 ≤ 240，错误幅度差一个数量级。见 §7.3。

> **〔2026-10-09〕已修复**（b0e4dfb）：改真实 `Set.size` 口径，实测 557 天（修复前假值 400）。

---

### 3.2 【🔴 死资源】`src/assets/gw/report.css` + `heatmap.js`

**文档声称**：`status.md:116` 与 `plan.md:223` 均标 **✅**，声称 **636 行**。

**代码现实**：
- **全项目 0 处代码引用**。三条搜索（`assets/gw` / `report.css` / `heatmap.js`）输出**完全相同**，均只有 2 行命中，**都在 `.claude/` 文档里**（`audit/A-static/STATIC_FINDINGS.md:134-146`）。
- 加扩展名限定的源码级搜索 `git grep -n -E "gw/(report|heatmap)" -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.css" "*.scss" "*.html" "*.json"` → **EXIT=1（0 命中）**。
- 两文件**确实被 git 跟踪**（`git ls-files -- src/assets/gw` 有输出），所以「0 命中」不是因为搜不到。
- **实测行数**：`report.css` = **462 物理行** / 18,082 字节；`heatmap.js` = **168 物理行** / 5,679 字节。合计 **630**，非文档声称的 636。
- **`heatmap.js` 无 `export` / `module.exports`，不是 ES 模块** —— 是给 `<script>` 标签用的全局函数 `initHeatmap(selfData, partnerData, hasPartner)`（`:10`）。**直接 `import` 取不到任何东西。**
- 硬依赖 DOM id：`hm-year-btns`、`hm-self-grid`、`hm-partner-grid`。

**判断修正（重要，别写错）**：**不是「忘了接线」，而是被 TS 重写取代** —— `ReportComponents.scss`(123 行) + `ReportHeatmap.tsx`(46 行) + `ReportWordCloud.tsx`(98 行)。
**但死的那份功能更丰富**：GW 版 `heatmap.js` 有 **5 色分级调色板**（`SELF_PAL`/`PARTNER_PAL`）+ **年份切换按钮** + **tooltip**，画的是**整年逐日**日历热力图；在用的 `ReportHeatmap.tsx` 只有**单色 `var(--primary)` + opacity**，画的是**星期 × 小时 7×24** 网格（`ReportHeatmap.tsx:5,12,26,40`）。
→ **若要接线，是「升级」而不是「接通」。**（`audit/VISUAL_AUDIT.md:125` 与 `msg-supervisor-notes.md:34-35` 两处独立得出同一结论。）

**`report.css` 里有一批「为本项目不存在的功能准备的 CSS」**：16 个分节，其中 `Big5 Butterfly`(226) / `Single Big5`(303) / `MBTI`(330) / `Heatmap`(383) —— **Big5/MBTI/雷达三簇合计约 135 行 CSS 对应的是本项目完全没有的功能**（`audit/A-static/STATIC_FINDINGS.md:188-217,217`）。

> **〔2026-10-09〕已解锁**：人类拍板 —— 可删除或归档（Big5/MBTI 段无未来用途，G7 已取消）。

---

### 3.3 【🔴 孤儿】`electron/services/wordFrequencyService.ts`

**文档声称**：`status.md:117`、`plan.md:222` 标 **✅**，声称 **136 行**。

**代码现实**：
- `git grep -n -F "wordFrequencyService" -- .` → **3 处命中：2 处是 `.claude/` 文档，1 处是文件自己的头注释。0 处代码引用。**
- `git grep -n -F "computeWordFrequency" -- .` → **只有定义（`:74`），没有调用**。
- `git grep -n -F "word_frequency" -- .` → **EXIT=1**（IPC 通道名 0 命中）。
- **实测行数**：**142 物理行** / 124 非空行 / 5,309 字节（非 136）。
- 依赖 `jieba-wasm`（`package.json:34`，`node_modules\jieba-wasm` 存在），但**从未在任何 Electron 入口被加载过**。
- 内部 `reindexArray`(`:60`) 定义了但**从未被调用**，是死代码。

**缺 5 环**（关键断点**不是 IPC**）：

| # | 缺的环节 | 需要改动的文件 | 大致位置 |
|---|---|---|---|
| 1 | **`Message → MessageRecord` 适配器**（全项目不存在） | 新建 / 加在服务内 | 新增 |
| 2 | 服务编排入口（输入 sessionId 输出结果） | `wordFrequencyService.ts` | `:142` 之后 |
| 3 | IPC handler | `electron/main.ts` | `:3916` 之后 |
| 4 | preload 桥接 | `electron/preload.ts` | `:436` 之后 |
| 5 | 前端调用点 | `src/pages/AnalyticsPage.tsx` | `:735-737` 区（词云组件 `ReportWordCloud.tsx` **已现成**） |

**接口错配详解**：`computeWordFrequency` 要的是**已切好 `date`/`hour`/`month`/`weekday`** 的 `MessageRecord[]`（`:42-48`），而 `chatService` 的 `Message` 只有原始 `createTime` 时间戳。**中间那层适配器全项目不存在。**

**顺带**：`wordFrequencyService.ts:39` 有 `lengthSeries: number[]`（逐条消息长度序列）、`:31` 有 `avgLength` —— **即「消息长度直方图」缺的只是渲染，不是数据。** 这与该文件是孤儿互为因果。

> **〔2026-10-09〕已接线**（b0e4dfb）：IPC `analytics:getWordFrequency` + preload + AnalyticsPage 调用 + `computeWordFrequencySummary` 编排（现 253 行）。2026-09-16 实测 `scanned=15,437` / `distinct=6,246`。

---

### 3.4 【🔴 孤儿 · 用户可感知】`DocxFormatter.ts` —— 导出菜单里看不到 DOCX

**文档声称**：`status.md:118`、`plan.md:224` 标 **✅**，声称 **256 行**。

**代码现实**：
- `ExportOrchestrator.ts:36-43` 导入 **8 个格式器**：ChatLab / Excel / Html / Json / Markdown / Sql / Txt / WeClone —— **`DocxFormatter` 不在其中**。
- `electron/services/export/types.ts:66` 的 `format` 联合类型 **10 个 id 里没有 `'docx'`**：
  `'chatlab' | 'chatlab-jsonl' | 'json' | 'arkme-json' | 'html' | 'markdown' | 'txt' | 'excel' | 'weclone' | 'sql'`
- `git grep -n -F "DocxFormatter" -- .` → **仅 2 处命中：文档 + 自身**（`:2` 注释、`:65` 类定义）。
- **实测行数**：**312 物理行** / 272 非空行（非 256）。
- **已排除动态加载**：`git grep -n -i "docx" -- electron/services/export/types.ts electron/services/export/core/ExportContext.ts` → **EXIT=1**。

→ **结论：DOCX 导出是唯一「用户可感知」的缺失**（`audit/VISUAL_AUDIT.md:137`），且 **接线成本极低**（加一个 import + 加一个 format id）。

> **〔2026-10-09〕已接线**（b0e4dfb）：`ExportOrchestrator.ts:37` import、format union 加 `'docx'`（现 11 个 id，现 322 行）。**E2E 未验**（welive/DB 停摆阻断）。

---

### 3.5 【🔴 不存在】声称存在的图表不存在

**源码级 0 命中**（必须限定 pathspec，否则踩二进制假阳性 —— 见 §6.2）：
`radar` / `雷达` / `大五` / `BigFive` / `histogram` / `直方图` / `messageLength` / `personality` / `性格` —— **全部 EXIT=1**。
`Big5` / `MBTI` —— **只命中死文件 `report.css`**（`Big5`：3 行 CSS 注释 `:226,:278,:303`；`MBTI`：6 处 `:330,338,344,345,346,461`）—— **纯 CSS 类名，零逻辑、零渲染、零数据字段**。

**`comparison-matrix.md` §10.3 逐条拆解**：

| 声称 | 判定 | 证据 |
|---|---|---|
| 小时分布柱状图 / 消息类型饼图 / 收发比 / 群活跃（WF ECharts 保留） | **属实** | `AnalyticsPage.tsx:735,736,737` + `GroupAnalyticsPage.tsx:1571,1578` |
| 词云（单/双人）（GW matplotlib，TS 移植） | **属实** | `src/components/ReportWordCloud.tsx` 存在，`DualReportWindow.tsx:642` 渲染，`:637-639` 提供「共同/我方/对方」三个 tab |
| 月趋势面积折线（GW matplotlib，TS 移植） | **不存在** | 后端有数据（`analyticsService.ts:785-787` 返回 `hourlyDistribution`/`weekdayDistribution`/`monthlyDistribution`），但前端**只有类型声明、0 个渲染点**（`src/types/analytics.ts:23,24`、`analyticsStore.ts:32`、`electron.d.ts:1114,1115`） |
| 星期分布柱状（GW matplotlib，TS 移植） | **不存在** | 同上，仅 `src/types/analytics.ts:23`、`electron.d.ts:1114` 两处类型声明 |
| **消息长度直方图** | **不存在** | `histogram\|直方图\|messageLength` 源码级 0 命中〔2026-10-09 已做，G3〕 |
| **大五人格雷达图** | **不存在** | `radar\|雷达\|大五` 源码级 0 命中〔2026-10-09 已取消，G7〕 |
| 年度交互热力图（GW Vanilla JS，直接复用） | **属实但未接线** | `src/assets/gw/heatmap.js` 存在，但 0 代码引用（§3.2）。**另注：在用的 `ReportHeatmap.tsx` 是另一种图（星期×小时 7×24），不能算这条的落地** |

**⚠️ 关于「全项目有几个 ECharts 渲染点」的口径差异（必须知道）**：
- `git grep -n "ReactECharts option" -- src` → **5 行命中**（`STATIC_FINDINGS.md:374-383` 的枚举口径）
- Agent C 的逐实例口径 → **8 个实例**：`AnalyticsPage.tsx:735,736,737,746`（4 个）+ `GroupAnalyticsPage.tsx:1475/1490/1571/1578`（4 个）（`GAP_FEASIBILITY.md:339-347`）
- **运行时实测也是 8 个实例全部出图**（`VISUAL_AUDIT.md:226-237`）
→ **两个数字不矛盾，是 grep 命中行 vs 实例数的口径差**：`AnalyticsPage.tsx:746` 与 `GroupAnalyticsPage` 的若干实例写法不匹配 `"ReactECharts option"` 字面量。**引用时请说明口径**，不要直接写「全项目只有 5 个图表」。

**实际 ECharts 渲染模式**：**内联 option 函数 + `<ReactECharts>`，没有独立图表组件文件**（`GAP_FEASIBILITY.md:339-346`）。

**§10.2「HTML 导出阅读器」= 不存在**（`VISUAL_AUDIT.md:162-163`）：
`flatpickr` **0 命中**、`lunr` **0 命中**（均用词边界匹配，见 §6.3）、`package.json` 依赖声明里也没有。
高德地图**存在于 `src/pages/ChatPage.tsx:11797`**（位置消息，点击外开 `https://uri.amap.com/marker?...`），但**不在 `HtmlFormatter.ts`**，故「融入 HtmlFormatter 的阅读器」不成立。
（§10.2 的「三栏布局」「虚化时间线」「12 种消息卡片」「分类过滤栏 8 类」**未逐项核对**，见 §7。）

---

### 3.6 【🔴 文档矛盾】`CLAUDE.md` 与 `status.md` 直接矛盾

| 文档 | 原文 | 出处 |
|---|---|---|
| `CLAUDE.md`「关键决策」 | `分析：WF analytics/insight + GW stats/visualizer/personality TS 移植（~1,500 行业务逻辑新增）` | `msg/CLAUDE.md` |
| `.claude/status.md:138-139` | 把 `visualizer.py (262行)` 与 `personality.py (141行)` **明确列入「跳过的 5 项」** | `status.md:137-142` |

**代码侧证据支持 `status.md`**：`personality` / `性格` / `radar` / `雷达` / `大五` 源码级 **全部 0 命中**（`STATIC_FINDINGS.md:590`）。

**`status.md:139` 的替换判断在「能力形态」上错位**（不是笔误，是判断问题）：
- 反证（`BLOCKED-A.md:50-55` 原始输出）：GW `personality.py`（141 行）**确实产出 Big5 五维 + MBTI 类型** —— `personality.py:74` → `"big5": {{`、`:81` → `"mbti": {{`、`:103` 有 MBTI 信效度提示。
- 而 `electron/services/insightService.ts`（1,788 行）是**纯 LLM 自由文本服务**：`:1596` 硬性要求「控制在 80 字以内」、`:1598` 允许输出 `SKIP`，**没有任何稳定的五维/MBTI 结构化输出**。
→ **二者不可互替。**

**`status.md:138`「WF ECharts 已覆盖 7 种图表」存疑**：代码里只有 5 个 `ReactECharts` 渲染点 / 8 个实例 / 8 个实例中 2 个是同一 `getHourlyOption` 复用。**「7 种」在代码中无对应。**（可能把 `ReportHeatmap` + `ReportWordCloud` 也算进去了，5+2=7 恰好吻合，但 `ReportWordCloud.tsx` **并非 ECharts 实现**。倾向认为口径不明，**不排除漏数**。）

**`status.md` 阶段 6 三条 ✅ 全部为「属实但未接线」**（`STATIC_FINDINGS.md:538-543`）：
6D-assets（`report.css`+`heatmap.js`）、6A（`wordFrequencyService.ts`）、6E（`DocxFormatter.ts`）—— **文件都在，功能全都不可用。**
**且行数全部不符**：文档称 636/136/256，实测 **630/142/312**。
**且四种口径（字节 / 物理行 / 非空行 / 文档声称）没有任何一种能复现文档数字** —— 已列入 `BLOCKED-A.md` B2 待裁决。

> **〔2026-10-09 裁决〕以 status.md 为准**：CLAUDE.md 已改为只保留 stats（词频），visualizer/personality 注明不做；三条 ✅ 均已接线（b0e4dfb）+ 行数订正（630/253/322）。见 NEXT-STEPS G11。

---

### 3.7 【🔴 死数据】年度报告热力图是「算完就丢」

- `activityHeatmap` **全项目只出现在类型声明**：`src/pages/AnnualReportWindow.tsx:36`、`src/types/electron.d.ts:1350` —— **从无读取或渲染**。
- 而后端 `electron/services/annualReportService.ts:886-1106` **确实算出了 7×24 矩阵**。
- `AnnualReportWindow.tsx`（941 行「11 场景」）**import 表里无任何图表库、无本地图表组件** → **该窗口图表数为 0**（仅装饰性粒子 canvas `:564` 与一个小 svg `:505`）。
- 复现：`git grep -n "activityHeatmap" -- src`（**2 命中，均为类型**）。

**逐页图表分布实测**（`msg-supervisor-notes.md:48-56`，import 表口径）：

| 页面 | 图表库 | 本地图表组件 | 图表数 |
|---|---|---|---|
| `AnalyticsPage.tsx` | echarts-for-react | — | 4 |
| `GroupAnalyticsPage.tsx` | echarts-for-react | — | 4 |
| `DualReportWindow.tsx` | 无 | `ReportHeatmap` + `ReportWordCloud` | 2 |
| `AnnualReportWindow.tsx` | **无** | **无** | **0** |
| `AnnualReportPage.tsx` | 无 | 无 | 0 |
| `MyFootprintPage.tsx` | 无 | 仅 `DateRangePicker` | 0 |
| `InsightInboxPage.tsx` | 无 | 仅 `Avatar` | 0 |

> **〔2026-10-09〕已接线**（b0e4dfb）：`AnnualReportWindow.tsx:645` 渲染 `<ReportHeatmap data={...} />`；实测 `.h-cell=168`（严格 7×24）。

---

### 3.8 【🟢 缺口可达性】Agent C 的两条结论

**D1. 消息长度直方图 —— 能做，零 C++ 改动。**

`wcdb_exec_query`（`electron/services/wcdbCore.ts:1098`）是一条**任意 SQL 通道**，绑定签名：
```
int32 wcdb_exec_query(int64 handle, const char* kind, const char* path, const char* sql, _Out_ void** outJson)
```
且**生产代码已在用**：`chatService.ts:11804` 对 **message 库**构造含 `"message_content"` 列的 SQL，`:11813` 执行 `wcdbService.execQuery('message', dbPath, sql)`。

**最短路径 = 4 个文件，0 行 C++，0 个新组件文件**：

| # | 文件 | 位置 | 改什么 |
|---|---|---|---|
| 1 | `electron/services/analyticsService.ts` | `:8-49` 加第 5 个接口；方法接在 `getTimeDistribution()`（`:750-793`）之后 | `getMessageLengthHistogram(begin, end)`，内部调 `execQuery`（或复用 `iterateSessionMessages`） |
| 2 | `electron/main.ts` | 紧随 `:3900-3902` | 加 `ipcMain.handle('analytics:getMessageLengthHistogram', ...)` |
| 3 | `electron/preload.ts` | 紧随 `:431` | 加 invoke 桥接 |
| 4 | `src/pages/AnalyticsPage.tsx` | 复用 `:737` 的 `<div className="chart-card wide">` 模式 | 照 `:735-737` 加第 5 个 `<ReactECharts option={...} />`，option 用 ECharts 原生 `bar` |

**三条可选数据路**（`GAP_FEASIBILITY.md:308-328`）：
- **路 1（最省事，证据链最硬）**：SQL 直出分布 —— `SELECT length(message_content) AS len ... GROUP BY` 分桶。
- **路 2（零 SQL 风险）**：游标 + JS 分桶 —— 在 `analyticsService.iterateSessionMessages`（`:211`）的 `onRow` 里加一行读内容。**唯一不确定项已写入 `BLOCKED-C.md` B-1**（游标行的字段全集未实机验证）。
- **路 3**：`wcdb_get_messages_by_type`（`wcdbCore.ts:1177`）按 `localType=1` 取行 —— 不如路 1/2。

**⚠️ 约束**：`wcdbCore.ts:4064` 有 TODO —— **C++ 层不支持参数绑定**，`:4066` 明确警告注入风险；SQL 只能字面量拼接，必须自行转义（仓库已有 `quoteSqlIdentifier`，见 `chatService.ts:11812`）。

> **〔2026-10-09〕已做**（G3）：2026-09-16 实测 `sum(buckets)=71,707==totalMessages`，空桶 0。

**D2. 大五人格雷达图 —— 技术可行，但「大五」这层语义全仓库不存在。**

- **(a) 图能画吗？→ 能，零成本。** `echarts: ^6.1.0` + `echarts-for-react: ^3.0.2` 默认整包引入，radar 坐标系是 ECharts 内置能力。
  （**未验证**：未读 `node_modules` 里 `echarts-for-react` 的实际内部引入方式，故「radar 一定可用」未实机验证 —— `GAP_FEASIBILITY.md:427`。）
- **(b) 五个维度的分数能拿到吗？→ 不能。** 三层逐一排除：
  - **原生 C++ 层**：不是卡点，但也没有 —— `wcdb_api.dll` / `WCDB.dll` 中 `personality`/`bigfive`/`mbti`/`radar` **各 0 次命中**（全字节扫描）。
  - **JS 聚合层：这里是真卡点。** `analyticsService.ts` 的 `onRow`（`:353-398`）**实际只读 4 个字段**（`create_time` / `local_type|type` / `is_send` / `sender_username`），**没读内容** —— 全文对 `content` 的大小写敏感匹配 = **0 处**。
  - **推理层**：`insightService.ts` 是**纯 LLM HTTP 客户端**（4 处 `/chat/completions`：`:318`/`:570`/`:951`/`:1616`），`:872-875` **无 API Key 直接失败，无本地推理**；`insightProfileService.ts:75-96` 唯一人格产出是自由文本 `finalProfile: string`，**无任何维度分**。

**→ 雷达图本身 ≈1 小时；瓶颈是「五维从哪里来」，这是产品决策 + 新算法/新 prompt，不是接线。**
**⚠️ 需人拍板**：LLM 打分（需用户自备 API Key）vs 纯统计代理公式。见 `BLOCKED-C.md` B-4。

> **〔2026-10-09〕已拍板：取消**（不做人格/MBTI）。见 NEXT-STEPS G7。

---

### 3.9 【🟡 附带发现】19 个「接线就能用」的存量原生符号

**与本次缺口无关，但值得知道**（`GAP_FEASIBILITY.md:201-234`）：

| 项 | 实测值 |
|---|---|
| A) `wcdb_api.dll` 串表中唯一 `wcdb_*` 名 | **109** |
| B) `wcdbCore.ts` 中 `this.lib.func('...')` 调用点 | **93** |
| C) 绑定符号名去重后 | **92** |
| D) 其中 `wcdb_*` 名 | **90** |
| E) 非 `wcdb_*` 的绑定 | **2**（`InitProtection`、`VerifyUser`） |
| **F) 在 DLL 里但 JS 从未绑定** | **19** |
| **G) 已绑定但 DLL 串表里找不到** | **0** ← 一致性反证：绑定表无笔误/无死符号 |

**19 个未接线符号全清单**：13 个 `wcdb_ai_*`（含 `wcdb_ai_query_topic_stats`、`wcdb_ai_get_session_messages`）+ 3 个表情包 CRUD（`wcdb_add/delete/update_custom_emoticon`）+ `wcdb_open_message_cursor_with_key` + `wcdb_probe_fts_schema` + `wcdb_set_monitor`。

**「0 引用」是逐符号实测的，不是抽样**：对 `electron/` 下全部 **100 个** `.ts/.js/.cjs/.mjs` 文件逐符号 `Select-String -SimpleMatch`，**19 个符号逐个 hits=0，总计 0 处引用**。
**但这 19 个没有一个与长度统计或人格维度相关。**

---

### 3.10 建议的下一步（按性价比排序，`VISUAL_AUDIT.md:283-290`）

1. ~~先查 canvas:0 的真相~~ ✅ **已查明并闭环**：不是图表不渲染，是等待策略过短。8/8 实例均正常出图
2. **接线 DOCX 导出**（§3.4）—— 成本极低（加 import + 加 format id），用户可感知收益最大 → ✅ **已接线（2026-10-09 b0e4dfb；E2E 未验）**
3. **修 `activeDays`**（§3.1）—— 一行改动，消除用户看到的假数字 → ✅ **已修复（实测 557 天）**
4. **做消息长度直方图**（§3.8 D1）—— 4 个文件、零 C++，性价比最高的新图表 → ✅ **已做（直方图自洽）**
5. **大五雷达图**（§3.8 D2）—— 需先拍板打分来源，成本高一个量级，建议最后做 → ❌ **已拍板取消（2026-10-09：不做人格/MBTI）**
6. **清理/接线死资源**（§3.2）—— 注意 GW 版比在用版功能更丰富，若要接线是「升级」而非「接通」→ **2026-10-09 已解锁：可删除/归档**

> **并行提示**：另一名 agent 正在撰写「待办与构造计划」（`msg\.claude\NEXT-STEPS.md`）。**执行前请先读那份**，它以本轮的缺口清单为输入给出更细的落地方案。**本文与该文件不共享内容，不存在依赖关系。**

---

## 4. 交付物清单与位置

### 4.1 本轮全部产物（`E:\Code_zone\Msg_weflow\audit\`）

| 路径 | 内容 | 大小/规模 |
|---|---|---|
| `audit/VISUAL_AUDIT.md` | **验收总报告**，21 条编号结论（A1-A7 运行时 / B1-B6 静态 / C1-C5 文档 / D1-D3 缺口） | 27,335 B |
| `audit/RUNTIME_FINDINGS.md` | Agent B 运行时取证报告 | 19,499 B / 225 行 |
| `audit/GAP_FEASIBILITY.md` | Agent C 缺口可达性报告 | 35,584 B / 492 行 |
| `audit/A-static/STATIC_FINDINGS.md` | Agent A 静态取证报告 | 52,618 B / 666 行 |
| `audit/A-static/raw-static/evidence.txt` | Agent A 全部原始输出 | — |
| `audit/BLOCKED-B.md` | 运行时侧待裁决清单（4 项，1 项已自行闭环） | 27 行 |
| `audit/BLOCKED-C.md` | 缺口侧待裁决清单（B-1~B-4） | 32 行 |
| `audit/A-static/BLOCKED-A.md` | 静态侧待裁决清单（B1~B6） | 94 行 |
| `audit/PROGRESS-B.md` / `PROGRESS-C.md` / `A-static/PROGRESS-A.md` | 三名执行 agent 的进度文件 | — |
| `audit/raw/` | **运行时主证据**：10 条路由各 1 份 JSON + 1 张 PNG（`analytics.json/png`、`analytics_private_view.json/png`、`annual_report_view.json/png`、`dual_report_view.json/png`、`footprint.json/png`、`insight_inbox.json/png` …），群聊 4 实例单独取证（`analytics_group__memberAnalytics.*` / `analytics_group__mediaStats.*`），另有 `summary.json`、`harness-env.json`、`harness-result.json`、带参数探针 `aux_dual_report_view_with_params.{json,png}` | 10 PNG + 10 JSON + 5 汇总 |
| `audit/raw-negative/` | 反向验证轮产物（含 `analytics_private_viwe.json/png`） | 同上规模 |
| `audit/harness/` | **可重复运行的验收台**：`run.cjs`（入口）、`inject.cjs`（主进程注入器）、`_env.cjs`、`_inject.cjs`（环境勘误用诊断脚本） | — |
| `audit/harness/logs/` | `last-run.log`、`normal-gate-entry.log`、`negative-CASE-mutation.log`、`negative-typo-mutation.log`、`inject-trace.log` | — |
| `audit/_probe.cjs` | **监督者留下的骨架**（3 窗口探针），Agent B 未改动 | — |
| **`E:\Learn_zone\.msg-supervisor-notes.md`** | **监督者台账（不进仓库，仅供判卷）**：冻结基线、答案键、暗卷设计、M4 合并计划 | 91 行 |

**`audit/raw/summary.json` 的结构**（复跑时按这个取数）：
顶层键 = `runAt, mode, gate, passed, exitCode, checks, thresholds, totals, routes`
`totals` 实测值 = `{"routes":10,"entered":10,"ready":9,"contentful":9,"canvases":6}`
`thresholds` 实测值 = `{"minVariance":15,"minDistinctColors":32,"maxDominantSharePercent":90}`
`routes[]` 每条键 = `id, page, requested, finalHash, entered, verdict, renderState, readyReason, renderCompleteMs, elapsedMs, canvasFinal, expectCanvas, errorCount, errorTexts, png, bodyTextHead, emptyStateTexts`

### 4.2 本轮「零改动」的证明

- `git diff --stat -- src electron scripts .claude` → **完全为空**（三名执行者各自自检一致，`VISUAL_AUDIT.md:271`）
- 监督者独立复核：`src`/`electron`/`scripts`/`.claude` 共 **304 文件**，整树 SHA256 `906ecb3103fc0f9f0a8da52e52472395bed185d1c7f1566459599353a8fe5390`，**开工/完工一致**
- HEAD 仍为 `5357cdb9e182dadcefe41a50de245c7b002263da`（**无偷提交**）

### 4.3 ⚠️⚠️ 最重要的一条提示：`audit/` 已被 `.gitignore` 忽略

**`.gitignore` 第 40 行**（原文）：

```
# 可视化验收产物（截图含真实聊天内容，绝不入库）
audit/
```

实测确认：`git check-ignore -v audit/raw/summary.json` → `.gitignore:40:audit/	audit/raw/summary.json`（**命中**）。

**这意味着**：

1. **本轮全部证据（报告 + 截图 + JSON + 验收台）只存在于本机磁盘，不在版本库。**
2. **将来 clone 这个仓库的人，看不到任何一条运行时证据** —— 看不到 10 张真实截图，拿不到 `summary.json`，跑不了 `audit/harness/run.cjs`（因为整个 `audit/` 目录不会被 clone 下来）。
3. **`git status --short` 也不会显示 `audit/` 下的任何新增/修改文件** —— 这是**设计如此，不是文件丢失**。判读 `git status` 时**不要**因为看不到 `audit/` 产物就以为它们没生成。
4. **保护对象是真实聊天内容**：截图里含真实好友昵称、真实消息文本（例：`/analytics/private/view` 的 Top20 排行含真实昵称与消息量；`/annual-report/view` 含 `53,116` 条消息与「深夜陪你聊天最多的人」）。`summarize.json` 的 `bodyTextHead` 字段同样含真实文本。

**处理建议**（未实施，留给接手者决策）：
- 若要**保留证据**：需另行归档（压缩包 / 私有存储），或把 `audit/` 中**不含真实数据的部分**（`harness/`、报告类 `.md`）单独提出来纳入版本控制，**截图与 `bodyTextHead` 必须留在库外**。
- 若要**分享复现能力**：至少把 `audit/harness/` 独立成可分发目录，并附一份「截图不在库中」的说明。
- **绝对不要把 `audit/raw/*.png`、`audit/raw/*.json`、`audit/raw-negative/` 解除忽略后提交。**

---

## 5. 环境事实

### 5.1 微信客户端与数据

| 项 | 值 | 出处 |
|---|---|---|
| 微信版本 | **v4.1.8.107**（运行时，验收期间保持在运行状态） | `msg-supervisor-notes.md:66`；`VISUAL_AUDIT.md:5` |
| 数据根目录 | `E:\Tool_zone\Tencent\WeChat\xwechat_files` | `%APPDATA%\msg\WeFlow-config.json` 的 `dbPath`；`audit/raw/harness-env.json` |
| 同目录下另有 | `E:\Tool_zone\Tencent\WeChat\WeChat Files`（旧版微信目录，本项目未使用） | 本机目录枚举 |
| 账号 1 | `wxid_l63apcsdl9nl22_eda4` | `msg-supervisor-notes.md:66` |
| 账号 2（**本轮全部运行时取证使用这个**） | `wxid_xx1zzo5hut8e22_8c04` | `VISUAL_AUDIT.md:5`；`WeFlow-config.json` 的 `myWxid` |
| 账号 1 状态 | 连接返回 `-3`，**可能仅因未登录**（`status.md:149` 遗留项） | `status.md:108,149` |
| 真实库可连证明 | `logs/wcdb.log` 2026-09-11T08:26:44Z：`open ok handle=1`、**`contact count=3947`**、**12 分片** | `msg-supervisor-notes.md:68` |
| 微信程序安装路径 | **未由本文独立核实**（数据目录已核实，程序安装目录未查） | 见 §7 |
| 微信版本号来源 | **来自监督者台账，非本轮运行时独立读取** | 见 §7 |

### 5.2 应用配置存储位置

- **配置目录**：`%APPDATA%\msg\` → 实测 `C:\Users\Ourten\AppData\Roaming\msg`
- **配置文件**：`%APPDATA%\msg\WeFlow-config.json`（实测存在，**3,433 字节**，**116 个顶层字段**）
- **同名目录也存放**：`%APPDATA%\msg\logs\`（含 `wcdb.log`）
- 应用名解析：`app.getName() = 'msg'`，来自 `package.json` 的 `"name": "msg"`

### 5.3 `%APPDATA%\msg\WeFlow-config.json` 的关键字段（实测值）

**验收相关（决定「应用会不会自动连库」）**：

| 字段 | 实测值 | 为什么重要 |
|---|---|---|
| `onboardingDone` | `true` | 引导流程已完成 |
| `agreementAccepted` | `true` | 协议已接受 |
| `dbPath` | `E:\Tool_zone\Tencent\WeChat\xwechat_files` | 数据库根 |
| `myWxid` | `wxid_xx1zzo5hut8e22_8c04` | 当前主账号 |
| `decryptKey` | `safe:djEw…`（**存在、非空、已加密前缀 `safe:`**） | 有密钥才会自动连库 |
| `imageXorKey` / `imageAesKey` | 均存在（`safe:` 前缀） | 图片解密 |
| `authEnabled` | **`false`** | 无锁屏门禁，验收台不需过密码 |
| `analyticsExcludedUsernames` | `[]`（空） | 分析不含排除名单 |
| `wxidConfigs` | 含 `wxid_xx1zzo5hut8e22_8c04` 一套独立 `decryptKey`/`imageXorKey`/`imageAesKey`（`updatedAt: 1783709309842`） | 多账号配置 |
| `theme` / `themeId` | `system` / `cloud-dancer` | — |
| `language` | `zh-CN` | 纯中文版 |

**AI 相关（本轮验收中直接决定了页面的空态与不可用）**：

| 字段 | 实测值 | 影响 |
|---|---|---|
| `aiInsightEnabled` | **`false`** | 直接导致 `/insight-inbox` 显示 `共 0 条 … 暂无见解`（属**配置导致的真空态**，非渲染故障） |
| `aiFootprintEnabled` | **`false`** | 足迹页 AI 总结按钮不可用（未覆盖） |
| `aiGroupSummaryEnabled` | `false` | — |
| `aiMessageInsightEnabled` | `false` | — |
| `aiModelApiBaseUrl` / `aiModelApiKey` | 均为**空字符串** | **无 API Key → `insightService.ts:872-875` 直接失败**（`请先填写通用 AI 模型配置（API 地址和 Key）`） |
| `aiModelApiModel` | `gpt-4o-mini` | — |
| `aiInsightApiBaseUrl` / `aiInsightApiKey` | 均为空 | 同上 |

**其它可能影响验收的字段**：`logEnabled=false`、`silentStartup=false`、`notificationEnabled=true`、`windowCloseBehavior="ask"`、`httpApiEnabled=false`（`httpApiPort=5031`、`httpApiHost=127.0.0.1`）、`analyticsConsent=true`、`launchAtStartup=false`。

> **安全提示**：该文件含 `decryptKey` 等敏感值（虽带 `safe:` 前缀，仍属密钥材料）。**不要把它提交或外传。** 本文只摘录字段名与非敏感值。

### 5.4 运行时环境实测（`audit/raw/harness-env.json`）

```json
{ "electron": "43.0.0", "node": "24.17.0", "chrome": "150.0.7871.46",
  "appName": "msg",
  "appPath": "E:\\Code_zone\\Msg_weflow",
  "userData": "C:\\Users\\Ourten\\AppData\\Roaming\\msg",
  "isPackaged": false,
  "resourcesPath": "E:\\Code_zone\\Msg_weflow\\node_modules\\electron\\dist\\resources",
  "configExists": true, "onboardingDone": true, "authEnabled": false,
  "hasDecryptKey": true, "hasImageXorKey": true, "hasImageAesKey": true }
```

**主窗口尺寸**：1400×902（截图 2100×1353，**设备缩放 1.5×**）。**本轮只测了单一窗口尺寸**，未测最大化/其它尺寸（`RUNTIME_FINDINGS.md:194`）。

### 5.5 ⚠️ 时间基准不一致（核对 mtime 时必读）

本机存在**两个时间口径**，核对文件 mtime 时会撞上：

| 口径 | 值 | 来源 |
|---|---|---|
| 本轮验收报告标注的时间 | **2026-09-11** 16:28 → 17:0x | `audit/RUNTIME_FINDINGS.md:6`、`STATIC_FINDINGS.md:12` 等各报告的开工/完工时间 |
| 文件系统 mtime（本文撰写时实测） | `HANDOVER.md` 与 `NEXT-STEPS.md` 均显示 **2026/9/16 0:07** | `Get-ChildItem .claude` |

**即：文件系统时钟比报告里的时间戳晚约 4~5 天。** 验收期间的产物 mtime（如 `audit/VISUAL_AUDIT.md` = `2026/9/11 16:52:56` 等）与报告自述一致；但**交接文档撰写期间的系统时钟已跳到 2026/9/16**。
**→ 判读 mtime 时不要用「2026-09-11」去卡本文档与 `NEXT-STEPS.md` 的写入时间。** 本文作者未核实时钟跳变的原因。

### 5.6 10 条可视化路由清单

`/analytics`、`/analytics/private`、`/analytics/private/view`、`/analytics/group`、`/annual-report`、`/annual-report/view`、`/dual-report`、`/dual-report/view`、`/footprint`、`/insight-inbox`

定义位置：`src/App.tsx:782-792` 与 `:796`；另有 **2 条重定向别名** `:786`、`:787`。
**全部受 `src/components/RouteGuard.tsx:14,20` 的 `isDbConnected` 门禁。**
各路由特征锚点（`RUNTIME_FINDINGS.md:56-67`）：`.analytics-hub` / `.analytics-welcome-shell` / `.analytics-page-shell` / `.group-analytics-shell` / `.annual-report-page` / `.annual-report-window` / `.dual-report-page` / — / `.my-footprint-page` / `.insight-inbox-page`。

---

## 6. 已知的坑与陷阱

> 这一节是本轮最「值钱」的部分之一 —— 全是**踩过并付出代价**才得到的教训。**复跑或接手时请逐条读完再动手。**

### 6.1 ⚠️ 反向验证不能用大小写变体（react-router v6 `matchPath` 默认 `caseSensitive=false`）

**任务书 v1 曾要求**：把 `/analytics/private/view` 改成 `/analytics/private/VIEW` 作为反向验证。
**Agent B 实测：这一改仍然全绿。**

原因：**react-router v6 的 `matchPath` 默认 `caseSensitive=false`** —— 大小写变体匹配同一路由并正常渲染（该轮实测 `#/analytics/private/VIEW` 拿到 **4/4 canvas**）。
（`RUNTIME_FINDINGS.md:168-171`；`VISUAL_AUDIT.md:329-331`）

**必须改用真拼写错误**（B 用 `/analytics/private/viwe`）才能验通。原始留档：
`audit/harness/logs/negative-CASE-mutation.log`（失败的第一版）、`audit/harness/logs/negative-typo-mutation.log`（成功的第二版）。

**反向验证红→绿原始输出**（真拼写错误那一轮）：
```
[harness] FAIL  #/analytics/private/viwe final=#/analytics/private/viwe entered=false state=unmatched canvas=0/4 t=8095ms
[harness]       reason: 未能进入：hash 保持 #/analytics/private/viwe 但页面锚点 .analytics-page-shell 不存在
[harness] NEGATIVE-MODE: mutated route = /analytics/private/viwe -> FAIL(已正确记为失败) ✔
[console.warn] No routes matched location "/analytics/private/viwe"（×2）
```
**判定口径**：`--negative` 下，验收台只有在**把改错的那条路由判为 FAIL** 时才退出 0（证明有鉴别力），否则退出 5。

**顺带的方法论结论**：**只看 `location.hash` 会出假绿灯** —— 未匹配的路径 hash 不会变。必须用「hash 相符 **且** 页面特征锚点存在」双条件。

---

### 6.2 ⚠️ `git grep` 不带扩展名限定会匹配**二进制文件**，造成假阳性

**实例**：`electron/assets/wasm/wasm_video_decode.wasm` 的字节流里恰好含 `radar` / `histogram` / `messageLength` / `personality` 等字母序列。

**后果**：`git grep ... -- src electron`（不带 pathspec 扩展名限定）会返回 **exit=0**，被误判为「有命中」，从而**推翻正确的「不存在」结论**。

**正确姿势**（`VISUAL_AUDIT.md:145-152`）：
```bash
git grep -n -E "\b(radar|histogram|messageLength|personality)\b" -- 'src/**/*.ts' 'src/**/*.tsx' 'electron/**/*.ts' 'electron/**/*.tsx'
# 逐词 exit=1 = 0 命中
# 对照组：git grep -n "\becharts\b" -- 'src/**/*.tsx' 应能命中，证明姿势有效
```

**注意**：`git grep` 只搜**已跟踪**文件。本轮 4 个目标文件均已确认被跟踪（`git ls-files -- src/assets/gw` 有输出），所以「0 命中」不是因为搜不到。

---

### 6.3 ⚠️ `git grep -i` 是**子串**匹配，短词必须加 `\b`

**实例**：
- 搜 `lunr` → 命中 **`initialUnread`**、`unreadCount`
- 搜 `amap` → 命中 **`MetaMap`**、`privateSessionMetaMap`、`mentionGroupMetaMap`、`mediaMap`、`itemMetaMapRef`

**后果**：不带词边界搜 `amap` / `lunr` 会返回 **30+ 条假阳性**。Agent A **第一次跑就中招了**，已用 `\b` 词边界重跑并更正（`STATIC_FINDINGS.md:500-502` 有完整踩坑记录）。

**正确姿势**：
```bash
git grep -n -i -E "\bflatpickr\b" -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.css" "*.scss" "*.json" "*.html"   # EXIT=1
git grep -n -i -E "\blunr\b"      -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.css" "*.scss" "*.json" "*.html"   # EXIT=1
git grep -n -i -E "\bamap\b"      -- "*.ts" "*.tsx" "*.js" "*.jsx" "*.css" "*.scss" "*.json" "*.html"
```

---

### 6.4 ⚠️ 本机 PATH **没有 `rg`**，须用 `git grep`（**exit 1 = 0 命中**）

- `Get-Command rg` **无输出** → 本机没装 ripgrep。
- 本轮**所有「0 命中」结论都是用 `git grep` 得出的**。
- **`git grep` 的退出码语义**：**exit 0 = 有命中；exit 1 = 0 命中**（不是错误！）。**判读时不要把 exit 1 当成命令失败。**
- 复现前置三行（`STATIC_FINDINGS.md:15-18`）：
  1. 本机 PATH 上没有 `rg`
  2. 一切命令在 `E:\Code_zone\Msg_weflow` 下执行；`git grep` exit 1 = 0 命中
  3. `git grep` 只搜已跟踪文件
- **不要**用 `Select-String -Path <dir> -Recurse` 代替：那会扫进 `node_modules` 和二进制文件，结果不可比。

---

### 6.5 ⚠️ CDP 远程调试在本应用上**不可用**，必须用 `NODE_OPTIONS=--require` 注入真实主进程

**现象**（`msg-supervisor-notes.md:69`）：
`--remote-debugging-port=9222` —— **端口确实在听，但 `/json/version`、`/json/list`、`/json` 全部返回 404。**

→ **所有基于 CDP 的常规 Electron 自动化（Playwright / puppeteer-core 连接 9222）在本应用上全部走不通。**

**可行方案**（Agent B 采用，已验证可重复运行）：
```powershell
$env:NODE_OPTIONS = "--require E:\Code_zone\Msg_weflow\audit\harness\inject.cjs"
& "E:\Code_zone\Msg_weflow\node_modules\electron\dist\electron.exe" .
```
把驱动器**注入真实应用主进程**，再由 `inject.cjs` 用 `BrowserWindow.getAllWindows()` / `webContents.executeJavaScript()` / `capturePage()` 取证。这样 `app.getName()='msg'`、`userData=%APPDATA%\msg`、`isPackaged=false`，**与用户双击启动一致**。

**⚠️ 监督者自查出的方法论隐患（原样保留，别当成已确认的 bug）**（`msg-supervisor-notes.md:71`）：
> `electron <包装脚本>` 方式下 `app.getAppPath()` / `userData` **可能与真实启动不同**。实证：探针确实写入了 `%APPDATA%\msg\logs\wcdb.log`（08:26:44Z，本地 16:26:44，与探针时刻吻合），说明 name 解析到了项目 `package.json` 的 `"name": "msg"`，路径正确。**但「卡在 onboarding 窗口」这一观察是否是真缺陷，取决于启动方式**，须由 Agent B 的真实入口注入法（`NODE_OPTIONS=--require` + `electron .`）定论。**M4 报告里不得把此条写成已确认 bug。**

→ **结论：`electron <包装脚本>` 这个骨架（`audit/_probe.cjs`）只作参考，不要作为取证依据。** 正式取证用 `audit/harness/run.cjs`。

---

### 6.6 ⚠️ 「快照式验收」的两个系统性陷阱（都真实发生过）

**陷阱 1：截图过早 = 把加载态当空页。**
首轮十路由 `canvases: 0` 无一例外，`settleMs` 781~800ms 高度雷同 → 根因是 **790ms 固定等待**，而真实库的分析管线要扫 message 库、**耗时是秒级**。
直接证据（`bodyTextHead`）：`/analytics/private/view` 停在 `正在统计消息数据... 0%`、`/annual-report/view` 停在 `20%`、`/annual-report` 停在 `正在准备年度报告...`，且 `domProbe` 显示 `.chart-card: 0` —— **图表卡片尚未被创建**。
**→ 正确做法：事件驱动轮询等待，不用固定 sleep。**

**陷阱 2：ECharts 入场动画未播完 = 把动画中间帧当空白画布。**
Agent B 一度把 `AnalyticsPage#1`/`#2` 判为空白画布。加「**+2.5s 动画复测**」后：`#1` 方差 **5.37 → 2535.20**、`#2` **0 → 1696.80**。
**→ 正确做法：任何「canvas 是空的」判断，必须复测二次；判据用「不透明像素占比」（`opaqueRatio`），因为 ECharts 画布默认透明背景，`opaqueRatio=0` 才等价于「一个像素都没画」。**

**陷阱 3：互斥分支导致漏采。**
`GroupAnalyticsPage` 的 4 个 `<ReactECharts>` **分布在 4 个互斥分支**里（`GroupAnalyticsPage.tsx:1475/1490` memberAnalytics、`:1571` activeHours、`:1578` mediaStats），一次最多挂载 2 个。快照式验收**天然只能看到其中 1 个**。
**→ 正确做法：驱动真实 UI 逐个逼出**（B 的操作序列：点群 `.group-item` → 点「群聊活跃时段」→ `.back-btn` → 点「媒体内容统计」→ 返回 → 点「群成员详细分析」），每组单独截图 + 单独 JSON。
**页面初始态原文是 `请从左侧选择一个群聊进行分析`** —— `canvas:0` 的唯一解释是「没选群/没选功能」，**不是 ECharts 故障**。

---

### 6.7 ⚠️ 阈值过松 = 假绿灯（验收台自身的设计陷阱）

- **旧阈值** `variance>5 && colors>8` **挡不住加载中的空页** —— 两张近纯色截图（主色占比 99.4% / 99.7%）被判「通过」。
- **旧 `errorCount` 只统计控制台错误，漏掉页内错误文案** —— `/dual-report/view` 首轮显示 `Report Initialization Failed 缺少好友信息` 却记 `errorCount: 0`。
- **新阈值（v2）**：`variance ≥ 15` **且** `distinctColors ≥ 32`（精确 24bit）**且** `主色占比 ≤ 90%`，并拆成 `entry`/`full` 两道闸门。

**→ 教训：验收台本身也要被验收。** 一个「全绿」的结果，先问阈值是多少、有没有对照组。

---

### 6.8 ⚠️ 其它零散陷阱

| 坑 | 说明 |
|---|---|
| **`heatmap.js` 不是 ES 模块** | 全文无 `export` / `module.exports` → `import` 取不到任何东西；它是给 `<script>` 用的全局函数 |
| **`Message` vs `MessageRecord`** | `wordFrequencyService.ts:42` 的 `MessageRecord` 是**本地自定义类型**，与 `chatService.Message` **不兼容**；中间适配器全项目不存在。**这是接线的真正断点，不是 IPC** |
| **`execQuery` 不支持参数绑定** | `wcdbCore.ts:4064` TODO + `:4066` 注入风险警告；SQL 必须字面量拼接并自行转义 |
| **`sqlite` 的 `length()` 在 SQL 里可用，但列名要转义** | 仓库已有 `quoteSqlIdentifier`（`chatService.ts:11812` 用法） |
| **文档行数四种口径全对不上** | 字节 / 物理行 / 非空行 / 文档声称，**没有一种能复现 474/162/136/256**。引用行数时请注明口径 |
| **`.gitignore` 的 `M` 是监督者本人改的** | `VISUAL_AUDIT.md:278`：监督者于 **16:29:30** 亲手加入 `audit/` 忽略项。**Agent B 的报告里记为「被其它 agent 改过」，实为监督者所为** —— 别把它当成「有人乱改仓库」 |
| **`M package.json` 也不是本轮产生的** | mtime `2026/8/14 2:37`（**早于本次开工近一个月**），内容是新增 `smoke` / `verify:*` npm scripts |
| **`?? scripts/smoke-*.cjs` 是未跟踪文件** | `git diff --stat` 看不到未跟踪文件，所以「`scripts/` 为空」的判定不受影响；**但若改用 `git status` 判读，可能误判为污染** |

---

## 7. 未验证 / 存疑清单

> **本节严格区分「已确证」与「未验证」。** 任何推测都显式标注为推测，**不当事实使用**。

### 7.1 ✅ 已确证（可直接复现，可放心引用）

- ✅ 10 条可视化路由**全部真的进去了**（判定 = hash 相符 **且** 页面锚点存在，双条件），**控制台报错全为 0**（`errorCount: 0` × 10）
- ✅ **8/8 个 ECharts 实例全部画出真图**（每块 canvas 都有非零不透明像素；已用「+2.5s 复测」加固）
- ✅ `/analytics/private/view` 渲染出真实数据 `10.1万 总消息数 / 5.5万 发送 / 4.5万 接收 / 400 活跃天数`
- ✅ `/annual-report/view` **延长等待后完整渲染出年报**（**53,116 条消息，8.7 秒**，方差 934.94）
- ✅ 唯一失败项 `/dual-report/view` 已闭环为**正常守卫**：裸访问缺 `username` 参数才报「缺少好友信息」，**正常入口会自动带上**（`DualReportPage.tsx:67`）→ **非用户可遇缺陷**
- ✅ `activeDays` 唯一生产点 `analyticsService.ts:682`，唯一 UI 消费点 `AnalyticsPage.tsx:723-724`
- ✅ `src/assets/gw/report.css` + `heatmap.js` **零代码引用**（仅 `.claude/` 文档命中）
- ✅ `wordFrequencyService.ts` **零代码引用**，无 IPC / 无 preload / 无前端调用
- ✅ `DocxFormatter.ts` **零代码引用**，不在格式器列表与格式联合类型中
- ✅ `radar`/`雷达`/`大五`/`histogram`/`直方图`/`messageLength`/`personality`/`性格` **源码级 0 命中**
- ✅ `MBTI`/`Big5` **仅命中死文件 `report.css`**
- ✅ `monthlyDistribution`/`weekdayDistribution` **仅有类型声明，0 渲染点**
- ✅ `activityHeatmap` **仅出现在类型声明，从无读取或渲染**；而后端确实算出 7×24 矩阵
- ✅ `insightService.ts` 是 **LLM 自由文本服务**，非图表服务
- ✅ `wcdb_api.dll` / `WCDB.dll` 中 `personality`/`bigfive`/`mbti`/`radar`/`histogram` **各 0 命中**（**含对照组**：`aggregate_stats`=6、`exec_query`=2、`message_cursor`=9，证明搜索方法有效）
- ✅ 本仓库**无 `wcdb_api.dll` 的 C++ 源码**（全仓 `*.cpp/*.h/*.hpp/*.cc/*.c` 只找到 1 个无关 macOS 文件）
- ✅ `wcdb_api.dll` 导出 **109** 个 `wcdb_*`，`wcdbCore.ts` 绑定 **90** 个 → **19 个从未绑定**；**反向检查「已绑定但 DLL 找不到」= 0**
- ✅ 业务代码零改动（`git diff --stat -- src electron scripts .claude` 为空；整树 SHA256 开完工一致；HEAD 未变）

> 注：以上为 2026-09-11 时点结论；G1-G6/G12 接线（b0e4dfb）后，`activeDays`/`DocxFormatter`/`wordFrequencyService`/`activityHeatmap` 的「零引用」状态已改变，见各节「〔2026-10-09〕」批注。

### 7.2 ❓ 未验证（明确没查 / 查不到，**不许当事实**）

| # | 未验证项 | 卡在哪 | 出处 |
|---|---|---|---|
| 1 | **`d.monthly` 在原生路径下的 key 格式**（`MM` 还是 `YYYY-MM`） | `wcdb_api.dll` 为预编译二进制，仓库内无 C++ 源码，**静态不可判**。**这直接影响假指标的错误幅度一个数量级**（若是 `MM`，`activeMonths` 上限 12，`activeDays` 恒 ≤ 240） | `BLOCKED-A.md` B1；`STATIC_FINDINGS.md:605` |
| 2 | **冷缓存下年报耗时分布** | 本次 **8.7s 是单次样本**，可能受益于缓存；未测更大库 / 冷启动 | `VISUAL_AUDIT.md:260`；`RUNTIME_FINDINGS.md:190` |
| 3 | **`/insight-inbox` 开启 AI 后是否有内容** | `aiInsightEnabled=false`（且无 API Key），未开启验证 | `RUNTIME_FINDINGS.md:191` |
| 4 | **窗口尺寸仅测单一尺寸**（1400×902）；未测最大化/其它尺寸布局 | 时间盒 | `RUNTIME_FINDINGS.md:194` |
| 5 | **未覆盖**：导出/朋友圈/通讯录等**非可视化路由**；足迹页 AI 总结按钮（`aiFootprintEnabled=false`）；群聊分析的 `memberMessages`（成员消息筛选）分支 | 时间盒 | `RUNTIME_FINDINGS.md:195-196` |
| 6 | **`comparison-matrix.md` §10.1 聊天界面**（13+ 消息类型、Virtuoso、图片查看器、视频播放器、语音波形动画、Liquid Glass） | **未逐项清点** | `STATIC_FINDINGS.md:607` |
| 6b | **本机文件系统时钟比验收报告时间戳晚约 4~5 天**（报告写 2026-09-11，`HANDOVER.md` mtime 为 2026/9/16 0:07） | 未核实跳变原因 | 本文 §5.5 |
| 7 | **§10.4 的「年度报告 11 场景」「双人报告 9 场景」「7 套主题」「SNS 时间线 + 媒体网格 + 联系人过滤」「导出中心」** | **未逐项点数** | `STATIC_FINDINGS.md:608` |
| 8 | **§10.2 的「三栏布局」「虚化时间线」「12 种消息卡片样式」「分类过滤栏（8 类）」** | 已证明 flatpickr/lunr/高德 0 命中，但这四项 CSS/布局是否以其他形式实现，**未逐项核对** | `STATIC_FINDINGS.md:609` |
| 9 | **`CLAUDE.md` 的「80+ 操作」「30+ 路由 / 40+ 组件 / 9 个 Zustand store」** | **未点数** | `STATIC_FINDINGS.md:610` |
| 10 | **`wcdb_fetch_message_batch()` 返回的每个 row 是否逐行携带 `message_content`** | Agent C 受「不许启动应用」约束，未实机打印真实行字段。仅有间接证据（`apiMessageMapping.ts:547`、`wcdbCore.ts:2849-2862`、`chatService.ts:11804`） | `BLOCKED-C.md` B-1 |
| 11 | **原生 `wcdb_exec_query` 在 `kind='message'` 下是否限制语句类型**（是否只允许 SELECT、是否拒 DDL/DML） | 无 C++ 源码。**只观察到仓库内 40+ 处用法全部只读**（`SELECT` / `PRAGMA table_info`），**不能断言写操作被拒** | `BLOCKED-C.md` B-2 |
| 12 | **19 个未接线符号的签名与返回结构** | 无头文件 / 无 `.def` / 无源码 / 未反汇编；只从 DLL 的 ASCII 串确认**名字存在**且 `electron/` 下 0 引用 | `BLOCKED-C.md` B-3 |
| 13 | **ECharts 6.1.0 的 radar 组件是否被 tree-shaking 掉** | 未读 `node_modules` 里 `echarts-for-react` 的实际内部引入方式，故「radar 一定可用」**未实机验证** | `GAP_FEASIBILITY.md:427` |
| 14 | **前端 8 个 ECharts 实例之外是否还有通过 `echarts` 直接 `init()` 的图表** | 只 grep 了 `*.tsx`，可能存在 `.ts` 里的图表工具函数，**未穷尽** | `GAP_FEASIBILITY.md:429` |
| 15 | **`CLAUDE.md` 的「Dev + 打包均正常运行」「npm run dev 全链路正常」「打包模式 WCDB 许可校验通过」** | 静态任务明令禁止启动应用/跑 dev/跑 build，**静态不可判**；运行时任务只跑了 `electron.exe .`（未打包态），**未跑 `npm run build` 打包流程** | `STATIC_FINDINGS.md:595,606` |
| 16 | **`ResourcesPage` 解密链路 + 批量操作 UI** | 未检查 | `STATIC_FINDINGS.md:597` |
| 17 | **「部分图片解密失败」** | 属运行时现象，本轮未复核 | `STATIC_FINDINGS.md:598` |
| 18 | **`report.css` 与现有主题系统的实际冲突程度** | 「变量命名冲突」是**基于两边都存在 OKLCH design tokens 的推断**，**未做实际加载对比** | `STATIC_FINDINGS.md:611` |
| 19 | **微信客户端版本号 v4.1.8.107 与程序安装路径** | **本文作者未独立核实**；版本号来自监督者台账（`msg-supervisor-notes.md:66`），数据目录已由 `WeFlow-config.json` 的 `dbPath` 核实 | 本文 §5.1 |
| 20 | **`audit/A-static/*` 从 `E:\Learn_zone\audit\` 迁移到 `msg\audit\A-static\` 的动作由谁执行、内容是否有改动** | `BLOCKED-A.md:61-72` 记载作者原落点在工作区根。**本文未验证迁移过程** | 本文 §2.2 |

### 7.3 ❓ 存疑（证据指向但未闭环）

1. **`status.md:138`「WF ECharts 已覆盖 7 种图表」** —— 代码里只有 5 个 `ReactECharts` 渲染点（8 个实例，其中 2 个是同一 `getHourlyOption` 复用）。可能「7 种」把 `ReportHeatmap` / `ReportWordCloud` 也算进去了（5+2=7 恰好吻合），但 `ReportWordCloud.tsx` **并非 ECharts 实现**。**倾向认为该数字的口径不明，但不排除漏数。**（`STATIC_FINDINGS.md:614`）
2. **文档行数「474 / 162 / 136 / 256」与实测「462 / 168 / 142 / 312」全部不符** —— 已实测三种口径（字节 / 物理行 / 非空行）**没有一种能复现文档数字**。可能文档用的是「提取时的原始 Python 源行数」，也可能含/不含末尾换行。**列为存疑而非造假。**（`STATIC_FINDINGS.md:617`；`BLOCKED-A.md` B2）
3. **`wordFrequencyService.ts:60` `reindexArray` 未被调用** —— 是死代码，但**可能是有意留给接线后使用**。（`STATIC_FINDINGS.md:615`）
4. **`DocxFormatter` 是否被动态加载** —— 已用 `git grep -F "DocxFormatter"` 全仓搜过（仅文档 + 自身 2 处），**排除按名动态 import**；另 `git grep -i "docx" -- electron/services/export/types.ts electron/services/export/core/ExportContext.ts` = **EXIT=1**，**基本可排除**按 `'docx'` 字符串查表的注册机制。（`STATIC_FINDINGS.md:616`）

### 7.4 ❓ 悬而未决的运行时疑点（**唯一未闭环项**）

> **`0xC0000409` 退出码** —— 这是目前**唯一悬而未决的运行时疑点**，请优先处理。

- **现象（已确认）**：每轮验收收尾时子进程退出码 `3221226505`（`0xC0000409`，`STATUS_STACK_BUFFER_OVERRUN`）。
- **Agent B 的判断（明确标注为推断，未证实）**：验收台在原生 WCDB worker 仍持有句柄时调用 `app.exit()` 强制退出所致。
- **未排除**：**应用自身的退出路径也可能有同样问题。**
- **定性所需**：单独实验 —— **正常关窗退出 vs 强杀** 两种路径对比。
- **出处**：`BLOCKED-B.md` 第 2 项；`RUNTIME_FINDINGS.md:192-193`；`VISUAL_AUDIT.md:248`。〔2026-10-09：仍未定位，见 NEXT-STEPS G9〕

**另外两项待产品侧裁决（`BLOCKED-B.md` 第 3 项）**：
- **双人报告页出现 `0 NaN%`（疑除零）**：原文 `MUTUAL INITIATIVE 情感的天平 0 NaN% w 0 NaN%`。
  **⚠️ 但探针传的是 `myWxid`（自己对自己）**，双方发送量可能天然 0/0 → **不能据此判定为通用缺陷**。需用「自己 vs 真实好友」组合复测。
- **被 `*`/`X`/`#` 打散的昵称**：原文 `所有时1 年过二*/*1&wxiX-*#*/X*X-1/1/088#810`（真实昵称「年过二旬の小伙 / CallmeOurten」被打散）。**疑为隐私打码/占位渲染，未定位到代码**（时间盒外）。**不能判定为缺陷。**

---

## 8. 监督者犯过的两次误判与其更正

> **这一节必须读。** 两次误判**都是同一个思维错误**，而且**都是被证据推翻的**，不是被说服的。对后来者是重要警示。

### 8.1 两次误判的原文自述

`audit/VISUAL_AUDIT.md:19-21` 与 `:12` 原文：

> ⚠️ **我在运行时段判错过两次，均已更正**：① 首轮把「加载中」误判为「图表不渲染」（真因是 790ms 固定等待不够）；② 次轮把「我这轮没等到年报渲染」误判为「该页面永远不渲染内容」（真相是它需要 8.7 秒）。**两次都是把观测条件当成了观测对象。**

### 8.2 误判一：把「图表不渲染」当成结论

| 项 | 内容 |
|---|---|
| **当时的观测** | 首轮十路由 `canvases: 0` **无一例外**，`settleMs` 781~800ms **高度雷同** |
| **当时的结论** | 图表不渲染 |
| **真因** | **790ms 固定等待不够** —— 真实库的分析管线要扫 message 库，耗时是秒级 |
| **反证（当时就有、被忽略）** | `bodyTextHead` 里页面停在「正在统计消息数据... 0%」「正在准备年度报告... 20%」；`domProbe` 显示 `.chart-card: 0` —— **图表卡片尚未被创建**，这是「还没到」而不是「不会来」 |
| **更正后** | 改用**事件驱动轮询等待**：`/analytics/private/view` **4/4 canvas**，`/analytics/group` **1/1 canvas**，8/8 实例全部出图 |
| **教训** | **「雷同的测量值」本身就是测量系统有问题的信号**（10 条路由耗时 781~800ms 高度一致 = 有人在固定等待，而不是在等页面就绪） |

### 8.3 误判二：把「年报页永远不渲染」当成结论 —— **v1 已作废，以更正后为准**

> ⚠️ **本节是本轮最容易抄错的地方。`VISUAL_AUDIT.md` 的 v1 曾写下「两个报告页即使给足时间也不渲染内容」，该结论已作废。**

**`audit/VISUAL_AUDIT.md:77-80` 的「更正声明（v2）」原文**：

> **更正声明（v2）**：v1 我写下「两个报告页即使给足时间也不渲染内容」，依据是"等待策略修复后这两张截图像素纹丝不动"。
> **这个推断是错的** —— 那次测量取的是一个**中间状态**（B 当时尚未为这两个页面延长等待）。
> B 延长等待后：`annual-report/view` **完整渲染出年报**（53,116 条消息，**8.7 秒**，方差 934.94）。
> 我犯的错误是：**把"我这一轮没等到"当成了"它永远不会来"**。

**✅ 正确结论（以更正后为准）**：
- `/annual-report/view` **延长等待后渲染出完整年报** —— **53,116 条消息 / 8.7 秒**，方差 **934.94**，**PASS**
- **唯一失败项是 `/dual-report/view`**，且已闭环为**正常守卫**（`dual-report/view` 裸访问缺 `username` 参数 → 报「缺少好友信息」；正常入口 `DualReportPage.tsx:67` 会自动带上该参数）→ **非用户可遇缺陷**
- **四状态分布：已渲染完成 9 ｜ 加载超时 0 ｜ 页内错误 1 ｜ 真空白 0**

### 8.4 共同模式：**「把观测条件当成了观测对象」**

两次误判的**结构完全相同**：

```
观测到的：  我的测量装置在这一轮里没看到 X
错误推断：  X 不存在
真实情况：  我的测量装置还没等到 X（等待策略不足 / 采样时机不对）
```

**同一个模式在 Agent B 身上也发生过一次**（`VISUAL_AUDIT.md:239`、`RUNTIME_FINDINGS.md:15`）：
> **B 在此处也自我推翻过一次**：它一度把 `AnalyticsPage#1`/`#2` 判为空白画布，加「+2.5s 动画复测」后发现那是 **ECharts 入场动画未播完**（#1 方差 5.37→2535.20、#2 0→1696.80）。

### 8.5 给后来者的操作规约（从这两次误判里提炼）

1. **任何「X 不存在 / X 坏了」的结论，先问：我给了 X 多少时间？**
2. **固定 sleep 是危险的** —— 真实微信库的分析管线耗时是**秒级到十秒级**（`/annual-report/view` 需要 **8.7 秒**）。用**事件驱动轮询**（等 DOM 锚点 / 等渲染完成信号），不要用固定等待。
3. **测量值"高度雷同"是测量系统有问题的信号**，不是「稳定的真相」。
4. **对像素/画布类结论，必须二次复测**（动画、懒加载、异步渲染都会骗过单次快照）。
5. **对「0 命中」类结论，必须有对照组**（本轮的做法：搜 `personality`=0 的同时搜 `aggregate_stats`=6，证明搜索姿势有效）。
6. **区分「我的这一轮没观测到」与「客观上不存在」** —— 前者是观测条件问题，后者需要独立证据。

---

## 附录 A：复现命令速查

### A.1 运行时验收台（Agent B 交付，可重复运行）

```powershell
cd E:\Code_zone\Msg_weflow
node audit/harness/run.cjs                 # entry 闸门 → GREEN，退出码 0
node audit/harness/run.cjs --gate=full     # 严格闸门 → RED 9/10（唯一失败为正常守卫）
node audit/harness/run.cjs --negative      # 反向验证 → 退出 0 且把错路径判 FAIL
```
> ⚠️ 前置：微信 v4.1.8.107 需在运行状态；`%APPDATA%\msg\WeFlow-config.json` 需含 `dbPath`/`decryptKey`/`myWxid`。
> ⚠️ **2026-10-09 起 DB 停摆（`-101`），此验收台需 DB 恢复后才有意义**（KNOWN-STATE）。
> ⚠️ **`audit/` 不会随仓库 clone 下来**（见 §4.3）—— 换机器需重新获取整个 `audit/harness/`。

### A.2 PNG 像素独立复算（.NET，不依赖 npm 包）

```powershell
Add-Type -AssemblyName System.Drawing
cd E:\Code_zone\Msg_weflow\audit\raw
foreach ($f in (Get-ChildItem -Filter '*.png')) {
  $b=[System.Drawing.Bitmap]::FromFile($f.FullName)
  $sum=0.0;$sum2=0.0;$n=0;$c=@{}
  for($y=0;$y -lt $b.Height;$y+=7){for($x=0;$x -lt $b.Width;$x+=7){
    $p=$b.GetPixel($x,$y);$l=0.299*$p.R+0.587*$p.G+0.114*$p.B
    $sum+=$l;$sum2+=$l*$l;$n++;$k="$($p.R),$($p.G),$($p.B)"
    if($c.ContainsKey($k)){$c[$k]++}else{$c[$k]=1}}}
  $m=$sum/$n
  "{0} mean={1:N1} var={2:N1} colors={3}" -f $f.Name,$m,(($sum2/$n)-$m*$m),$c.Count
  $b.Dispose()
}
```
> 用 .NET 独立复算的意义：**与 Electron 侧采样的误差 < 1%**，构成两种独立采样的互证（`VISUAL_AUDIT.md:97`）。

### A.3 原生 DLL 关键词扫描（**必须带对照组**）

```powershell
$dll='E:\Code_zone\Msg_weflow\resources\wcdb\win32\x64\wcdb_api.dll'
$b=[System.IO.File]::ReadAllBytes($dll)
$a=-join($b|%{if($_ -ge 32 -and $_ -lt 127){[char]$_}else{"`n"}})
foreach($k in 'personality','bigfive','mbti','radar','aggregate_stats','exec_query'){
  "{0,-16} {1}" -f $k,([regex]::Matches($a,[regex]::Escape($k),'IgnoreCase')).Count }
# 期望：personality=0 bigfive=0 mbti=0 radar=0 | aggregate_stats=6 exec_query=2  ← 后两个是「搜索有效」的对照
```

### A.4 完整复现套件

- Agent C 提供的**整段可直接粘贴的 pwsh 复现脚本**（DLL 扫描 / 109-90=19 符号对比 / 19 符号 0 引用 / `analyticsService` 字段核查 / 渲染层复用点）：见 `audit/GAP_FEASIBILITY.md:433-483`（约 30 秒跑完）。
- Agent A 的**全部原始输出**：`audit/A-static/raw-static/evidence.txt`。

### A.5 关键统计的取数命令

```powershell
# 「400 活跃天数」的原始文本
(Get-Content audit\raw\summary.json -Raw | ConvertFrom-Json).routes |
  ? id -eq 'analytics-private-view' | % bodyTextHead

# 全量 totals / 阈值
(Get-Content audit\raw\summary.json -Raw | ConvertFrom-Json).totals
(Get-Content audit\raw\summary.json -Raw | ConvertFrom-Json).thresholds
```

---

## 附录 B：文件与行号索引（本文引用过的全部出处）

| 出处 | 内容 |
|---|---|
| `audit/VISUAL_AUDIT.md:12,19-23` | 一句话总评 + 两次误判自述 |
| `audit/VISUAL_AUDIT.md:27-31` | 结论条数说明（20 条编号 + B6 延续；偏离 ≤15 条的声明） |
| `audit/VISUAL_AUDIT.md:35-110` | A1-A7 运行时结论 |
| `audit/VISUAL_AUDIT.md:77-80` | **A6 更正声明（v2）** ← 最重要 |
| `audit/VISUAL_AUDIT.md:101-106` | A6b `dual-report/view` 闭环 + 阈值收紧 |
| `audit/VISUAL_AUDIT.md:114-158` | B1-B6 静态缺口 |
| `audit/VISUAL_AUDIT.md:160-187` | C1-C5 文档声称三分类 |
| `audit/VISUAL_AUDIT.md:189-204` | D1-D3 缺口可达性 |
| `audit/VISUAL_AUDIT.md:245-249` | 运行时缺陷三条（托盘降级 / PATH 裁剪 / 0xC0000409） |
| `audit/VISUAL_AUDIT.md:253-265` | 未验证与存疑 |
| `audit/VISUAL_AUDIT.md:269-279` | 约束与合规（指纹 / 既存改动 / `.gitignore` 是监督者改的） |
| `audit/VISUAL_AUDIT.md:294-339` | 复现脚本 + 反向验证踩坑 |
| `audit/RUNTIME_FINDINGS.md:31-50` | 命令面 / 双闸门 / 阈值 / 双条件判定 |
| `audit/RUNTIME_FINDINGS.md:56-67` | 逐路由结果表（含锚点） |
| `audit/RUNTIME_FINDINGS.md:91-124` | 8 个 ECharts 实例逐个取证 |
| `audit/RUNTIME_FINDINGS.md:128-162` | 控制台报错汇总 + 托盘缺陷成因 |
| `audit/RUNTIME_FINDINGS.md:166-177` | 反向验证两版 |
| `audit/RUNTIME_FINDINGS.md:181-196` | 未验证清单 8 条 |
| `audit/A-static/STATIC_FINDINGS.md:22-125` | §1 假指标 activeDays |
| `audit/A-static/STATIC_FINDINGS.md:129-217` | §2 死资源 gw/ |
| `audit/A-static/STATIC_FINDINGS.md:221-316` | §3 孤儿 wordFrequencyService |
| `audit/A-static/STATIC_FINDINGS.md:320-456` | §4 不存在的图表 + `insightService` 剖析 |
| `audit/A-static/STATIC_FINDINGS.md:460-598` | §5 文档声称核对 |
| `audit/A-static/STATIC_FINDINGS.md:602-628` | §6 未验证 / 存疑 / 已确认 |
| `audit/A-static/STATIC_FINDINGS.md:634-662` | §7 自检 + 耗时 |
| `audit/GAP_FEASIBILITY.md:3-7` | 两句话结论 |
| `audit/GAP_FEASIBILITY.md:13-99` | §1 数据源 + `onRow` 只读 4 字段 |
| `audit/GAP_FEASIBILITY.md:157-300` | §2 原生命中面（109/90/19）+ DLL 字节扫描 |
| `audit/GAP_FEASIBILITY.md:306-349` | §3.1 直方图可达（4 文件路径） |
| `audit/GAP_FEASIBILITY.md:351-415` | §3.2 雷达图可达（产品决策点） |
| `audit/GAP_FEASIBILITY.md:419-429` | §4 禁止估算声明 |
| `audit/GAP_FEASIBILITY.md:433-483` | 附：整段复现脚本 |
| `audit/BLOCKED-B.md` | 运行时侧 4 项待裁决 |
| `audit/BLOCKED-C.md` | B-1~B-4 待裁决 |
| `audit/A-static/BLOCKED-A.md` | B1~B6 待裁决（含文件落点迁移记录） |
| `E:\Learn_zone\.msg-supervisor-notes.md:5-14` | 冻结基线 |
| `E:\Learn_zone\.msg-supervisor-notes.md:16-22` | M0 实测基线 |
| `E:\Learn_zone\.msg-supervisor-notes.md:24-63` | 独立核实的答案键 + 环境事实 |
| `E:\Learn_zone\.msg-supervisor-notes.md:65-72` | 环境事实 + CDP 不可用 + 包装脚本隐患自查 |
| `E:\Learn_zone\.msg-supervisor-notes.md:74-79` | **暗卷 5 条** |
| `E:\Learn_zone\.msg-supervisor-notes.md:81-91` | M4 合并计划 |
| `msg/CLAUDE.md` | 项目定位 / 关键决策 / 阶段 0-7 |
| `msg/.claude/status.md:110-121` | 阶段 6 移植表格（三条 ✅） |
| `msg/.claude/status.md:123-142` | 阶段 6 前置分析（跳过的 5 项） |
| `msg/.claude/plan.md:218-226` | 阶段 6 任务表 |
| `msg/.gitignore:40` | `audit/` 忽略项 |
| `%APPDATA%\msg\WeFlow-config.json` | 应用配置（116 字段） |
| `audit/raw/harness-env.json` | 运行时环境实测 |
| `audit/raw/summary.json` | 逐路由原始数据（10 条） |
| `audit/verify/KNOWN-STATE-2026-10-09.md` | **2026-10-09 数据层停摆全记录**（新增，必读） |
| `audit/verify/UPSTREAM-PORT-CANDIDATES.md` | **2026-10-09 上游移植候选**（新增，必读） |

---

## 附录 C：本文自身的边界声明

- 本文由**交接文档 agent** 撰写，**不是**监督者或三名执行 agent 写的。
- 本文的**全部内容都是对上述材料的整理与交叉引用**，未新增任何未列出的实验。
- **本文未修改任何业务代码或既有文档**（约束见 §2.1）。
- **本文未独立核实**的项已在 §7.2 第 19、20 条显式标出。
- 本文**已剔除** `audit/VISUAL_AUDIT.md` 的 v1 作废结论（「两个报告页永远不渲染内容」），**以 v2 更正后结论为准**（见 §8.3）。
- 与本文**并行**产出的 `msg\.claude\NEXT-STEPS.md`（待办与构造计划，另一名 agent 撰写）**不在本文的引用范围内**，两份文件互不依赖。
- 2026-10-09 文档大清理：项目路径已统一为 `E:\Code_zone\Msg_weflow`；各节新增「〔2026-10-09〕」批注为当日状态更新，原 2026-09-11 结论保留作历史对照。
