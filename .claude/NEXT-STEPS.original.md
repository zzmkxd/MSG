# NEXT-STEPS.md — MSG 可视化层「待办与构造计划」

生成：2026-09 ｜ 依据：`audit/VISUAL_AUDIT.md`（验收总报告）+ `audit/GAP_FEASIBILITY.md` + `audit/A-static/STATIC_FINDINGS.md` + `audit/RUNTIME_FINDINGS.md` + 三份 BLOCKED 清单
本文件只讲**接下来干什么、怎么干**；"现在是什么状态"见并行产出的 `.claude/HANDOVER.md`。
**本文件撰写期间未改任何业务代码**，所有路径:行号均在仓库内实测确认（未确认的一律标注「待核实」）。

> **2026-10-09 更新（读本文件前先读）**：
> ① **数据访问层停摆**：`wcdb_api.dll` `InitProtection()` 全 `-101`、`welive.exe` 报 `this build has expired`（根因厂商侧）；`wx_key.dll` 干净。应用可启动，但所有 DB 依赖功能 blocked、全部运行时验收搁置。必读 `audit/verify/KNOWN-STATE-2026-10-09.md`。
> ② **G1-G6/G12 已接线完成**（提交 b0e4dfb）；2026-09-16 实测：`activeDays=557`、直方图 `sum=71,707==total`、热力图 `.h-cell=168`、词频 `scanned=15,437`。DOCX 端到端**未验**。
> ③ **决策**：不做 AI/LLM；不做人格/MBTI → **G7 取消**；**G5 死资源 `src/assets/gw/*` 已解锁**（可删除/归档，Big5/MBTI 段无未来用途）。
> ④ **新主线 = 上游移植候选**：103 文件分级、28 文件可移植（批次 0-5）、40.6% 排除；`wxid`→`accountId` 改名不可照抄；上游 ABI 改名与本机 DLL 不匹配。必读 `audit/verify/UPSTREAM-PORT-CANDIDATES.md`。

---

## 0. 速览

**12 条待办（2026-10-09 状态）：已完成 7 ｜ 已裁决 1 ｜ 已取消 1 ｜ 未确认 2 ｜ 已随修落地 1。**

| # | 待办 | 分区 | 状态（2026-10-09） |
|---|---|---|---|
| G1 | 接线 DOCX 导出 | 可立即开工 | ✅ 已接线（b0e4dfb）；E2E 未验（停摆阻断） |
| G2 | 修假指标 `activeDays` | 可立即开工 | ✅ 已修复（实测 557 天，修复前假值 400） |
| G3 | 消息长度直方图 | 可立即开工 | ✅ 已做（直方图自洽，空桶 0） |
| G4 | 年度报告热力图死数据接线 | 可立即开工 | ✅ 已接线（`.h-cell=168`，严格 7×24） |
| G6 | 孤儿服务 `wordFrequencyService` 接线（词云） | 可立即开工 | ✅ 已接线（`scanned=15,437`） |
| G12 | 托盘图标未打包态回退（可选） | 可立即开工 | ✅ 已做（PASS） |
| G5 | 死资源 `src/assets/gw/*` 处置 | 已裁决 | ✅ **2026-10-09 已解锁：删除或归档**（Big5/MBTI 段无未来用途） |
| G7 | 大五人格雷达图 | 已取消 | ❌ **2026-10-09 决策取消**（不做人格/MBTI） |
| G8 | 双人报告 `0 NaN%` + 掩码昵称 | 需先拍板 | 未确认（复测受 DB 停摆阻断） |
| G11 | 文档债三处修正 | 需先拍板 | ✅ 已裁决并修正（2026-10-09：以 status.md 为准 + 行数订正，见本文件与 status.md） |
| G9 | 退出码 `0xC0000409` 定位 | 需先调查 | 未确认 |
| G10 | `d.monthly` 原生路径 key 格式 | 需先调查 | 已随 G2 落地；原生 key 格式未单独记录（未确认） |

**当前主线（2026-10-09）**：① 原生组件无本地修复手段，DB 依赖验收全部搁置；② 上游移植候选（批次 0-5）为新主线；③ G5 清理执行。见 §4。

---

## 1. 可立即开工（6 条 · 无需任何产品决策）

### G1 接线 DOCX 导出 —— 【接线】✅ 已接线（2026-10-09 b0e4dfb；E2E 未验，受停摆阻断）

**现状证据（已实测）**
- 格式器本体已写好且完整：`electron/services/export/formatters/DocxFormatter.ts`（312 行，`export class DocxFormatter` 在 `:65`，`export()` 五参签名 `:68-74` 与其他格式器一致）。
- 编排器只装载 8 个格式器：`electron/services/export/core/ExportOrchestrator.ts:36-43` 的 import 区**没有 `DocxFormatter`**；`:52-111` 是 8 个 `exportSessionToXxx()` 方法，**没有 `exportSessionToDocx()`**；批量分发 `:429-447` 的 if-else 链里没有 `docx` 分支，落到 `:445-446` 的 `不支持的格式` 兜底。
- 格式 id 联合类型里没有 `'docx'`：`electron/services/export/types.ts:66`（10 个 id）、`src/types/electron.d.ts:1712`、`src/pages/Export/types.ts:35-45`。
- 导出菜单格式列表**没有 DOCX 项**：`src/pages/Export/constants.ts:43-54`（`formatOptions` 10 项）；另有第二份同样的列表 `src/components/Export/ExportDefaultsSettingsForm.tsx:40-43` 与第三份 `src/pages/GroupAnalyticsPage.tsx:233-238`（群成员导出）。
- 扩展名映射也缺：`electron/exportWorker.ts:310-319`（`getFormatExtension`）与 `ExportOrchestrator.ts:382-389`（批量路径 ext 推导）都是 if 链，无 `docx` 时**静默落 `.json`**。
- 单会话分发：`electron/exportWorker.ts:443-469`（`if (format === '...')` 链，无 docx → 落到 ChatLab 兜底 `:469`）。

