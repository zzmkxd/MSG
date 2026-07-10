# Ginger WeChat Portrait 量化审计

> 审计日期：2026-07-09。逐文件量化，4 核心模块 + 4 辅助文件。总计 ~1,800 行 Python。

---

## 一、文件清单

| 文件 | 行数 | 角色 | TS 移植 |
|------|------|------|---------|
| `stats.py` | 58 | 统计指标计算 | 低 |
| `visualizer.py` | 263 | matplotlib 图表（7种） | 中 |
| `personality.py` | 142 | Claude API 人格分析 | 低 |
| `report.py` | 1,015 | HTML 报告生成（474 CSS + 162 JS + 375 Python） | 中 |
| `main.py` | 277 | CLI 编排器 | 参考逻辑 |
| `data_loader.py` | 166 | CSV 加载 + 清洗 + 表情替换 | 低 |
| `sampler.py` | 68 | 分层时序采样 | 低 |
| `export_contact.py` | 423 | macOS 微信 SQLite 导出 | **不需要** |

---

## 二、stats.py — 11 维统计指标

### compute(df) 返回结构

```python
{
    'total_messages': int,       # 消息总数
    'total_chars':    int,       # 总字符数
    'avg_length':     float,     # 平均消息长度（保留1位小数）
    'date_range':     tuple,     # (min_datetime, max_datetime)
    'daily':          Series,    # 按日期分组消息数
    'hourly':         Series,    # 24小时分布（fill_value=0，保证完整24槽）
    'monthly':        Series,    # 按月分组（PeriodIndex）
    'weekday':        Series,    # 7天分布（0=周一, fill_value=0）
    'word_freq':      Counter,   # jieba 分词词频（>1字, 去停用词）
    'emoji_freq':     Counter,   # Unicode emoji 字符频次
    'length_series':  Series,    # 每条消息字数（用于直方图）
}
```

### 关键参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 中文分词 | `jieba.cut()` | 精确模式 |
| 停用词 | 70 个 | 中文高频虚词 + 口语词 |
| 最小词长 | 2 字符 | 过滤单字 |
| Emoji 正则 | `[\U0001F300-\U0001FFFF\U00002600-\U000027BF]+` | 覆盖大部分 Unicode emoji |
| weekday 索引 | 0=周一 | Pandas `dayofweek` 标准 |

### TS 移植评估

**难度：低**。纯计算，无外部依赖问题：
- jieba → `nodejieba` 或 `jieba-wasm`（WF 已用 jieba-wasm）
- pandas groupby → `lodash.groupBy` + 手写聚合
- Counter → `Map<string, number>`
- 停用词表直接复制

---

## 三、visualizer.py — 7 种图表参数详解

### 3.1 品牌色体系

```
棕色系（自己）：                   青绿系（对方）：
--br-900  #8B5E3C  (最暗)        --tl-800  #4A7B6F
--br-700  #C68642  (主色)        --tl-500  #6FAA9C
--br-500  #D4956A  (中)          --tl-200  #AAD5C9
--br-300  #E8C49A  (浅)
--br-100  #F0DCC8  (边框)
背景：CREAM #FFF8F0 / CHART_BG #FDFAF6
文字：TEXT_DARK #3A2A1A / TEXT_MID #7A6655
```

### 3.2 7 种图表参数

| # | 函数 | 类型 | figsize | 关键参数 |
|---|------|------|---------|----------|
| 1 | `hourly()` | 柱状图 | (11, 4) | 24 bars, width=0.75, alpha=0.88, 峰值高亮 BROWN_MID, 深夜阴影(0-6,22-24) alpha=0.06 |
| 2 | `monthly_trend()` | 面积折线 | (13, 4) | fill_between alpha=0.18, line w=2.2, marker='o' size=3.5 |
| 3 | `weekday_bar()` | 柱状图 | (8, 4) | 7 bars, 周末(BROWN_MID) vs 工作日(BROWN_DARK), legend |
| 4 | `word_cloud()` | 词云 | (11, 5.5) | max_words=70, colormap='YlOrBr', collocations=False, 自动检测中文字体路径 |
| 5 | `word_cloud_pair()` | 双人词云 | (16, 6) | 1×2 subplot, self=YlOrBr, partner=GnBu_r |
| 6 | `length_dist()` | 直方图 | (9, 4) | bins=40, clip(upper=200), 均值虚线标注 |
| 7 | `big5_radar()` | 雷达图 | (6, 6) | polar, 5维, alpha=0.28, scores/100 归一化到0-1, yticks=[0.2,0.4,0.6,0.8] |

### 3.3 通用样式 _style()

