/**
 * wordFrequencyService.ts — 中文词频统计服务
 * 移植自 ginger_wechat_portrait/stats.py (57行)
 *
 * 提供 jieba 分词 + 停用词过滤 + emoji 统计 + 时序分布
 * WF analyticsService 无词频/分词功能，此为 net-new 能力
 */

// jieba-wasm 是 CJS wasm-pack 模块，require 加载
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { cut } = require('jieba-wasm') as { cut: (text: string, hmm?: boolean) => string[] }

// ── Emoji regex ────────────────────────────────────────────────────────────────
const EMOJI_RE =
  /[\u{1F300}-\u{1FFFF}\u{02600}-\u{027BF}]+/gu

// ── 中文停用词 ──────────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '你', '他', '她', '它', '们', '这', '那',
  '就', '都', '和', '与', '但', '也', '很', '有', '没', '不', '一', '个',
  '上', '对', '说', '好', '要', '么', '啊', '呢', '吧', '哦', '嗯', '然后',
  '所以', '因为', '如果', '可以', '还是', '已经', '什么', '怎么', '为什么',
  '就是', '还有', '其实', '感觉', '觉得', '现在', '时候', '一个',
  '这个', '那个', '一下', '一起', '一直', '一样', '一点', '一些',
])

// ── 类型 ────────────────────────────────────────────────────────────────────────
export interface WordFrequencyStats {
  totalMessages: number
  totalChars: number
  avgLength: number
  dateRange: [string, string] | null
  dailyCounts: Record<string, number>
  hourlyCounts: number[]
  monthlyCounts: Record<string, number>
  weekdayCounts: number[]
  wordFreq: Record<string, number>
  emojiFreq: Record<string, number>
  lengthSeries: number[]
}

export interface MessageRecord {
  content: string
  date: string       // 'YYYY-MM-DD'
  hour: number       // 0-23
  month: string      // 'YYYY-MM'
  weekday: number    // 0=Mon, 6=Sun
}

// ── 工具函数 ────────────────────────────────────────────────────────────────────

function toMappedCounter(items: string[]): Record<string, number> {
  const counter: Record<string, number> = {}
  for (const item of items) {
    counter[item] = (counter[item] || 0) + 1
  }
  return counter
}

function mergeCounters(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value
  }
}

// ── 核心计算 ────────────────────────────────────────────────────────────────────

/**
 * 从消息列表中计算词频统计指标。
 * 对标 GW stats.py compute(df) — 11 维统计量 + 词频 + emoji 频率
 */
export function computeWordFrequency(records: MessageRecord[]): WordFrequencyStats {
  const contents = records.map((r) => r.content)

  // 时序统计
  const dailyCounts: Record<string, number> = {}
  const hourlyRaw: number[] = new Array(24).fill(0)
  const monthlyCounts: Record<string, number> = {}
  const weekdayRaw: number[] = new Array(7).fill(0)
  const lengthSeries: number[] = []
  let totalChars = 0

  const dates: string[] = []

  for (const rec of records) {
    dailyCounts[rec.date] = (dailyCounts[rec.date] || 0) + 1
    hourlyRaw[rec.hour] += 1
    monthlyCounts[rec.month] = (monthlyCounts[rec.month] || 0) + 1
    weekdayRaw[rec.weekday] += 1
    const len = rec.content.length
    lengthSeries.push(len)
    totalChars += len
    dates.push(rec.date)
  }

  // 中文分词
  const allText = contents.join(' ')
  const words = cut(allText).filter(
    (w) => w.length > 1 && !STOP_WORDS.has(w) && !/^\s+$/.test(w)
  )
  const wordFreq = toMappedCounter(words)

  // emoji 统计
  const allEmojis: string[] = []
  for (const text of contents) {
    const matches = text.match(EMOJI_RE)
    if (matches) allEmojis.push(...matches)
  }
  const emojiFreq = toMappedCounter(allEmojis)

  // 日期范围
  const sortedDates = dates.filter(Boolean).sort()
  const dateRange: [string, string] | null =
    sortedDates.length > 0
      ? [sortedDates[0], sortedDates[sortedDates.length - 1]]
      : null

  return {
    totalMessages: records.length,
    totalChars,
    avgLength: records.length > 0 ? Math.round((totalChars / records.length) * 10) / 10 : 0,
    dateRange,
    dailyCounts,
    hourlyCounts: hourlyRaw,
    monthlyCounts,
    weekdayCounts: weekdayRaw,
    wordFreq,
    emojiFreq,
    lengthSeries,
  }
}

/**
 * 从词频表中提取 top-N 词条，供词云/柱状图展示
 */
export function topFreq(freq: Record<string, number>, n: number = 100): [string, number][] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