**关键好消息（本次新核实，降低了成本）**：`DocxFormatter` 构造参数是 `exportService: any`（`:66`），其内部调用的 15 个上下文方法（`throwIfStopRequested`/`ensureConnected`/`getConfiguredMyWxid`/`getContactInfo`/`resolveCollectParams`/`createCollectProgressReporter`/`collectMessages`/`buildNoMessagesError`/`hydrateEmojiCaptionsForMessages`/`resolveQuotedMessagesForExport`/`preloadContacts`/`getMediaLayout`/`collectMediaMessagesForExport`/`preloadMediaLookupCaches`/`getClampedConcurrency`/`getMediaCacheKey`/`exportMediaForMessage`/`isStopError`/`isPauseError`）**全部存在于 `electron/services/export/core/ExportContext.ts`**（对应行：`:115 :238 :252 :266 :296 :824 :952 :1046 :1237 :1333 :1357 :1429 :2299 :2781 :3130 :4047 :4119 :4412 :4834`）。→ **不需要写适配层**，把 `this.context` 传进去即可。
- `docx@^9.7.1` 已在 `package.json:25` 声明为 dependencies，**无新依赖**。

**改动点（12 处 / 去重后 8 个文件）**

| # | 文件 | 位置 | 改什么 |
|---|---|---|---|
| 1 | `electron/services/export/core/ExportOrchestrator.ts` | `:43` 后 | 加 `import { DocxFormatter } from '../formatters/DocxFormatter';` |
| 2 | 同上 | `:111` 后 | 加 `async exportSessionToDocx(...)`，五行照抄 `:108-111` 的 SqlFormatter 版本，只换类名 |
| 3 | 同上 | `:382-389` | ext 链加 `else if (effectiveOptions.format === 'docx') ext = '.docx'`（**漏了会导出成 `.json` 文件名**） |
| 4 | 同上 | `:443-447` | 批量分发 if 链加 `docx` 分支 |
| 5 | `electron/exportWorker.ts` | `:310-319` | `getFormatExtension` 加 `if (format === 'docx') return '.docx'` |
| 6 | 同上 | `:468` 前 | 单会话分发加 `if (format === 'docx') return ...exportSessionToDocx(...)` |
| 7 | `electron/services/export/types.ts` | `:66` | union 末尾加 `\| 'docx'` |
| 8 | `src/types/electron.d.ts` | `:1712` | 同 7 |
| 9 | `src/pages/Export/types.ts` | `:45` 后 | 同 7 |
| 10 | `src/pages/Export/constants.ts` | `:53` 后 | `formatOptions` 加 `{ value: 'docx', label: 'DOCX', desc: 'Word 文档，聊天气泡排版' }` |
| 11 | `src/components/Export/ExportDefaultsSettingsForm.tsx` | `:43` 后 | 同 10（默认格式下拉） |
| 12 | `src/pages/GroupAnalyticsPage.tsx` | `:41` + `:238` | `MemberExportFormat` union + 选项列表同步加 docx（**群成员导出也要一致，否则群导出选不到**） |

> 注：表里 12 处 → 去重后是 **8 个文件**（`ExportOrchestrator.ts` 4 处、`exportWorker.ts` 2 处、其余 6 个文件各 1 处）。

**验收（可执行）**
1. 类型闸门：`npm run typecheck` → **0 error**（漏改任何一处 union，这里必红）。
2. 静态闸门：`git grep -n "docx" -- electron/services/export src/pages/Export src/types/electron.d.ts` → 应能同时命中 types/constants/orchestrator/worker 四类文件。
3. 运行时闸门（真实库）：单会话导出选 DOCX → 产物文件扩展名必须是 `.docx`（**不是 `.json`**）；用 Word 打开能见到 1×2 表格气泡排版；导出进度条不中断。
4. 回归：批量导出选 DOCX → 每个会话一个 `.docx`；再抽测 Excel/Markdown 各导一次，确认 if 链未被破坏。
5. 可视化回归（确认没碰坏别的）：`node audit/harness/run.cjs` → entry 闸门 GREEN、退出码 0。

**风险**
- 中：`ExportOrchestrator.ts` 有**两处**扩展名/分发逻辑（`:382-389` 与 `:443-447`）+ `exportWorker.ts` 另有**两处**（`:310-319` 与 `:443-469`），**四处都要改**；只改一处会得到"能导出但后缀错/只有批量能导出"的半残状态。
- 低：`DocxFormatter` 全用 `any`，TS 不会帮你抓上下文方法名笔误 → 验收必须**真导一次**，不能只看 typecheck。
- 低：`docx` 包较大，但已在依赖里，非本次新增。

---

### G2 修假指标 `activeDays` —— ✅ 已修复（2026-09-16 实测 557 天，修复前假值 400）

**现状证据（已实测 + 真机闭环）**
- 生产（唯一）：`electron/services/analyticsService.ts:682` → `activeDays: activeMonths * 20, // 粗略估算`；`activeMonths` 在 `:666` = `Object.keys(d.monthly).length`。
- `monthKey` 形态（TS 回退路径）：`analyticsService.ts:388-389` = `${year}-${MM}`，**跨年不去重**。
- 显示：`src/pages/AnalyticsPage.tsx:723`（值）+ `:724`（标签「活跃天数」）。
- 链路：`main.ts:3892` IPC → `preload.ts:428` 桥接 → `src/stores/analyticsStore.ts:16` / `src/types/analytics.ts:16` / `src/types/electron.d.ts:1091` 类型。
- **口径矛盾（同名字段别人是真算的）**：`electron/services/groupAnalyticsService.ts:1633` = `dailySet.size`；`electron/services/insightProfileService.ts:810` = `daySet.size`（并在 `:824` 拼进 prompt）。
- 真机证据：`/analytics/private/view` 页面渲染出 `400 活跃天数`（`audit/raw/summary.json`，见 VISUAL_AUDIT A4）。