- 隐藏 top/right spine
- left/bottom spine 颜色 BROWN_PALE
- title fontsize=13 bold
- xlabel/ylabel fontsize=10 color=TEXT_MID
- tick 颜色 TEXT_MID

### 3.4 字体检测 setup_font()

候选字体优先级：
1. PingFang SC (macOS)
2. Heiti SC / STHeiti (macOS)
3. Microsoft YaHei (Windows) ← **WF 目标**
4. SimHei (Windows)
5. WenQuanYi Micro Hei (Linux)
6. Noto Sans CJK SC (Linux)

词云字体文件路径候选（7 个系统路径），在 Windows 上选 `C:/Windows/Fonts/msyh.ttc` 或 `simhei.ttf`。

### TS 移植评估

**难度：中**。逻辑直接，但技术栈全换：
- matplotlib → **ECharts**（WF 已有 ECharts 6.1.0 + echarts-for-react）
- wordcloud (PIL-based) → **ECharts wordcloud 扩展**（WF 已集成）
- 品牌色 7+2+2=11 色 → CSS 变量 + ECharts `color` 数组
- 字体检测 → 不需要（Windows 已知字体，hardcode `Microsoft YaHei`）
- `save_all()` → ECharts `getDataURL()` 或 `html2canvas`（WF 已用）

---

## 四、personality.py — 两阶段分析

### 4.1 阶段一：extract_features() — 11 维语言特征

| # | 特征 | 计算方式 | 关键词数 |
|---|------|----------|----------|
| 1 | `avg_length` | 消息总字数/条数 | — |
| 2 | `opinion_rate` | 含观点词消息占比(%) | 7 |
| 3 | `positive_emotion` | 含正向情绪词占比(%) | 10 |
| 4 | `negative_emotion` | 含负向情绪词占比(%) | 10 |
| 5 | `planning_rate` | 含规划词占比(%) | 8 |
| 6 | `certainty_high` | 含高确信度词占比(%) | 5 |
| 7 | `certainty_low` | 含低确信度词占比(%) | 6 |
| 8 | `question_rate` | 含问号消息占比(%) | — |
| 9 | `social_rate` | 含社交词占比(%) | 7 |
| 10 | `first_person_rate` | 含第一人称占比(%) | 5 |
| 11 | `sample_count` | 采样消息数 | — |
| 12 | `total_words` | 总字数 | — |

共计 **12 个字段**（10 维心理语言特征 + 2 维元数据）。

**关键词词典（5 组，共 51 词）**：

| 词典 | 词数 | 示例 |
|------|------|------|
| `_OPINION_WORDS` | 7 | 我觉得, 我认为, 感觉, 我想, 我希望, 在我看来, 我以为 |
| `_EMOTION_POS` | 10 | 开心, 高兴, 快乐, 喜欢, 爱, 棒, 不错, 满意, 幸福, 兴奋 |
| `_EMOTION_NEG` | 10 | 难过, 伤心, 生气, 烦, 焦虑, 担心, 害怕, 失望, 委屈, 无聊 |
| `_PLANNING_WORDS` | 8 | 打算, 计划, 准备, 决定, 目标, 将来, 以后, 未来 |
| `_CERTAINTY_POS` | 5 | 一定, 肯定, 确定, 绝对, 必须 |
| `_CERTAINTY_NEG` | 6 | 可能, 也许, 大概, 应该, 或许, 不确定 |
| `_FIRST_PERSON` | 5 | 我, 我的, 我觉得, 我认为, 我想 |
| `_SOCIAL_WORDS` | 7 | 朋友, 大家, 我们, 一起, 聚, 出去, 玩 |

### 4.2 阶段二：Claude API prompt 设计

| 参数 | 值 |
|------|-----|
| Model | `claude-opus-4-6` |
| Max tokens | 2,500 |
| Role | "语言学人格研究者" |
| Input | 采样消息（逐行 `• ` 前缀）+ 11 维特征摘要 + 时间跨度 |
| 采样规模 | 默认 100 条/人（CLI `--sample-size`），内部 target_n=350 |

**输出 JSON Schema（4 大块）**：

```
big5 (5维)
  └── openness / conscientiousness / extraversion / agreeableness / neuroticism
       └── {score: 0-100, level: "低/中/高", evidence: "原文引用", note: "一句解读"}

mbti
  └── {type: "四字母", confidence: "低/中/高", note: "...",
       dims: {EI, SN, TF, JP} × {lean: "E或I", strength: "明显/轻微", reason: "..."}}

style
  └── {one_line: "一句话描述", summary: "2-3句风格描述",
       strengths: ["特点1","特点2","特点3"], fun_facts: ["发现1","发现2"]}

reliability
  └── "关于分析可靠性的简短说明"
```

