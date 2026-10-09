# 跨项目功能对比矩阵

> 方案 A：Electron + TypeScript + React，WF 主骨架（~80%）。WM/GW 补充。

三个参考项目：
- **WF** = WeFlow_for_archlinux-main（Electron 应用，**主骨架**）
- **WM** = WeChatMsg-master（Python，解密舍弃，保留解析/导出/Silk 参考）
- **GW** = ginger_wechat_portrait（Python 分析模块，需 TS 移植）

---

## 1. 账号管理

| 功能 | 来源 | 策略 |
|------|------|------|
| DB密钥自动获取（DLL注入） | WF `keyService.ts` | **保留** — DLL 已验证 v4.1.x |
| 多微信账号切换/管理 | WF `config.ts` | **保留** |
| 微信进程检测与 PID 获取 | WF `keyService.ts` | **保留** |

## 2. 数据库

| 功能 | 来源 | 策略 |
|------|------|------|
| DB解密（拿到密钥后） | WF WCDB 原生桥 | **保留** — 不落盘，80+ 操作 |
| 多数据库挂载 | WF `wcdbCore.ts` | **保留** |
| 统一查询接口 | WF WCDB 80+ 操作 | **保留** |

> WM 的 `decrypt_v3/v4`、`DataBaseInterface`、`manager_v3/v4` 不再参考。

## 3. 聊天记录浏览

| 功能 | 来源 | 策略 |
|------|------|------|
| 会话列表 + 未读数 | WF WCDB + React 组件 | **保留** |
| 全消息类型聊天气泡 | WF React 组件 | **保留** |
| 虚拟列表无限滚动 | WF | **保留** |
| 图片查看器 | WF Electron | **保留** |
| 视频/语音播放 | WF + Whisper | **保留** |
| 消息解析器 | WF 覆盖 17 种，WM 补充 3 种（红包/视频号/企业名片）| **保留**，v1 补全缺失类型 |

## 4. 联系人

| 功能 | 来源 | 策略 |
|------|------|------|
| 联系人列表 + 搜索 + 拼音索引 | WF Contacts 页面 | **保留** |
| 联系人详情 | WF + WCDB | **保留** |
| 群成员管理 | WF + WCDB | **保留** |
| 公众号管理 | WF + WCDB | **保留** |

## 5. 朋友圈（SNS）—— v1

| 功能 | 来源 | 策略 |
|------|------|------|
| 朋友圈时间线 | WF `snsService.ts` | **保留** |
| 图片/视频查看 + 互动 | WF `src/pages/Sns/` | **保留** |
| SNS 导出 | WF export | **保留** |

## 6. 导出

| 功能 | 来源 | 策略 |
|------|------|------|
| CSV / HTML / JSON / TXT / Markdown | WF 导出器 | **保留** |
| Excel | WF 基础 + WM 公众号模式（支付/收款/步数/快递）| **保留改造** |
| SQL | WF 导出器 | **保留** |
| DOCX（表格气泡 + 头像 + 分页） | WM `exporter_docx.py` 参考 | TS 移植 |
| AF_TXT（AI 训练 + 隐私擦除） | WM `exporter_ai_txt.py` 参考 | TS 移植 |
| 批量导出 + 进度反馈 | WF 已有 | **保留** |

## 7. 分析与报告

| 功能 | 来源 | 策略 |
|------|------|------|
| 聊天统计（消息数/天数/时间分布） | WF `analyticsService.ts` | **保留** |
| 词频分析 + 词云 | GW `stats.py` 参考（jieba-wasm + ECharts） | TS 移植 ✅ 已接线（2026-10-09） |
| 年度报告 | WF AnnualReport 路由 | **保留** |
| 双人关系报告 | WF DualReport 路由 | **保留** |
| AI 人格分析（BigFive + MBTI） | — | **不做**（2026-10-09：不做人格/MBTI，G7 取消） |
| HTML 独立报告 | GW `report.py` 参考 | 不移植（WF 年报等价，2026-07-29 决策） |
| 可视化图表 | WF ECharts | **保留**，替代 GW matplotlib |

## 8. 解密系统

> WM 解密全部舍弃。全链路 WeFlow。

| 功能 | 来源 | 策略 |
|------|------|------|
| DB密钥（wx_key.dll 注入） | WF `keyService.ts` | **保留** |
| 图片 XOR 密钥（kvcomm 推导） | WF `imageDecryptService.ts` | **保留** |
| 图片 AES 密钥（内存扫描） | WF `imageDecryptService.ts` | **保留** |
| DAT V1/V2 图片解密 | WF `imageDecryptService.ts` | **保留** |
| wxgf→JPEG（ffmpeg） | WF `imageDecryptService.ts` | **保留** |
| 图片批量解密 | WF 流水线 | **保留** |
| Silk→MP3 | pysilk + ffmpeg（WF/WM 方案等价）| **子进程保留** |