**改动点（推荐路线 A，1 个文件）**
- `analyticsService.ts`：在游标路径 `:388-389` 已经在生成 `dayKey`（`YYYY-MM-DD`），把它并入一个 `Set<string>`，在 `:682` 改为 `activeDays: daySet.size`。与 `insightProfileService.ts:810` 口径**逐字对齐**。
- 路线 B（若原生聚合路径无日粒度数据、且不想走游标）：把字段语义改名为 `activeMonths` 并在 UI 上改文案为「活跃月份」——**不推荐**，因为跨页同名不同义的问题会更乱。

**验收（可执行）**
1. `npm run typecheck` → 0 error。
2. 单元口径：`git grep -n "activeDays" -- electron src` → `analyticsService.ts` 里不得再出现 `* 20`；`analyticsService.ts` 与 `insightProfileService.ts:810` 两处口径一致（都是 `Set.size`）。
3. 真机判定标准：进 `/analytics/private/view`，同一份库下「活跃天数」**必须 ≤ 数据范围的天数**；拿 `数据范围: 2025/2/7 - 2026/9/11`（约 581 天）做上界 sanity check —— 现值的 400 若真被伪造则应显著变化（真实值应接近"有消息的天数"，通常 200~580 之间）。**判定：新值与 `insightProfileService` 对同一会话算出的 `activeDays` 一致（±0）。**
4. 回归：`node audit/harness/run.cjs --gate=full` 的 PASS 数不得低于 9/10（唯一 FAIL 仍是裸访问 `/dual-report/view` 的正常守卫）。

**风险**
- 中：**性能**。原实现是"图省事"绕开逐日去重。若数据量大（本机 10.1 万条），`Set` 插入成本可接受，但必须确认新增的 Set 只在**已有游标遍历**里顺手做，**不要**为它单独再遍历一次库。
- 低：原生聚合路径（`d.monthly` 直接来自 C++）下 `dayKey` 可能不存在 → 见 **G10**；若 G10 结论是"原生路径无逐日数据"，路线 A 只对回退路径生效，需退化为路线 B。

---

### G3 消息长度直方图 —— 【新建 · 零 C++】✅ 已做（2026-09-16 实测：`sum(buckets)=71,707==totalMessages`，空桶 0）

**可达性已论证**（`audit/GAP_FEASIBILITY.md` §3.1，本次复核一致）
- 数据源已通：`wcdb_exec_query`（绑定 `electron/services/wcdbCore.ts:1098`；JS 入口 `wcdbService.execQuery`，`electron/services/wcdbService.ts:516-521`；worker 已接线 `electron/wcdbWorker.ts:196-197`）。
- 仓库已有对 **message 库**跑 `message_content` 列 SQL 的生产先例：`electron/services/chatService.ts:11804`（where 片段）+ `:11812-11813`（`SELECT COUNT(1) ... FROM <table>` → `wcdbService.execQuery('message', dbPath, sql)`）。
- 渲染层零成本：`src/pages/AnalyticsPage.tsx:4` 已 `import ReactECharts from 'echarts-for-react'`；`:735-737` / `:746` 是现成的 `<div className="chart-card">` + `<ReactECharts option={...} />` 模式，**不需要新图表组件文件**。

**⚠️ 硬约束（必须写在代码注释里）**
- `electron/services/wcdbCore.ts:4064` 有 TODO：**C++ 层不支持参数绑定**；`:4066` 明确告警"将使用原始 SQL（可能存在注入风险）"。→ 走 SQL 必须**自行转义**，仓库已有现成实现 `chatService.ts:1811 private quoteSqlIdentifier()`（另有 `escapeSqlString`，见 `:9354` 用法）。
- 表名不能写死：用 `wcdbService.getMessageTables`（`wcdbService.ts:356`，对应原生命中绑定 `wcdbCore.ts:982`）拿真实表名，再套 `quoteSqlIdentifier`。

**改动点（4 个文件，0 行 C++，0 个新组件）**

| # | 文件 | 位置 | 改什么 |
|---|---|---|---|
| 1 | `electron/services/analyticsService.ts` | `:8-49` 接口区 + `:750`（`getTimeDistribution`）之后 | 新增第 5 个接口 `MessageLengthHistogram`（现有 4 个接口无承载字段）+ 新方法 `getMessageLengthHistogram(begin?, end?)`：`SELECT CASE WHEN length(message_content) ... END AS bucket, COUNT(1) FROM <table> GROUP BY bucket`，一次调用拿到全分布；复用 `:451-520` 的缓存模式 |
| 2 | `electron/main.ts` | `:3900-3902`（`analytics:getTimeDistribution`）之后 | 加 `ipcMain.handle('analytics:getMessageLengthHistogram', ...)` |
| 3 | `electron/preload.ts` | `:431` 之后 | 加 `getMessageLengthHistogram: (b?, e?) => ipcRenderer.invoke(...)` |
| 4 | `src/pages/AnalyticsPage.tsx` | `:737` 之后（`charts-grid` 内） | 加第 5 个 chart-card + `getLengthHistogramOption()`（ECharts 原生 `bar`，**不需要 radar**）；option 构造器照 `getHourlyOption()` 写 |

**分桶建议（写进 option）**：0-10 / 11-20 / 21-40 / 41-80 / 81-160 / 161+ 字符，或等宽分桶；桶边界必须在 SQL 与 ECharts x 轴**用同一份常量**，否则会出现"总数对不上"的假象。

