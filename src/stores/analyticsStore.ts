import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChatStatistics {
  totalMessages: number
  textMessages: number
  imageMessages: number
  voiceMessages: number
  videoMessages: number
  emojiMessages: number
  otherMessages: number
  sentMessages: number
  receivedMessages: number
  firstMessageTime: number | null
  lastMessageTime: number | null
  activeDays: number
  messageTypeCounts: Record<number, number>
}

interface ContactRanking {
  username: string
  displayName: string
  avatarUrl?: string
  messageCount: number
  sentCount: number
  receivedCount: number
  lastMessageTime: number | null
}

interface TimeDistribution {
  hourlyDistribution: Record<number, number>
  monthlyDistribution: Record<string, number>
}

interface SelfSentDailyDistribution {
  unit: 'day'
  dailyDistribution: Record<string, number>
  totalMessages: number
  firstMessageTime: number | null
  lastMessageTime: number | null
  beginTimestamp: number
  endTimestamp: number
}

interface MessageLengthBucket {
  label: string
  min: number
  max: number | null
  count: number
}

interface MessageLengthHistogram {
  buckets: MessageLengthBucket[]
  totalMessages: number
  scannedMessages: number
  emptyMessages: number
  textMessages: number
  avgLength: number
  maxLength: number
  beginTimestamp: number
  endTimestamp: number
}

interface WordFrequencyWord {
  phrase: string
  count: number
}

interface WordFrequencyData {
  /** 扫描到的全部消息（任意类型）——应与「总消息数」一致 */
  scannedMessages: number
  /** 参与分词的文本类消息数 */
  textMessages: number
  distinctWords: number
  avgLength: number
  topWords: WordFrequencyWord[]
  topEmojis: WordFrequencyWord[]
}

interface AnalyticsState {
  // 数据
  statistics: ChatStatistics | null
  rankings: ContactRanking[]
  timeDistribution: TimeDistribution | null
  selfSentDailyDistribution: SelfSentDailyDistribution | null
  messageLengthHistogram: MessageLengthHistogram | null
  wordFrequency: WordFrequencyData | null

  // 状态
  isLoaded: boolean
  lastLoadTime: number | null

  // Actions
  setStatistics: (data: ChatStatistics) => void
  setRankings: (data: ContactRanking[]) => void
  setTimeDistribution: (data: TimeDistribution) => void
  setSelfSentDailyDistribution: (data: SelfSentDailyDistribution) => void
  setMessageLengthHistogram: (data: MessageLengthHistogram) => void
  setWordFrequency: (data: WordFrequencyData) => void
  markLoaded: () => void
  clearCache: () => void
}

export const useAnalyticsStore = create<AnalyticsState>()(
  persist(
    (set) => ({
      statistics: null,
      rankings: [],
      timeDistribution: null,
      selfSentDailyDistribution: null,
      messageLengthHistogram: null,
      wordFrequency: null,
      isLoaded: false,
      lastLoadTime: null,

      setStatistics: (data) => set({ statistics: data }),
      setRankings: (data) => set({ rankings: data }),
      setTimeDistribution: (data) => set({ timeDistribution: data }),
      setSelfSentDailyDistribution: (data) => set({ selfSentDailyDistribution: data }),
      setMessageLengthHistogram: (data) => set({ messageLengthHistogram: data }),
      setWordFrequency: (data) => set({ wordFrequency: data }),
      markLoaded: () => set({ isLoaded: true, lastLoadTime: Date.now() }),
      clearCache: () => set({
        statistics: null,
        rankings: [],
        timeDistribution: null,
        selfSentDailyDistribution: null,
        messageLengthHistogram: null,
        wordFrequency: null,
        isLoaded: false,
        lastLoadTime: null
      }),
    }),
    {
      name: 'analytics-storage',
      // v2：旧持久化状态里 statistics.activeDays 是「月份数 × 20」的假指标（真机曾显示 400），
      // 且没有 messageLengthHistogram / wordFrequency 字段 —— 版本号一改即丢弃旧缓存，
      // 避免假数字与新图表被浏览器里的旧状态续命。
      version: 2,
    }
  )
)