## 9. 其他

| 功能 | 来源 | 策略 |
|------|------|------|
| 设置页面 | WF `config.ts` | **保留** |
| 密钥安全存储 | WF `electron-store` + `safeStorage`（DPAPI + PBKDF2/AES-256-GCM） | **保留** |
| Windows 打包分发 | WF `electron-builder` NSIS + GitHub 自动更新 | **保留** |
| 自定义主题（7 套 + OKLCH） | WF 主题系统 | **保留** |
| 锁屏（Windows Hello） | WF | **保留** |
| HTTP API（5031 端口） | WF | **保留** |
| 隐私擦除 | WM `common.py` 参考 | TS 移植 |
| 备份/恢复 | — | v2 从零设计 |
| 本地 AI 推理 | — | **取消**（2026-10-09：不做 AI/LLM） |

---

## 项目角色总结

| 项目 | 角色 | 代码占比 | 主要工作 |
|------|------|----------|----------|
| **WeFlow** | 主骨架 | ~80% | 保留改造：去掉 macOS/Linux 分支，聚焦 Windows；补充 DOCX/分析 |
| **WeChatMsg-master** | 补充参考 | ~10% | DOCX/AF_TXT 导出 → TS 移植；3 种补充解析器；Excel 公众号模式；解密全部舍弃 |
| **ginger_wechat_portrait** | 补充参考 | ~10% | 仅 stats（词频）移植并接线（2026-10-09）；visualizer/personality/report 不移植 |

---

## 10. 可视化与 UI 层面

### 10.1 聊天界面（WF 独占，直接复用）

- 聊天气泡（13+ 消息类型）、虚拟列表（Virtuoso）、图片查看器、视频播放器、语音波形动画
- Liquid Glass 特效（`@hicccc77/electron-liquid-glass`，DXGI/D3D11，仅 Windows）

### 10.2 HTML 导出阅读器（WM CSS/JS 融入 WF HtmlFormatter）〔未落地〕

> 2026-10-09 核实：未实施。flatpickr/lunr 全仓 0 命中；高德地图仅在 ChatPage（位置消息外开），不在 HtmlFormatter（HANDOVER §3.5）。

WM `template.html`（5434 行）核心 UI 资产融入 WF 的 `HtmlFormatter.ts`：
- 三栏布局（侧边栏 50px + 时间线 300px + 主区域 flex:1）
- 虚化时间线（CSS 虚线 + 可折叠年/月节点）
- 12 种消息卡片样式（文本/图片/视频/音频/文件/位置/名片/合并/转账/链接/小程序/视频号）
- 分类过滤栏（8 类）、flatpickr 日历（禁用无消息日）、lunr.js 全文搜索（中文分词）、高德地图嵌入

### 10.3 分析图表（WF ECharts 保留 + GW matplotlib→ECharts 移植）

| 图表 | 来源 | 策略 |
|------|------|------|
| 小时分布柱状图、消息类型饼图、收发比、群活跃 | WF ECharts | **保留** |
| 词云（单/双人） | GW matplotlib | ✅ 已接线（2026-10-09） |
| 消息长度直方图 | — | ✅ 已做（2026-10-09 G3） |
| 月趋势面积折线、星期分布柱状 | GW matplotlib | 未渲染（仅类型声明，HANDOVER §3.5） |
| 大五雷达图 | GW matplotlib | ❌ **取消**（2026-10-09 决策） |
| 年度交互热力图 | GW Vanilla JS | 未接线（死资源，2026-10-09 解锁可删/归档；在用 `ReportHeatmap.tsx` 为星期×小时 7×24） |

### 10.4 报告/主题/SNS/导出 UI

| 模块 | 来源 | 策略 |
|------|------|------|
| 年度报告（11 场景）、双人报告（9 场景） | WF React 组件 | **保留** |
| HTML 独立报告（OKLCH CSS 474 行 + 热力图 JS 162 行） | GW | CSS/JS 直接复用，Python 模板→React 组件 |
| 7 套主题（`data-theme` + `data-mode` + OKLCH） | WF | **保留** |
| SNS 时间线 + 媒体网格 + 联系人过滤 | WF React 组件 | **保留** |
| 导出中心（会话选择表 + 配置对话框 + 任务管理） | WF React 组件 | **保留** |

### 10.5 可视化工作量

| 类别 | 工作量 | 内容 |
|------|--------|------|
| WF 直接保留 | ~0 | 聊天界面/报告场景/主题/SNS/导出 UI |
| WM CSS/JS 融入 | **小** | 从 template.html 提取 CSS 精华，注入 WF HtmlFormatter |
| GW ECharts 移植 | **中** | 仅词频/直方图已落地；雷达图取消；月趋势/星期分布未渲染 |
| GW 热力图 | ~0 | 未接线（2026-10-09 解锁可删/归档） |