**备选路线（若 SQL 路线被否）**：复用 `analyticsService.ts:211-217` 的 `iterateSessionMessages` 游标，在 `onRow`（`:353-398`）里顺手读内容长度分桶 —— 零 SQL 注入风险，但性能受游标批量（`500`/批）限制。**该路线的唯一未验证项已列入 BLOCKED-C B-1**（游标行是否每行都带 `message_content` 未实机打印过），开工前建议先用一次只读探针 `JSON.stringify(rows[0])` 打印键名定案。

**验收（可执行）**
1. `npm run typecheck` → 0 error。
2. 数据自洽（**关键判定**）：直方图各桶之和 == 同页「总消息数」（`AnalyticsPage.tsx:702`）中的文本类消息数；若走 `length(message_content)`，空内容/非文本消息的归属口径必须在 tooltip 里说清。
3. 渲染判定：进 `/analytics/private/view` → 页面 canvas 数应为 **5**（现在是 4，见 VISUAL_AUDIT §2「4/4 canvas」）；新图表 canvas **非零不透明像素**（可复用 `audit/harness/run.cjs` 的 canvas 探针口径：`variance ≥ 15` 且 `distinctColors ≥ 32` 且 `主色占比 ≤ 90%`）。
4. 空数据判定：对没有消息的会话，页面显示空态**而不是**报错或全 0 桶。
5. 注入安全自查：SQL 中所有表名/列名都过 `quoteSqlIdentifier`；`git grep -n "length(message_content)" -- electron` 命中处上下文不得出现字符串插值进 SQL 的用户输入。

**风险**
- 中：**SQL 注入面**（无参数绑定，C++ 层限制，无法在本次修）。缓解：只拼接**来自 `getMessageTables` 的表名 + 常量**，不拼接任何用户输入。
- 中：`length()` 是 SQLite 的**字符数**（UTF-8 下中文按字符计），与 `insightProfileService.ts:877` 的 JS `content.length`（UTF-16 码元）**对中文一致、对 emoji 不一致** → 若两处数字要互相对照，需先统一口径（建议以 JS `[...str].length` 为"用户可感知字数"）。
- 低：消息内容可能含压缩字段（`compress_content`），纯 `message_content` 可能漏掉部分行 → 先跑一次 `SELECT COUNT(1) WHERE message_content IS NULL OR message_content=''` 看漏多少，再决定是否 join。

---

### G4 年度报告热力图死数据接线 —— ✅ 已接线（2026-09-16 实测 `.h-cell=168`，严格 7×24）

**现状证据（已实测）**
- 后端确实算出了 7×24 矩阵：`electron/services/annualReportService.ts:886`（`Array.from({length:7}, () => Array(24).fill(0))`）→ `:1106`（`heatmapData[weekdayIndex][dt.getHours()]++`）；类型 `ActivityHeatmap` 在 `:28`，字段声明 `:45`，**产出**在 `:1588`（`activityHeatmap: { data: heatmapData }`）。
- 前端**只在类型声明里出现过**：`src/pages/AnnualReportWindow.tsx:36`（`activityHeatmap: { data: number[][] }`）与 `src/types/electron.d.ts:1350` —— `git grep -n activityHeatmap` 全仓仅此 4 处命中（2 处后端 + 2 处纯类型）。
- `AnnualReportWindow.tsx` import 表里**无图表库、无本地图表组件**（VISUAL_AUDIT C3）→ 该窗口图表数为 0。

**改动点（2~3 个文件）**
- 首选：复用现成组件 `src/components/ReportHeatmap.tsx`（收 `number[][]`，画的正是 **星期×小时 7×24**，与后端 `heatmapData` 形状**完全一致** —— 这是本条的运气所在）。在 `AnnualReportWindow.tsx` 的场景里插一处 `<ReportHeatmap data={reportData.activityHeatmap.data} />`。
- 需要确认前端 `reportData` 的取值链路已把 `activityHeatmap` 透传到窗口（类型已在，运行时字段在 `:1588` 已产出 → 大概率只是没渲染，**待运行时确认**）。
- 若年度报告窗口的视觉语言不接受现有组件的样式，则需在 `ReportComponents.scss` 里加皮肤类 —— 仍不新建图表库。

**验收（可执行）**
1. `npm run typecheck` → 0 error。
2. 渲染判定：`node audit/harness/run.cjs`（或手动进 `#/annual-report/view`）→ 该页 canvas/网格数**从 0 变 ≥1**；年报页 DOM 中应出现热力图容器（`.report-heatmap` 或等价类名，按 `ReportHeatmap.tsx` 实际根类名判）。
3. 数据判定：热力图峰值格子（最大值的 星期/小时）应与同页「深夜陪你聊天最多的人」文案的时间段**不矛盾**（同一份 `heatmapData` 派生）。
4. 性能判定：年报页总耗时不得从 8.7s 显著劣化（当前基线见 VISUAL_AUDIT §2：`/annual-report/view` = 8675ms）。

**风险**
- 低：数据已算好，属于纯渲染接线。
- 低：年报页本来就 8.7 秒，若热力图再触发一次全量遍历会雪上加霜 → **必须直接用已产出的 `activityHeatmap.data`，禁止重新遍历**。

---

### G6 孤儿服务 `wordFrequencyService` 接线（顺带把词云接到分析页）—— ✅ 已接线（2026-09-16 实测 `scanned=15,437` / `distinct=6,246`）