**Prompt 设计亮点**：
- 明确声明 "MBTI 信效度有限"，Big Five 为重点 — 学术诚信
- 要求 evidence 必须是原文引用，不得编造 — 防幻觉
- `_PROMPT_TEMPLATE` 用 4 空格缩进，`{features_str}` 格式化为 `key=value, key=value...`
- JSON 解析容错：先尝试 ` ```json ``` ` 提取，失败则 `json.loads` 原文，再失败返回 `{'raw': ..., 'parse_error': True}`

### TS 移植评估

**难度：低**。核心就是调 Claude API：
- `anthropic` Python SDK → `@anthropic-ai/sdk` npm 包
- 关键词词典 → 直接复制为 TS const 数组
- `_rate()` 函数 → 3 行 TS
- prompt 模板 → 模板字符串
- Model: `claude-opus-4-6` → 评估时更新到最新模型

---

## 五、report.py — HTML 模板复用边界

### 5.1 CSS（474 行，~95% 可复用）

**Design Tokens（OKLCH 色彩体系）**：
- 6 级棕色调（`--br-900` → `--br-050`）
- 5 级青绿色调（`--tl-800` → `--tl-050`）
- 4 级文字色（`--tx-900` → `--tx-400`）
- 2 级阴影（`--sh-sm`, `--sh-md`）
- 4 级圆角（`--r-sm: 8px` → `--r-xl: 28px`）
- 缓动函数：`--ease-expo: cubic-bezier(0.16, 1, 0.3, 1)`
- 字体栈：Songti SC / STSong / SimSun (display) | PingFang SC / Microsoft YaHei (body) ← **Windows 兼容**

**CSS 组件清单**：

| 组件 | CSS 类 | 行数 | 说明 |
|------|--------|------|------|
| Animations | `fadeUp`, `growX` | ~15 | 入场动画 + prefers-reduced-motion |
| Reset/Base | `*, body, .container` | ~20 | box-sizing, font, background |
| Header | `.header` | ~45 | 渐变背景 + 对角线条纹装饰 + `::before`/`::after` |
| Stats Grid | `.stats`, `.stat` | ~25 | 3 列等宽卡片 + 底部渐变装饰条 |
| Section | `.section`, `.section-title` | ~15 | 圆角卡片 + 底部边框标题 |
| Charts Grid | `.chart-grid`, `.chart-full` | ~10 | 2 列网格 + hover 效果 |
| Tags | `.tag-self`, `.tag-partner` | ~15 | 头像+名字圆角标签 |
| Big5 Butterfly | `.butterfly-row`, `.bf-track-*`, `.bf-fill-*` | ~60 | 双人左右对比水平条 |
| Big5 Single | `.trait-row`, `.bar-track`, `.bar-fill` | ~30 | 单人水平条 + evidence |
| MBTI | `.dual-col`, `.person-panel`, `.dim-row` | ~45 | 双栏面板 + 四维表格 |
| Style Summary | `.one-line`, `.summary-text`, `.strengths`, `.fun-fact` | ~40 | blockquote + 列表 |
| Heatmap | `.hm-*` | ~95 | GitHub 风格热力图 + year toggle + legend + tooltip |
| Disclaimer | `.disclaimer`, `.brand` | ~15 | 页脚免责声明 |
| Responsive | `@media (max-width: 600px)` | ~15 | 单栏降级 |

### 5.2 JavaScript（162 行，~100% 可复用）

热力图 `initHeatmap()` 函数：
- **纯 Vanilla JS**，无框架依赖
- 双配色：SELF_PAL (5 档棕色) + PARTNER_PAL (5 档青绿)
- 年切换按钮（`hm-yr-btn`）
- 完整日历网格计算（从 Jan 1 所在周的周一开始，到 Dec 31 所在周的周日结束）
- 5 级颜色分档函数 `getColor(n, mx, pal)`：r<0.15/0.40/0.72/1.0
- Tooltip 跟随鼠标
- 约 170 行

**TS 复用策略**：直接作为 React `useEffect` 内的 IIFE，或改为 React 组件。Vanilla JS 不改动也能用。

### 5.3 Python HTML 生成（~375 行，需 TS 重写）