// ── 接线层：DB 行 → MessageRecord 适配器 + 分块编排入口 ──────────────────────────
//
// 断点说明（原实现为零引用的孤立服务）：
//   computeWordFrequency 要的是已切好 date/hour/month/weekday 的 MessageRecord，
//   而库里取出来的是原始行（只有 create_time 时间戳 + message_content）。
//   中间那层适配器原本全项目不存在 —— 下面这段就是它。

/** 文本类消息的 localType（与 analyticsService 的 textTypes 口径一致） */
export const TEXT_LOCAL_TYPES = [1, 244813135921]

/**
 * 把一行消息记录适配成 MessageRecord。
 * 时间派生与 analyticsService 的 monthKey/dayKey 保持同一写法（本地时区）。
 * weekday 契约见 MessageRecord 注释：0=周一 … 6=周日（JS getDay() 是 0=周日，故此处换算）。
 */
export function rowToMessageRecord(row: Record<string, any>): MessageRecord | null {
  const rawContent =
    row?.StrContent ??
    row?.message_content ??
    row?.messageContent ??
    row?.msg_content ??
    row?.content ??
    ''
  const content = typeof rawContent === 'string' ? rawContent : String(rawContent ?? '')

  const rawTime = row?.create_time ?? row?.createTime ?? row?.create_time_ms ?? 0
  const parsed = parseInt(String(rawTime), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  const seconds = parsed > 1e12 ? Math.floor(parsed / 1000) : parsed

  const date = new Date(seconds * 1000)
  const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  return {
    content,
    date: `${month}-${String(date.getDate()).padStart(2, '0')}`,
    hour: date.getHours(),
    month,
    weekday: (date.getDay() + 6) % 7
  }
}

/** 供 IPC 返回的紧凑结果：不含 lengthSeries（10 万条序列没有展示价值，只会撑爆 IPC 载荷） */
export interface WordFrequencySummary {
  totalMessages: number
  totalChars: number
  avgLength: number
  dateRange: [string, string] | null
  dailyCounts: Record<string, number>
  hourlyCounts: number[]
  monthlyCounts: Record<string, number>
  weekdayCounts: number[]
  topWords: Array<{ phrase: string; count: number }>
  topEmojis: Array<{ phrase: string; count: number }>
  distinctWords: number
}

/**
 * 分块调用 computeWordFrequency 并合并结果。
 *
 * 为什么不直接 computeWordFrequency(全部 records)：
 * 它内部把整个语料拼成一个字符串做一次 cut()，10 万条消息会得到 5MB 级输入，
 * 单次调用会长时间占住主进程且内存尖峰很高。分块后每块只喂几千条，
 * 并在块间 setImmediate 让出事件循环，主进程仍能处理窗口事件。
 * 分词结果与整体调用等价：原实现用 ' ' 拼接语料，词不会跨消息边界。（已注释固定该前提）
 */
export async function computeWordFrequencySummary(
  records: MessageRecord[],
  chunkSize = 2000
): Promise<WordFrequencySummary> {
  const dailyCounts: Record<string, number> = {}
  const monthlyCounts: Record<string, number> = {}
  const wordFreq: Record<string, number> = {}
  const emojiFreq: Record<string, number> = {}
  const hourlyCounts = new Array(24).fill(0)
  const weekdayCounts = new Array(7).fill(0)
  let totalMessages = 0
  let totalChars = 0
  let minDate: string | null = null
  let maxDate: string | null = null

  const size = Math.max(1, chunkSize)
  for (let offset = 0; offset < records.length; offset += size) {
    const stats = computeWordFrequency(records.slice(offset, offset + size))
    totalMessages += stats.totalMessages
    totalChars += stats.totalChars
    mergeCounters(dailyCounts, stats.dailyCounts)
    mergeCounters(monthlyCounts, stats.monthlyCounts)
    mergeCounters(wordFreq, stats.wordFreq)
    mergeCounters(emojiFreq, stats.emojiFreq)
    for (let i = 0; i < 24; i++) hourlyCounts[i] += stats.hourlyCounts[i] || 0
    for (let i = 0; i < 7; i++) weekdayCounts[i] += stats.weekdayCounts[i] || 0
    if (stats.dateRange) {
      if (!minDate || stats.dateRange[0] < minDate) minDate = stats.dateRange[0]
      if (!maxDate || stats.dateRange[1] > maxDate) maxDate = stats.dateRange[1]
    }
    await new Promise((resolve) => setImmediate(resolve))
  }

  return {
    totalMessages,
    totalChars,
    avgLength: totalMessages > 0 ? Math.round((totalChars / totalMessages) * 10) / 10 : 0,
    dateRange: minDate && maxDate ? [minDate, maxDate] : null,
    dailyCounts,
    hourlyCounts,
    monthlyCounts,
    weekdayCounts,
    topWords: topFreq(wordFreq, 100).map(([phrase, count]) => ({ phrase, count })),
    topEmojis: topFreq(emojiFreq, 30).map(([phrase, count]) => ({ phrase, count })),
    distinctWords: Object.keys(wordFreq).length
  }
}