**现状证据（已实测）**
- 文件：`electron/services/wordFrequencyService.ts`，**142 行**（文档称 136，见 G11）。导出 `computeWordFrequency(records: MessageRecord[]): WordFrequencyStats`（`:74`）、`topFreq(freq, n=100)`（`:138`）。
- 类型：`WordFrequencyStats`（`:28`）已含 `avgLength`（`:31`）、`lengthSeries`（`:39`）等 11 个字段；`MessageRecord`（`:42`）**是本文件私有形态**（已切好 `date/hour/month/weekday`）。
- 零引用：全仓仅文档 + 自身头注释命中；`wordFrequency:*` 无 IPC 通道。
- 依赖已就位：`jieba-wasm@^2.2.0`（`package.json:34`，`node_modules` 存在）。
- **关键断点不是 IPC，而是适配器**：`chatService` 的 `Message` 只有原始时间戳，全项目**不存在** `Message → MessageRecord` 适配器。派生写法可直接抄 `analyticsService.ts:388-389` 的 `monthKey`/`dayKey`。
- 死代码：内部 `reindexArray`（`:60`）定义了但从未被调用。
- 现成消费端：`src/components/ReportWordCloud.tsx`（props = `{ words: { phrase: string; count: number }[] }`）→ 注意 `computeWordFrequency` 返回的 `wordFreq` 是 `Record<string, number>`，**需要一个 `.map` 转成 `{phrase, count}[]`**。

**改动点（6 个文件，含 1 个新建函数）**
1. `electron/services/wordFrequencyService.ts` — 新增编排入口（取会话消息 → 适配 → 计算），建议命名 `computeWordFrequencyForSession(sessionId, ...)`；顺手删除死代码 `reindexArray`（可选）。
2. 新建适配器（可放在同文件内，避免新文件）：`Message → MessageRecord`，时间派生抄 `analyticsService.ts:388-389`。
3. `electron/main.ts:3916` 之后 — 加 IPC handler（建议 `analytics:getWordFrequency`，与 `:3892-3916` 的 analytics 块同域）。
4. `electron/preload.ts:436` 之后 — 加 invoke 桥接（`analytics` 对象块尾部）。
5. `src/types/electron.d.ts:1251` 附近 — 加 `WordFrequencyStats` 类型声明；`src/types/analytics.ts` 可同步。
6. `src/pages/AnalyticsPage.tsx:735-746` 区 — 加词云卡片（**复用 `ReportWordCloud.tsx`，不要新写组件**）。

**验收（可执行）**
1. `npm run typecheck` → 0 error。
2. 零引用消除：`git grep -n "computeWordFrequency\|wordFrequencyService" -- src electron` → 应出现**调用点**（现在只有定义）。
3. 渲染判定：分析页出现词云卡片，词条数 > 0，且 `wordFreq` 的 top N 不含停用词表（`:18` 的 `STOP_WORDS`）里的词。
4. 交叉验证：词云的 `totalMessages` 应等于同页「总消息数」；不等就是适配器把消息漏了/重复了。
5. 性能：10 万级消息下分词是 CPU 密集操作 → 必须走 Electron 子进程/worker 或加进度回报，**不得阻塞渲染进程**。

**风险**
- 中高：**这是 6 条里最重的一条**（缺 6 环，且分词性能未测）。若时间紧，**G3 与 G6 共享同一套"逐条消息读内容"的取数路径** —— 建议先把 G3 的取数打通，再把 G6 挂到同一路径上，可省一半工作。
- 中：`jieba-wasm` 在 Electron 主进程/worker 中的加载方式**未验证**（STATIC_FINDINGS §3.3 只确认了包存在）。
- 低：`MessageRecord` 与 `Message` 的字段名差异若靠猜会导致静默空结果 → 适配器写完必须打印一条样例对照。

---

### G12 托盘图标未打包态回退（可选 · 最低优先）—— ✅ 已做（2026-10-09 探针 PASS）

**现状证据**：`electron/main.ts:1053-1063 resolveAppIconPath()` —— 未打包且无 dev server 时返回 `join(process.resourcesPath, 'icon.ico')`，实际落到 `node_modules\electron\dist\resources\icon.ico`（**不存在**）→ `[Tray] Failed to create tray icon`（`dist-electron/main.js:938`）。打包产物 `release\win-unpacked\resources\icon.ico` **存在**（372,526 字节）→ **安装包用户不受影响**（VISUAL_AUDIT §3 已降级）。
**改动点**：1 个文件 1~3 行 —— 回退到 `join(__dirname, '../dist/icon.ico')` 或 `public/icon.ico`（两者都存在）。
**验收**：`electron.exe .` 启动后日志**不再**出现 `[Tray] Failed to create tray icon`；托盘出现图标。
**风险**：极低。但它**只在开发/验收场景可见**，排在任何用户可感知项之后。

---

## 2. 需先拍板（4 条 · 决策不明前不要动手）

### G5 死资源 `src/assets/gw/report.css`(462 行) + `heatmap.js`(168 行) —— 【已裁决 2026-10-09：删除或归档】

**现状证据（已实测）**
- 两文件零代码引用（全仓仅 `.claude/plan.md:223`、`.claude/status.md:116` 两处文档自称 ✅）；`heatmap.js` **无 `export`**，不是 ES 模块（`import` 拿不到任何东西），且硬依赖 DOM id `hm-year-btns`/`hm-self-grid`/`hm-partner-grid`。
- **判断修正**：不是"忘了接线"，而是**被 TS 重写取代** —— `src/components/ReportComponents.scss` + `ReportHeatmap.tsx` + `ReportWordCloud.tsx`。
- **但死的那份功能更丰富**：GW 版有 5 色分级调色板（`SELF_PAL`/`PARTNER_PAL`）+ 年份切换 + tooltip；在用版只有单色 `var(--primary)` + opacity。且**形状不同**：GW = 整年逐日（GitHub 风格 7×53），在用 = 星期×小时 7×24。
- `report.css` 里 Big5 / 单人大五 / MBTI 三个簇约 135 行 CSS **对应的是本项目完全没有的功能**。