| 函数 | 行数 | 作用 | TS 映射 |
|------|------|------|---------|
| `_av()` | ~8 | 头像 `<div>` | React `<Avatar>` 组件 |
| `_pill()` | ~4 | 人物药丸标签 | React `<PersonPill>` |
| `_tag()` | ~7 | 小标签 | React `<Tag>` |
| `_butterfly_big5()` | ~50 | 双人大五蝴蝶图 | React `<Big5Butterfly>` |
| `_single_big5()` | ~25 | 单人大五水平条 | React `<Big5Chart>` |
| `_mbti_panel()` | ~22 | MBTI 面板 | React `<MbtiPanel>` |
| `_style_panel()` | ~24 | 风格总结 | React `<StylePanel>` |
| `_heatmap_html()` | ~50 | 热力图 HTML+JS | React `<Heatmap>` + inline JS |
| `generate()` | ~130 | 完整 HTML 组装 | React 页面组件 |

**复用边界总结**：
- **CSS**：95% 直接复用。写入 `.css` 文件或 CSS-in-JS。
- **JS 热力图**：100% 直接复用。Vanilla JS 无依赖。
- **Python HTML 生成**：0% 复用代码，100% 复用逻辑结构。每个 `_xxx()` 函数 → 一个 React 组件。

### 5.4 报告页面结构（5 大区域）

```
Header (头像 + VS + 日期)
Stats (3 格：消息数 / 平均字数 / 时间跨度)
Section 1: 消息行为分析 (4 图网格: hourly + monthly_trend + weekday_bar + length_dist)
Heatmap Section: 聊天频率热力图 (年切换 + 双人)
Section 2: 词云 (单人 or 双人对比)
Section 3: 大五人格 (单人水平条 or 双人蝴蝶图)
Section 4: MBTI (双栏面板)
Section 5: AI 总结 (one_line + summary + strengths + fun_facts)
Disclaimer
```

---

## 六、辅助文件

### 6.1 data_loader.py（166 行）

| 功能 | 行数 | 说明 |
|------|------|------|
| 微信表情映射 | 58 | `[Grin]→😁` 等 77 个映射，大小写不敏感正则替换 |
| CSV 加载 + 标准化 | 36 | 列名映射表 8 对，统一到 `content/is_sender/ts` |
| 清洗过滤 `filter_for_personality()` | 23 | 8 条规则：长度 12-150、非噪音、非转发、非纯 emoji、非 XML、非 URL、非多行文档、非常见分享 |

**TS 移植：低**。表情映射直接复制为 `Map<string, string>`，过滤逻辑纯字符串操作。

### 6.2 sampler.py（68 行）

**三层采样策略**：
1. 内容打分 `_score()`：0-10 分。长度 ≤4 + 观点 +3 + 情绪 +2 + 规划 +1 + 问句 +1
2. 按月分层：`总配额 / 月数`，每桶 ≥5 条，按月内分数降序取 top
3. 全局打乱：`random.shuffle()` 消除顺序偏差
4. 安全上限：超过 target_n×1.4 时全局按分数截断

**TS 移植：低**。纯数组操作，无外部依赖。

### 6.3 main.py（277 行）

CLI 编排器，两步工作流：
- **模式 A**（默认）：加载 CSV → 统计 → 生成图表 PNG → 采样消息 → 导出 `personality_input.json`（供 Claude skill 消费）
- **模式 B**（指定 `--personality-result`）：加载 CSV → 统计 → 生成图表 → 读取已有分析结果 JSON → 生成完整 HTML 报告

输入输出：CSV → PNG + JSON + HTML

**TS 移植**：main.py 的编排逻辑会被 React + Electron IPC 架构替代，不需要直接移植。

### 6.4 export_contact.py（423 行）

**不需要移植**。macOS 专用（`~/Library/Containers/com.tencent.xinWeChat/...`），WF 的 `wcdbCore.ts` 已覆盖所有 DB 操作。

---

## 七、移植工作量汇总

| 模块 | 原行数 | TS 行数估算 | 难度 | 依赖替换 |
|------|--------|------------|------|----------|
| `stats.py` | 58 | ~80 | 低 | jieba→nodejieba, pandas→lodash |
| `visualizer.py` | 263 | ~400 | **中** | matplotlib→ECharts, wordcloud→echarts-wordcloud |
| `personality.py` | 142 | ~150 | 低 | anthropic SDK→TS SDK |
| `report.py` CSS | 474 | ~474 | 低 | **直接复制** |
| `report.py` JS | 162 | ~162 | 低 | **直接复制**（Vanilla JS） |
| `report.py` Python | 375 | ~500 | 中 | jinja2→React 组件 |
| `data_loader.py` | 166 | ~120 | 低 | pandas→手写解析 |
| `sampler.py` | 68 | ~70 | 低 | 纯 JS 数组 |
| **总计** | **~1,708** | **~1,960** | | |

实际 TS 新增代码估计 **~1,500 行**（CSS/JS 原样复用为 0，统计/图表/人格分析逻辑适配 ~800 行，React 组件 ~700 行）。
