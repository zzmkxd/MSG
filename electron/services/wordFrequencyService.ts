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

function reindexArray<T>(arr: T[], length: number, fill: T): T[] {
  const result: T[] = []
  for (let i = 0; i < length; i++) {
    result[i] = arr[i] ?? fill
  }
  return result
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