**2026-10-09 裁决（人类已拍板）**：**已解锁 —— 删除或归档均可**。G7 已取消 → Big5/MBTI 段**无未来用途**；GW 版逐日热力图若要能力可参考后删除。建议：归档到 `docs/` 或直接删除（执行者自选，0~4 文件）。

---

### G7 大五人格雷达图 —— 【已取消 2026-10-09（人类拍板：不做人格/MBTI）】

**裁决**：不做。本项目不做 AI/LLM、不做人格/MBTI（2026-10-09 决策），G7 整体取消。以下历史分析存档备查：

**现状证据（已实测）**
- **图本身零成本**：`echarts@^6.1.0`（`package.json:26`）+ `echarts-for-react@^3.0.2`（`:27`）整包引入，radar 是内置坐标系；容器照 `AnalyticsPage.tsx:735-746` 复用。
- **"大五"这层语义全仓库不存在**：源码级 `radar`/`雷达`/`大五`/`histogram`/`直方图`/`personality`/`性格` **0 命中**；`Big5`/`MBTI` **只命中死文件 `report.css` 的 CSS 类名/注释**（零逻辑）。
- 原生层也没有：`wcdb_api.dll` / `WCDB.dll` 字节扫描 `personality`/`bigfive`/`mbti`/`radar` 各 **0 命中**（对照组 `aggregate_stats`=6、`exec_query`=2 证明搜索有效）；且**本仓库无 C++ 源码**（全仓 `*.cpp/*.h/*.hpp/*.cc/*.c` 只有 1 个无关 macOS 文件）→ 改 C++ 这条路**不可执行**。
- 现有唯一"人格"产出是**自由文本**：`insightProfileService.ts:75-96` 的 `InsightProfileRecord.finalProfile: string`；`insightService.ts` 是**纯 LLM HTTP 客户端**（4 处 `/chat/completions`：`:318 :570 :951 :1616`），**无 API Key 直接失败**（`:674 :731 :874 :1568`；`:874` 原文「请先填写通用 AI 模型配置（API 地址和 Key）」），**无本地推理**。

**历史二选一（已作废）**
- (a) **LLM 打分**：复用 `insightService.ts` 的 `buildApiUrl(apiBaseUrl, '/chat/completions')` 与 `getSharedAiModelConfig()`；产出必须是 `{openness, conscientiousness, extraversion, agreeableness, neuroticism}` 结构化 JSON，而不是自由文本。**代价：用户必须自备 API Key，无 key 时功能整体不可用**。
- (b) **纯统计代理公式**：自定五维公式（消息长度均值、主动发起率、夜间活跃度、表情/标点密度、回复时延…）。原料大部分已可达（长度见 G3；发送/接收与时段见 `analyticsService.ts:365-397`）。**代价：需要自己设计公式 + 归一化 + 可信度说明**，且"大五"这个名字与统计代理指标的对应关系需要产品上认可。

**最短实现路径（≥6 文件，历史存档）**：`analyticsService.ts`（接口区 `:8-49` + `:750` 后新增维度接口与方法）→ `insightService.ts`（若走 LLM：新增五维 prompt + 严格 JSON 解析）或同文件内纯统计公式 → `insightProfileService.ts:75-96`（新增 `dimensions` 字段）→ `main.ts:3900` 旁 IPC → `preload.ts:431` 旁桥接 → `AnalyticsPage.tsx:735-746` 区加 `<ReactECharts option={getRadarOption()} />`。
**历史风险**：高 —— 这是全清单里唯一"从算法层新建"的项，成本比 G1~G4 高一个数量级。

---

### G8 双人报告页 `0 NaN%` + 被 `*`/`X`/`#` 打散的昵称 —— 需产品侧定性（未确认；复测受 DB 停摆阻断）

**现状证据（运行时，带参数探针）**：`/dual-report/view?username=wxid_xx1zzo5hut8e22_8c04&year=0` 页面文本出现 `MUTUAL INITIATIVE 情感的天平 0 NaN% w 0 NaN%`，以及 `所有时1 年过二*/*1&wxiX-*#*/X*X-1/1/088#810`（真名「年过二旬の小伙 / CallmeOurten」被打散）。
**为什么不能直接判定为缺陷**：探针传的 `username` 是 `myWxid`（**自己对自己**），双方发送量可能天然 0/0 → 除零有合理来源；掩码字符疑似**隐私打码**（若是预期特性，则是设计而非缺陷）。
**拍板所需**（先做一次 5 分钟的复测再拍板）：
1. 用**"自己 vs 真实好友"**的组合复测一次（不要用 myWxid），看 `NaN%` 是否消失、昵称是否正常 → 命令：照 `audit/harness/run.cjs` 的探针方式进 `/dual-report/view?username=<真实好友wxid>&year=0`（`audit/raw/aux_dual_report_view_with_params.json` 是现成模板）。
2. 若真实好友下仍 `NaN%` → **是缺陷**，进"可立即开工"：定位 `MUTUAL INITIATIVE` 的百分比计算处（`src/pages/DualReportWindow.tsx` 内），加分母为 0 的守卫。
3. 掩码字符：`git grep -n "\*\*\|mask" -- src/pages/DualReportWindow.tsx src/utils` 找打码工具；若确为隐私打码 → 文档记录为特性，**不动**。
**风险**：低（复测成本极低）；但**不要在复测前改代码** —— 会把"预期特性"当 bug 修掉。

---

### G11 文档债三处修正 —— ✅ 已裁决并修正（2026-10-09）

| # | 问题 | 证据 | 处置（2026-10-09 已执行） |
|---|---|---|---|
| 11.1 | `CLAUDE.md`「关键决策」称 GW `visualizer/personality` 已 TS 移植 ↔ `.claude/status.md:138-139` 把两者列入「跳过的 5 项」 | **代码证据支持 `status.md`**：`radar`/`雷达`/`大五`/`personality`/`性格`/`histogram`/`直方图` 源码级全部 0 命中 | ✅ **以 status.md 为准**：CLAUDE.md 已改为只保留 stats（词频，已接线），visualizer/personality 注明明确不做（2026-10-09 决策） |
| 11.2 | `status.md:116-118` 阶段 6 三条 ✅ 实为「属实但未接线」；行数不符 | 实测 `report.css`=**462**、`heatmap.js`=**168**（合计 630，文档称 636）；`wordFrequencyService.ts` 原 142（称 136）；`DocxFormatter.ts` 原 312（称 256） | ✅ 已订正：三条均已接线（2026-10-09 b0e4dfb），行数更新为 630/253/322（接线后现值）；`.claude/plan.md` 同步 |
| 11.3 | `status.md:139`「personality.py 被 insightService 替代」是**能力形态错位** | GW `personality.py:74` 产出 `big5`、`:81` 产出 `mbti`；而 `insightService.ts` 是 LLM 自由文本（`:1596` 限 80 字、`:1598` 允许 `SKIP`），**不可互替** | ✅ 已改：跳过 personality.py —— 产出 Big5+MBTI 结构化维度，本项目 2026-10-09 决策不做人格/MBTI（G7 取消） |

**验收**：`git grep -n "636\|136行\|256行" -- .claude` → 0 命中（或仅剩已订正的表述）；`git diff --stat -- .claude/CLAUDE.md .claude/status.md .claude/plan.md` 能逐行解释。
**风险**：低（已裁决，不再需要人工介入）。

---

## 3. 需先调查（2 条 · 结论会改变其它待办的实现）

### G9 退出码 `0xC0000409` 未定位 —— 唯一悬而未决的运行时疑点（未确认）

**现状证据**：验收台每轮收尾子进程退出码 `3221226505`（`0xC0000409`，STATUS_STACK_BUFFER_OVERRUN）。
**现有推断（未证实）**：验收台在原生 WCDB worker 仍持句柄时调用 `app.exit()` 强制退出所致；**未排除应用自身退出路径也有问题**（BLOCKED-B 第 2 项）。
**调查方案（二选一或都做）**
1. **正常关窗退出 vs 强杀对照**：手动启动 `npm run dev` → 关主窗口（走应用自己的 `app.quit()` 路径）→ 查退出码；再 `taskkill /F` 对照。若正常退出码为 0 → 推断成立，**不是应用缺陷**，可结案。
2. 若正常退出也报 `0xC0000409` → 排查 `before-quit`/`window-all-closed` 里与原生 worker/WCDB 句柄释放相关的代码（`electron/main.ts` 退出路径 + `wcdbWorker` 终止逻辑），做最小复现。
**判定标准**：给出"正常关窗退出码 = 0"或"最小复现代码路径 + 具体越界的缓冲区调用方"。
**风险**：若真在应用退出路径，属于**稳定性缺陷**（用户每次退出都可能崩），优先级会跃升到 G1 之前。

---

### G10 `d.monthly` 原生路径的 key 格式（`MM` 还是 `YYYY-MM`）—— 已随 G2 落地；原生 key 格式未单独记录（未确认）

**现状证据**：`activeMonths = Object.keys(d.monthly).length`（`analyticsService.ts:666`）；`d.monthly` 有两条来源 —— TS 游标回退路径**已确认** `YYYY-MM`（`:388`），原生路径来自预编译 `wcdb_api.dll`（**仓库内无 C++ 源码**，静态不可判）。
**为什么重要**：若原生 key 是 `MM`（不带年），`activeMonths` 上限 12 → `activeDays` 恒 ≤ 240；若是 `YYYY-MM`，跨 7 年会到 1620。**两种口径下"这是假指标"都成立，但用户看到的具体错误数字差一个数量级。**
**调查方案（0.5h，只读）**：在真实库下跑一次 `analytics:getOverallStatistics`，打印 `Object.keys(d.monthly)` 的前几个 key。落点：`analyticsService.ts:666` 附近临时加一行 `console.log`（**或更安全：在验收台里通过 IPC 调用并打印返回值**，不改业务代码）。
**判定标准**：打印出 key 样例即定案；把结论回填到 G2 的改动说明里。

---

## 4. 当前主线（2026-10-09 更新）

> 原「推荐顺序 G2 → G1 → G3 …」已全部执行完毕（G1-G6/G12 接线，b0e4dfb）。以下为当前排期。

| 顺位 | 条目 | 说明 |
|---|---|---|
| 0 | **原生组件恢复（无本地手段）** | `wcdb_api.dll` / `welive.exe` 厂商侧停摆，**无本地修复路径**（KNOWN-STATE §5.3）；DB 依赖的验收/复测（G8、DOCX E2E、渲染层验证）全部搁置，待厂商恢复或替代方案 |
| 1 | **上游移植候选（新主线）** | 按 `audit/verify/UPSTREAM-PORT-CANDIDATES.md` §5 批次 0-5 推进（28 文件可移植 / 40.6% 排除）。**批次 0**（纯前端、零依赖、修 MSG 现存 bug）：P0-0a 导出取消状态、P0-0b 日期范围末尾 1 分钟截断、P0-6 `ExportStatsService` 悬空方法、P0-7 `prepare-electron-runtime.cjs`、P0-14/P0-15/P0-16、P0-5 文件名指纹。**硬约束**：`wxid`→`accountId` 改名不可照抄；`wcdb_set_my_account_id` 等 4 个上游新符号本机 DLL 不存在；剥离解密/插件化改动一律不可移植 |
| 2 | **G5 清理执行** | `src/assets/gw/*` 已解锁：删除或归档（Big5/MBTI 段无未来用途；GW 逐日热力图能力可先摘录再删） |
| 3 | **G8 复测** | 待 DB 恢复后用"自己 vs 真实好友"组合复测（当前停摆阻断） |
| 4 | **G9 退出码调查** | 与其它项零文件冲突，可随时并行（正常关窗 vs 强杀对照） |
| 5 | **渲染层补验欠账** | DB 恢复后补：DOCX 端到端、G2/G3/G4/G6 页面渲染值（KNOWN-STATE §8） |

**排序原则**：① 批次 0 的 P0-0a/P0-0b 修的是**用户可见现存 bug**，性价比最高；② 所有运行时验证受 DB 停摆阻断，一律排后；③ 决策类（G7 取消、G5 解锁）已拍板，不再阻塞。

---

## 5. 明确边界：**不该**顺手做的事

1. **G7 已取消（2026-10-09 决策：不做人格/MBTI）。** 不新建 `PersonalityDimensions` 接口、不加五维 prompt、不改 `InsightProfileRecord`。
2. **不要在 G9 查清前改应用退出路径。** `0xC0000409` 的成因**未排除**应用自身；此刻改 `app.quit()`/`before-quit`/worker 终止逻辑，会把"未知缺陷"变成"已知改动引入的缺陷"，无法归因。
3. **不要直接 `import` `src/assets/gw/heatmap.js`。** 它**没有 `export`，不是 ES 模块**，import 取到的是空对象；且硬依赖三个 DOM id。要接线只能在 TS 里**重写**其能力。
4. **不要为了 G3 给 `wcdb_exec_query` 加参数绑定。** C++ 源码不在本仓库（`resources/wcdb/win32/x64/` 只有 3 个预编译 DLL），**改不了**；`wcdbCore.ts:4064` 的 TODO 不是本次能闭环的事，按"仅只读 SQL + 自行转义"接线即可。
5. **G5 已解锁（2026-10-09 决策）**：`src/assets/gw/*` 可删除或归档（Big5/MBTI 段无未来用途，G7 已取消）。删除前如需 GW 逐日热力图能力，先在 TS 里摘录再删。
6. **不要把 `/dual-report/view` 裸访问报错列为缺陷。** 已闭环为**正常守卫**（`DualReportWindow.tsx:142-146` 读 hash 的 `username`，正常入口 `DualReportPage.tsx:67` 会自动带上）。**不要"修"它**，也不要把这条写进任何 bug 清单。
7. **不要在 G8 复测前改双人报告页。** 掩码字符疑似**预期隐私特性**，改了就是制造缺陷。
8. **不要为直方图新建图表组件文件。** 现有渲染模式就是"内联 option 函数 + `<ReactECharts>`"，仓库里**没有独立图表组件**；新建会让全项目出现第二套模式。
9. **不要碰 `audit/`**（gitignored 取证证据，只读，一字不动）。

---

## 6. 验收基线（每条改完都要跑）

> ⚠️ 2026-10-09 起 DB 停摆（KNOWN-STATE），以下运行时基线命令需 DB 恢复后才有意义；静态项（`npm run typecheck`）不受影响。

```powershell
cd E:\Code_zone\Msg_weflow

# 1) 类型闸门（漏改 union / 接口必红）
npm run typecheck

# 2) 可视化回归：10 条路由可达 + 零控制台报错（entry 闸门应 GREEN、退出码 0）
node audit/harness/run.cjs

# 3) 严格闸门：渲染就绪 + 截图非空页（基线 = RED 9/10，唯一 FAIL 是 /dual-report/view 的正常守卫）
node audit/harness/run.cjs --gate=full

# 4) 闸门有鉴别力（改错路径必须被判 FAIL，否则验收台本身失效）
node audit/harness/run.cjs --negative
```

**判定基线（改动前的既成事实，用于比对）**
- 10 条路由全部 `entered=true`、`errorCount=0`；四状态分布 = 已渲染完成 9 ｜ 加载超时 0 ｜ 页内错误 1 ｜ 真空白 0。
- 8/8 个 ECharts 实例有非零不透明像素；`/analytics/private/view` = 4 个 canvas；`/annual-report/view` = 1 个 canvas / 8675ms / 53,116 条消息。
- 非空页阈值：`variance ≥ 15` **且** `distinctColors ≥ 32`（精确 24bit）**且** `主色占比 ≤ 90%`（v1 的 `variance>5` 阈值过松，会放过空页 → 别退回旧阈值）。
- **反向验证不能用大小写变体**（react-router v6 `matchPath` 默认 `caseSensitive=false`，改大小写仍然全绿）；必须用真拼写错误。

---

## 7. 本文件未核实 / 需接手者注意

1. **G4 的"前端取值链路是否已透传 `activityHeatmap`"未实机确认**（类型已声明、后端已产出，但运行时是否到达窗口未打印过）。
2. **`jieba-wasm` 在 Electron 主进程/worker 的加载方式未验证**（只确认包与 `node_modules` 存在）。
3. **`docx` 格式器批量导出路径未实跑**（本次只核实了接口兼容性与四处分发点，未真跑一次 1000+ 条消息的 DOCX 导出）。
4. **`report.css` 与现有主题系统的变量冲突程度未实测**（仅基于两边都有 OKLCH tokens 的推断）。
5. **`wcdb_ai_*` 等 19 个"导出但未绑定"的原生符号签名未知**（无头文件/无 `.def`/无源码）—— 与 G1~G12 **全部无关**，仅作为后续增强的可能性记录。
6. 本文件**不重复** `audit/VISUAL_AUDIT.md` 的 v1 已作废结论；`annual-report/view` 延长等待后**能**渲染完整年报（8.7s），`dual-report/view` 裸访问失败是**正常守卫、非缺陷**。
