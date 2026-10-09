import { ConfigService } from './config'
import { wcdbService } from './wcdbService'
import {
  computeWordFrequencySummary,
  rowToMessageRecord,
  TEXT_LOCAL_TYPES,
  type MessageRecord,
  type WordFrequencySummary
} from './wordFrequencyService'
import { join } from 'path'
import { readFile, writeFile, rm } from 'fs/promises'
import { app } from 'electron'
import { createHash } from 'crypto'

export interface ChatStatistics {
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

export interface TimeDistribution {
  hourlyDistribution: Record<number, number>
  weekdayDistribution: Record<number, number>
  monthlyDistribution: Record<string, number>
}

export interface SelfSentDailyDistribution {
  unit: 'day'
  dailyDistribution: Record<string, number>
  totalMessages: number
  firstMessageTime: number | null
  lastMessageTime: number | null
  beginTimestamp: number
  endTimestamp: number
}

export interface ContactRanking {
  username: string
  displayName: string
  avatarUrl?: string
  wechatId?: string
  messageCount: number
  sentCount: number
  receivedCount: number
  lastMessageTime: number | null
}

export interface MessageLengthBucket {
  label: string
  min: number
  max: number | null
  count: number
}

export interface MessageLengthHistogram {
  buckets: MessageLengthBucket[]
  /** 参与分桶的消息数（文本类，== 各桶之和） */
  totalMessages: number
  /** 扫描到的全部消息（任意类型），用于与「总消息数」对照 */
  scannedMessages: number
  /** 内容为空的文本消息数 */
  emptyMessages: number
  /** 文本类消息数（localType 1 / 244813135921），与 getOverallStatistics 同口径 */
  textMessages: number
  /** 文本消息的平均字符数 */
  avgLength: number
  /** 最长文本消息字符数 */
  maxLength: number
  beginTimestamp: number
  endTimestamp: number
}

/**
 * 词频统计结果。
 * `scannedMessages` 与 `textMessages` 分开返回，是为了让前端的交叉校验可见：
 *   scannedMessages  → 应与同页「总消息数」一致（全部类型）
 *   textMessages     → 应与同页「文本类消息数」一致（= summary.totalMessages，参与分词的那批）
 * 两者不一致时属于取数口径问题，不允许用其中任一个去「凑」另一个。
 */
export interface WordFrequencyResult {
  /** null 表示统计范围为全部私聊会话 */
  sessionId: string | null
  scannedMessages: number
  textMessages: number
  summary: WordFrequencySummary
}

/**
 * 一次会话内容扫描的全部产物（长度分桶 + 计数 + 文本消息记录）。
 * 由 getSessionContentScan 产出，被长度直方图与词频统计共用。
 */
interface SessionContentScan {
  /** 与 MESSAGE_LENGTH_BUCKETS 一一对应（只统计文本类消息） */
  bucketCounts: number[]
  /** 扫描到的全部消息（任意类型） */
  scannedMessages: number
  /** 内容为空的文本消息数 */
  emptyMessages: number
  /** 文本类消息数（TEXT_LOCAL_TYPES） */
  textMessages: number
  /** 文本消息长度合计 */
  lengthSum: number
  /** 最长文本消息长度 */
  maxLength: number
  /** 文本类消息的适配结果，供分词使用 */
  records: MessageRecord[]
}

/**
 * 消息长度分桶定义 —— **单一事实来源**：
 * SQL/统计侧与前端 x 轴都不得各自维护一份，前端一律直接渲染接口返回的 label，
 * 否则会出现「各桶之和与总数对不上」的假象。
 */
const MESSAGE_LENGTH_BUCKETS: Array<{ label: string; min: number; max: number | null }> = [
  { label: '空', min: 0, max: 0 },
  { label: '1-10', min: 1, max: 10 },
  { label: '11-20', min: 11, max: 20 },
  { label: '21-40', min: 21, max: 40 },
  { label: '41-80', min: 41, max: 80 },
  { label: '81-160', min: 81, max: 160 },
  { label: '161+', min: 161, max: null }
]

class AnalyticsService {
  private configService: ConfigService
  private fallbackAggregateCache: { key: string; data: any; updatedAt: number } | null = null
  private aggregateCache: { key: string; data: any; updatedAt: number } | null = null
  private selfSentDailyCache: { key: string; data: SelfSentDailyDistribution; updatedAt: number } | null = null
  private wordFrequencyCache: { key: string; data: WordFrequencyResult; updatedAt: number } | null = null
  private contentScanCache: { key: string; data: SessionContentScan; updatedAt: number } | null = null
  private aggregatePromise: { key: string; promise: Promise<{ success: boolean; data?: any; source?: string; error?: string }> } | null = null

  constructor() {
    this.configService = new ConfigService()
  }

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase()
  }

  private normalizeExcludedUsernames(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    const normalized = value
      .map((item) => typeof item === 'string' ? item.trim().toLowerCase() : '')
      .filter((item) => item.length > 0)
    return Array.from(new Set(normalized))
  }

  private getExcludedUsernamesList(): string[] {
    return this.normalizeExcludedUsernames(this.configService.get('analyticsExcludedUsernames'))
  }

  private getExcludedUsernamesSet(): Set<string> {
    return new Set(this.getExcludedUsernamesList())
  }

  private async getAliasMap(usernames: string[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {}
    if (usernames.length === 0) return map

    const result = await wcdbService.getContactAliasMap(usernames)
    if (!result.success || !result.map) return map
    for (const [username, alias] of Object.entries(result.map)) {
      if (username && alias) map[username] = alias
    }

    return map
  }

  private cleanAccountDirName(name: string): string {
    const trimmed = name.trim()
    if (!trimmed) return trimmed
    if (trimmed.toLowerCase().startsWith('wxid_')) {
      const match = trimmed.match(/^(wxid_[^_]+)/i)
      if (match) return match[1]
      return trimmed
    }

    const suffixMatch = trimmed.match(/^(.+)_([a-zA-Z0-9]{4})$/)
    const cleaned = suffixMatch ? suffixMatch[1] : trimmed
    
    return cleaned
  }

  private buildIdentityKeys(raw: string): string[] {
    const value = String(raw || '').trim()
    if (!value) return []
    const lowerRaw = value.toLowerCase()
    const cleaned = this.cleanAccountDirName(value).toLowerCase()
    if (cleaned && cleaned !== lowerRaw) {
      return [cleaned, lowerRaw]
    }
    return [lowerRaw]
  }

  private isPrivateSession(username: string, cleanedWxid: string): boolean {
    if (!username) return false
    if (username.toLowerCase() === cleanedWxid.toLowerCase()) return false
    if (username.includes('@chatroom')) return false
    if (username === 'filehelper') return false
    if (username.startsWith('gh_')) return false

    if (username.toLowerCase() === 'weixin') return false

    const excludeList = [
      'qqmail', 'fmessage', 'medianote', 'floatbottle',
      'newsapp', 'brandsessionholder', 'brandservicesessionholder',
      'notifymessage', 'opencustomerservicemsg', 'notification_messages',
      'userexperience_alarm', 'helper_folders', 'placeholder_foldgroup',
      '@helper_folders', '@placeholder_foldgroup'
    ]

    for (const prefix of excludeList) {
      if (username.startsWith(prefix) || username === prefix) return false
    }

    if (username.includes('@kefu.openim') || username.includes('@openim')) return false
    if (username.includes('service_')) return false

    return true
  }

  private async ensureConnected(): Promise<{ success: boolean; cleanedWxid?: string; error?: string }> {
    const wxid = this.configService.get('myWxid')
    const dbPath = this.configService.get('dbPath')
    const decryptKey = this.configService.get('decryptKey')

    if (!wxid) return { success: false, error: '未配置微信ID' }
    if (!dbPath) return { success: false, error: '未配置数据库路径' }
    if (!decryptKey) return { success: false, error: '未配置解密密钥' }

    const accountDir = this.configService.getAccountDir(dbPath, wxid)
    if (!accountDir) return { success: false, error: '未找到账号目录' }

    const ok = await wcdbService.open(accountDir, decryptKey)
    if (!ok) return { success: false, error: 'WCDB 打开失败' }

    const cleanedWxid = this.cleanAccountDirName(wxid)

    return { success: true, cleanedWxid }
  }

  private async getPrivateSessions(
    cleanedWxid: string,
    excludedUsernames?: Set<string>
  ): Promise<{ usernames: string[]; numericIds: string[] }> {
    const sessionResult = await wcdbService.getSessions()
    if (!sessionResult.success || !sessionResult.sessions) {
      return { usernames: [], numericIds: [] }
    }
    const rows = sessionResult.sessions as Record<string, any>[]
    const excluded = excludedUsernames ?? this.getExcludedUsernamesSet()

    const sample = rows[0]
    void sample

    const sessions = rows.map((row) => {
      const username = row.username || row.user_name || row.userName || ''
      const idValue =
        row.id ??
        row.session_id ??
        row.sessionId ??
        row.sid ??
        row.local_id ??
        row.user_id ??
        row.userId ??
        row.chatroom_id ??
        row.chatroomId ??
        null
      return { username, idValue }
    })
    const usernames = sessions.map((s) => s.username)
    const privateSessions = sessions.filter((s) => {
      if (!this.isPrivateSession(s.username, cleanedWxid)) return false
      if (excluded.size === 0) return true
      return !excluded.has(this.normalizeUsername(s.username))
    })
    const privateUsernames = privateSessions.map((s) => s.username)
    const numericIds = privateSessions
      .map((s) => s.idValue)
      .filter((id) => typeof id === 'number' || (typeof id === 'string' && /^\d+$/.test(id)))
      .map((id) => String(id))
    return { usernames: privateUsernames, numericIds }
  }

  private async iterateSessionMessages(
    sessionId: string,
    onRow: (row: Record<string, any>) => void,
    beginTimestamp = 0,
    endTimestamp = 0
  ): Promise<void> {
    const cursorResult = await wcdbService.openMessageCursor(sessionId, 500, true, beginTimestamp, endTimestamp)
    if (!cursorResult.success || !cursorResult.cursor) return

    try {
      let hasMore = true
      let batchCount = 0
      while (hasMore) {
        const batch = await wcdbService.fetchMessageBatch(cursorResult.cursor)
        if (!batch.success || !batch.rows) break
        for (const row of batch.rows) {
          onRow(row)
        }
        hasMore = batch.hasMore === true

        // 每处理完一个批次，如果已经处理了较多数据，暂时让出执行权
        batchCount++
        if (batchCount % 10 === 0) {
          await new Promise(resolve => setImmediate(resolve))
        }
      }
    } finally {
      await wcdbService.closeMessageCursor(cursorResult.cursor)
    }
  }

  private getRowCreateTime(row: Record<string, any>): number {
    const raw = row.create_time ?? row.createTime ?? row.create_time_ms ?? '0'
    const parsed = parseInt(String(raw), 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return 0
    return parsed > 1e12 ? Math.floor(parsed / 1000) : parsed
  }

  private isRowSentByMe(row: Record<string, any>, cleanedWxid: string): boolean {
    const isSendRaw = row.computed_is_send ?? row.is_send ?? row.isSend ?? row.WCDB_CT_is_send
    const normalized = String(isSendRaw).trim().toLowerCase()
    let isSend = isSendRaw === 1 || isSendRaw === true || normalized === '1' || normalized === 'true'

    const senderUsername = row.sender_username || row.senderUsername || row.sender || row.WCDB_CT_sender_username
    if (senderUsername && cleanedWxid) {
      const senderKeys = this.buildIdentityKeys(String(senderUsername))
      const selfKeys = this.buildIdentityKeys(cleanedWxid)
      const selfMatched = senderKeys.some(senderKey =>
        selfKeys.some(selfKey =>
          senderKey === selfKey ||
          senderKey.startsWith(`${selfKey}_`) ||
          selfKey.startsWith(`${senderKey}_`)
        )
      )
      if (selfMatched) isSend = true
    }

    return isSend
  }

  private formatDayKey(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private sortDailyDistribution(daily: Record<string, number>): Record<string, number> {
    const sorted: Record<string, number> = {}
    for (const key of Object.keys(daily).sort()) {
      sorted[key] = daily[key]
    }
    return sorted
  }

  private completeDailyDistribution(
    daily: Record<string, number>,
    firstTimestamp: number,
    lastTimestamp: number
  ): Record<string, number> {
    if (!firstTimestamp || !lastTimestamp || lastTimestamp < firstTimestamp) {
      return this.sortDailyDistribution(daily)
    }

    const start = new Date(firstTimestamp * 1000)
    const end = new Date(lastTimestamp * 1000)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    const roughDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
    if (roughDays <= 0 || roughDays > 5000) {
      return this.sortDailyDistribution(daily)
    }

    const completed: Record<string, number> = {}
    const cursor = new Date(start)
    while (cursor.getTime() <= end.getTime()) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`
      completed[key] = daily[key] || 0
      cursor.setDate(cursor.getDate() + 1)
    }

    return completed
  }

  private setProgress(window: any, status: string, progress: number) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('analytics:progress', { status, progress })
    }
  }

  private buildAggregateCacheKey(sessionIds: string[], beginTimestamp: number, endTimestamp: number): string {
    if (sessionIds.length === 0) {
      return `${beginTimestamp}-${endTimestamp}-0-empty`
    }
    const normalized = Array.from(new Set(sessionIds.map((id) => String(id)))).sort()
    const hash = createHash('sha1').update(normalized.join('|')).digest('hex').slice(0, 12)
    return `${beginTimestamp}-${endTimestamp}-${normalized.length}-${hash}`
  }

  private async computeAggregateByCursor(sessionIds: string[], beginTimestamp = 0, endTimestamp = 0): Promise<any> {
    const cleanedWxid = this.configService.getMyWxidCleaned() || ''

    const aggregate = {
      total: 0,
      sent: 0,
      received: 0,
      firstTime: 0,
      lastTime: 0,
      typeCounts: {} as Record<number, number>,
      hourly: {} as Record<number, number>,
      weekday: {} as Record<number, number>,
      daily: {} as Record<string, number>,
      sentDaily: {} as Record<string, number>,
      monthly: {} as Record<string, number>,
      sessions: {} as Record<string, { total: number; sent: number; received: number; lastTime: number }>,
      idMap: {}
    }

    for (const sessionId of sessionIds) {
      const sessionStat = { total: 0, sent: 0, received: 0, lastTime: 0 }
      await this.iterateSessionMessages(sessionId, (row) => {
        const createTime = this.getRowCreateTime(row)
        if (!createTime) return
        if (beginTimestamp > 0 && createTime < beginTimestamp) return
        if (endTimestamp > 0 && createTime > endTimestamp) return

        const localType = parseInt(row.local_type || row.type || '1', 10)
        const isSend = this.isRowSentByMe(row, cleanedWxid)

        aggregate.total += 1
        sessionStat.total += 1

        aggregate.typeCounts[localType] = (aggregate.typeCounts[localType] || 0) + 1

        if (isSend) {
          aggregate.sent += 1
          sessionStat.sent += 1
        } else {
          aggregate.received += 1
          sessionStat.received += 1
        }

        if (aggregate.firstTime === 0 || createTime < aggregate.firstTime) {
          aggregate.firstTime = createTime
        }
        if (createTime > aggregate.lastTime) {
          aggregate.lastTime = createTime
        }
        if (createTime > sessionStat.lastTime) {
          sessionStat.lastTime = createTime
        }

        const date = new Date(createTime * 1000)
        const hour = date.getHours()
        const weekday = date.getDay()
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        const dayKey = `${monthKey}-${String(date.getDate()).padStart(2, '0')}`

        aggregate.hourly[hour] = (aggregate.hourly[hour] || 0) + 1
        aggregate.weekday[weekday] = (aggregate.weekday[weekday] || 0) + 1
        aggregate.monthly[monthKey] = (aggregate.monthly[monthKey] || 0) + 1
        aggregate.daily[dayKey] = (aggregate.daily[dayKey] || 0) + 1
        if (isSend) {
          aggregate.sentDaily[dayKey] = (aggregate.sentDaily[dayKey] || 0) + 1
        }
      }, beginTimestamp, endTimestamp)

      if (sessionStat.total > 0) {
        aggregate.sessions[sessionId] = sessionStat
      }
    }

    return aggregate
  }

  private async computeSelfSentDailyDistribution(
    sessionIds: string[],
    cleanedWxid: string,
    beginTimestamp = 0,
    endTimestamp = 0
  ): Promise<SelfSentDailyDistribution> {
    const dailyDistribution: Record<string, number> = {}
    let totalMessages = 0
    let firstMessageTime = 0
    let lastMessageTime = 0

    for (const sessionId of sessionIds) {
      await this.iterateSessionMessages(sessionId, (row) => {
        const createTime = this.getRowCreateTime(row)
        if (!createTime) return
        if (beginTimestamp > 0 && createTime < beginTimestamp) return
        if (endTimestamp > 0 && createTime > endTimestamp) return
        if (!this.isRowSentByMe(row, cleanedWxid)) return

        const dayKey = this.formatDayKey(createTime)
        dailyDistribution[dayKey] = (dailyDistribution[dayKey] || 0) + 1
        totalMessages += 1

        if (firstMessageTime === 0 || createTime < firstMessageTime) {
          firstMessageTime = createTime
        }
        if (createTime > lastMessageTime) {
          lastMessageTime = createTime
        }
      }, beginTimestamp, endTimestamp)
    }

    return {
      unit: 'day',
      dailyDistribution: this.completeDailyDistribution(dailyDistribution, firstMessageTime, lastMessageTime),
      totalMessages,
      firstMessageTime: firstMessageTime || null,
      lastMessageTime: lastMessageTime || null,
      beginTimestamp,
      endTimestamp
    }
  }

  private async getAggregateWithFallback(
    sessionIds: string[],
    beginTimestamp = 0,
    endTimestamp = 0,
    window?: any,
    force = false
  ): Promise<{ success: boolean; data?: any; source?: string; error?: string }> {
    const cacheKey = this.buildAggregateCacheKey(sessionIds, beginTimestamp, endTimestamp)

    if (force) {
      if (this.aggregateCache) this.aggregateCache = null
      if (this.fallbackAggregateCache) this.fallbackAggregateCache = null
    }

    if (!force && this.aggregateCache && this.aggregateCache.key === cacheKey) {
      if (Date.now() - this.aggregateCache.updatedAt < 5 * 60 * 1000) {
        return { success: true, data: this.aggregateCache.data, source: 'cache' }
      }
    }

    // 尝试从文件加载缓存
    if (!force) {
      const fileCache = await this.loadCacheFromFile()
      if (fileCache && fileCache.key === cacheKey) {
        this.aggregateCache = fileCache
        return { success: true, data: fileCache.data, source: 'file-cache' }
      }
    }

    if (this.aggregatePromise && this.aggregatePromise.key === cacheKey) {
      return this.aggregatePromise.promise
    }

    const promise = (async () => {
      const result = await wcdbService.getAggregateStats(sessionIds, beginTimestamp, endTimestamp)
      if (result.success && result.data && result.data.total > 0) {
        this.aggregateCache = { key: cacheKey, data: result.data, updatedAt: Date.now() }
        return { success: true, data: result.data, source: 'dll' }
      }

      if (this.fallbackAggregateCache && this.fallbackAggregateCache.key === cacheKey) {
        if (Date.now() - this.fallbackAggregateCache.updatedAt < 5 * 60 * 1000) {
          return { success: true, data: this.fallbackAggregateCache.data, source: 'cursor-cache' }
        }
      }

      if (window) {
        this.setProgress(window, '原生聚合为0，使用游标统计...', 45)
      }

      const data = await this.computeAggregateByCursor(sessionIds, beginTimestamp, endTimestamp)
      this.fallbackAggregateCache = { key: cacheKey, data, updatedAt: Date.now() }
      this.aggregateCache = { key: cacheKey, data, updatedAt: Date.now() }
      return { success: true, data, source: 'cursor' }
    })()

    this.aggregatePromise = { key: cacheKey, promise }
    try {
      const result = await promise
      // 如果计算成功，同时写入此文件缓存
      if (result.success && result.data && result.source !== 'cache') {
        this.saveCacheToFile({ key: cacheKey, data: this.aggregateCache?.data, updatedAt: Date.now() })
      }
      return result
    } finally {
      if (this.aggregatePromise && this.aggregatePromise.key === cacheKey) {
        this.aggregatePromise = null
      }
    }
  }

  private getCacheFilePath(): string {
    return join(app.getPath('documents'), 'WeFlow', 'analytics_cache.json')
  }

  private async loadCacheFromFile(): Promise<{ key: string; data: any; updatedAt: number } | null> {
    try {
      const raw = await readFile(this.getCacheFilePath(), 'utf-8')
      return JSON.parse(raw)
    } catch { return null }
  }

  private async saveCacheToFile(data: any) {
    try {
      await writeFile(this.getCacheFilePath(), JSON.stringify(data))
    } catch (e) {
      console.error('保存统计缓存失败:', e)
    }
  }

  private normalizeAggregateSessions(
    sessions: Record<string, any> | undefined,
    idMap: Record<string, string> | undefined
  ): Record<string, any> {
    if (!sessions) return {}
    if (!idMap) return sessions
    const keys = Object.keys(sessions)
    if (keys.length === 0) return sessions
    const numericKeys = keys.every((k) => /^\d+$/.test(k))
    if (!numericKeys) return sessions
    const remapped: Record<string, any> = {}
    for (const [id, stat] of Object.entries(sessions)) {
      const username = idMap[id] || id
      remapped[username] = stat
    }
    return remapped
  }

  private async logAggregateDiagnostics(sessionIds: string[]): Promise<void> {
    const samples = sessionIds.slice(0, 5)
    const results = await Promise.all(samples.map(async (sessionId) => {
      const countResult = await wcdbService.getMessageCount(sessionId)
      return { sessionId, success: countResult.success, count: countResult.count, error: countResult.error }
    }))
    void results
  }

  async getExcludedUsernames(): Promise<{ success: boolean; data?: string[]; error?: string }> {
    try {
      return { success: true, data: this.getExcludedUsernamesList() }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async setExcludedUsernames(usernames: string[]): Promise<{ success: boolean; data?: string[]; error?: string }> {
    try {
      const normalized = this.normalizeExcludedUsernames(usernames)
      this.configService.set('analyticsExcludedUsernames', normalized)
      await this.clearCache()
      return { success: true, data: normalized }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async getExcludeCandidates(): Promise<{ success: boolean; data?: Array<{ username: string; displayName: string; avatarUrl?: string; wechatId?: string }>; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const excluded = this.getExcludedUsernamesSet()
      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid, new Set())

      const usernames = new Set<string>(sessionInfo.usernames)
      for (const name of excluded) usernames.add(name)

      if (usernames.size === 0) {
        return { success: true, data: [] }
      }

      const usernameList = Array.from(usernames)
      const [displayNames, avatarUrls, aliasMap] = await Promise.all([
        wcdbService.getDisplayNames(usernameList),
        wcdbService.getAvatarUrls(usernameList),
        this.getAliasMap(usernameList)
      ])

      const entries = usernameList.map((username) => {
        const displayName = displayNames.success && displayNames.map
          ? (displayNames.map[username] || username)
          : username
        const avatarUrl = avatarUrls.success && avatarUrls.map
          ? avatarUrls.map[username]
          : undefined
        const alias = aliasMap[username]
        const wechatId = alias || (!username.startsWith('wxid_') ? username : '')
        return { username, displayName, avatarUrl, wechatId }
      })

      return { success: true, data: entries }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async getOverallStatistics(force = false): Promise<{ success: boolean; data?: ChatStatistics; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
      if (sessionInfo.usernames.length === 0) {
        return { success: false, error: '未找到消息会话' }
      }

      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.getAllWindows()[0]
      this.setProgress(win, '正在执行原生数据聚合...', 30)

      const result = await this.getAggregateWithFallback(sessionInfo.usernames, 0, 0, win, force)

      if (!result.success || !result.data) {
        return { success: false, error: result.error || '聚合统计失败' }
      }

      this.setProgress(win, '同步分析结果...', 90)
      const d = result.data
      if (d.total === 0 && sessionInfo.usernames.length > 0) {
        await this.logAggregateDiagnostics(sessionInfo.usernames)
      }

      const textTypes = [1, 244813135921]
      let textMessages = 0
      for (const t of textTypes) textMessages += (d.typeCounts[t] || 0)
      const imageMessages = d.typeCounts[3] || 0
      const voiceMessages = d.typeCounts[34] || 0
      const videoMessages = d.typeCounts[43] || 0
      const emojiMessages = d.typeCounts[47] || 0
      const otherMessages = d.total - textMessages - imageMessages - voiceMessages - videoMessages - emojiMessages

      // 活跃天数 = 有消息的自然日去重计数（键形态 YYYY-MM-DD）。
      // 两条聚合路径都会产出 d.daily，因此这里不需要为它单独再遍历一次数据库：
      //   - 游标回退路径：computeAggregateByCursor 的 dayKey（dayKey = 上文 monthKey + '-' + 日）
      //   - 原生路径：wcdb_get_aggregate_stats 返回的 JSON 自带 daily
      //     （本机真实库实测：daily 553 个键、键值合计 == total == 100746）
      // 与 groupAnalyticsService / insightProfileService 的 activeDays（Set.size）口径一致。
      const dailyCounts = d.daily && typeof d.daily === 'object' ? d.daily : null
      const activeDays = dailyCounts ? Object.keys(dailyCounts).length : 0
      if (d.total > 0 && activeDays === 0) {
        console.warn('[analytics] 聚合结果缺少 daily 明细，活跃天数无法精确计算（已降级为 0）')
      }

      return {
        success: true,
        data: {
          totalMessages: d.total,
          textMessages,
          imageMessages,
          voiceMessages,
          videoMessages,
          emojiMessages,
          otherMessages: Math.max(0, otherMessages),
          sentMessages: d.sent,
          receivedMessages: d.received,
          firstMessageTime: d.firstTime || null,
          lastMessageTime: d.lastTime || null,
          activeDays,
          messageTypeCounts: d.typeCounts
        }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async getContactRankings(
    limit: number = 20,
    beginTimestamp: number = 0,
    endTimestamp: number = 0
  ): Promise<{ success: boolean; data?: ContactRanking[]; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
      if (sessionInfo.usernames.length === 0) {
        return { success: false, error: '未找到消息会话' }
      }

      const result = await this.getAggregateWithFallback(sessionInfo.usernames, beginTimestamp, endTimestamp)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || '聚合统计失败' }
      }

      const d = result.data
      const sessions = this.normalizeAggregateSessions(d.sessions, d.idMap)
      const usernames = Object.keys(sessions)
      const [displayNames, avatarUrls, aliasMap] = await Promise.all([
        wcdbService.getDisplayNames(usernames),
        wcdbService.getAvatarUrls(usernames),
        this.getAliasMap(usernames)
      ])

      const rankings: ContactRanking[] = usernames
        .map((username) => {
          const stat = sessions[username]
          const displayName = displayNames.success && displayNames.map
            ? (displayNames.map[username] || username)
            : username
          const avatarUrl = avatarUrls.success && avatarUrls.map
            ? avatarUrls.map[username]
            : undefined
          const alias = aliasMap[username] || ''
          const wechatId = alias || (!username.startsWith('wxid_') ? username : '')
          return {
            username,
            displayName,
            avatarUrl,
            wechatId,
            messageCount: stat.total,
            sentCount: stat.sent,
            receivedCount: stat.received,
            lastMessageTime: stat.lastTime || null
          }
        })
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, limit)

      return { success: true, data: rankings }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async getTimeDistribution(): Promise<{ success: boolean; data?: TimeDistribution; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
      if (sessionInfo.usernames.length === 0) {
        return { success: false, error: '未找到消息会话' }
      }

      const result = await this.getAggregateWithFallback(sessionInfo.usernames, 0, 0)
      if (!result.success || !result.data) {
        return { success: false, error: result.error || '聚合统计失败' }
      }

      const d = result.data

      // SQLite strftime('%w') 返回 0=周日, 1=周一...6=周六
      // 前端期望 1=周一...7=周日
      const weekdayDistribution: Record<number, number> = {}
      for (const [w, count] of Object.entries(d.weekday)) {
        const sqliteW = parseInt(w, 10)
        const jsW = sqliteW === 0 ? 7 : sqliteW
        weekdayDistribution[jsW] = count as number
      }

      // 补全 24 小时
      const hourlyDistribution: Record<number, number> = {}
      for (let i = 0; i < 24; i++) {
        hourlyDistribution[i] = d.hourly[i] || 0
      }

      return {
        success: true,
        data: {
          hourlyDistribution,
          weekdayDistribution,
          monthlyDistribution: d.monthly
        }
      }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  /**
   * 消息长度直方图。
   *
   * 取数路线：**游标**（iterateSessionMessages），不是 SQL。理由：
   *  - 与 getOverallStatistics / getTimeDistribution 使用同一份会话集与同一套行字段解析，
   *    所以「各桶之和 == 总消息数」是构造上成立的，而不是巧合；
   *  - 不拼 SQL ⇒ 不引入注入面（wcdb_exec_query 在本仓库无法做参数绑定，见 wcdbCore.ts:4064）；
   *  - 代价是一次全量游标遍历（本机 10 万条量级为秒级），故加 5 分钟内存缓存。
   *
   * 长度口径：只统计**文本类消息**（localType 1 / 244813135921）的原始内容字符数，
   * 故「各桶之和 == totalMessages == 文本类消息数」，与页面统计口径可直接对照；
   * 非文本消息（图片/语音/XML 类）长度没有可比性，单独用 scannedMessages 报告总数。
   * 字符数用 JS `String.length`（UTF-16 码元），与 insightProfileService 的 content.length 一致，
   * emoji 按 2 计。
   */
  async getMessageLengthHistogram(
    beginTimestamp = 0,
    endTimestamp = 0,
    force = false
  ): Promise<{ success: boolean; data?: MessageLengthHistogram; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
      if (sessionInfo.usernames.length === 0) {
        return { success: false, error: '未找到消息会话' }
      }

      const scan = await this.getSessionContentScan(sessionInfo.usernames, beginTimestamp, endTimestamp, force, '正在统计消息长度分布')

      const data: MessageLengthHistogram = {
        buckets: MESSAGE_LENGTH_BUCKETS.map((bucket, index) => ({
          label: bucket.label,
          min: bucket.min,
          max: bucket.max,
          count: scan.bucketCounts[index]
        })),
        totalMessages: scan.textMessages,
        scannedMessages: scan.scannedMessages,
        emptyMessages: scan.emptyMessages,
        textMessages: scan.textMessages,
        avgLength: scan.textMessages > 0 ? Number((scan.lengthSum / scan.textMessages).toFixed(2)) : 0,
        maxLength: scan.maxLength,
        beginTimestamp,
        endTimestamp
      }

      return { success: true, data }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  /**
   * 会话内容扫描 —— 消息长度直方图与词频共用同一次游标遍历。
   *
   * 两个功能都要逐条读 message_content，各自扫一遍等于把 10 万条消息读两次；
   * 这里把「扫描 + 分桶 + 适配 MessageRecord」收敛到一处，按会话集/时间范围缓存 5 分钟，
   * 谁先调用谁触发扫描，后调用的直接复用。
   */
  private async getSessionContentScan(
    sessionIds: string[],
    beginTimestamp: number,
    endTimestamp: number,
    force: boolean,
    progressLabel: string
  ): Promise<SessionContentScan> {
    const cacheKey = this.buildAggregateCacheKey(sessionIds, beginTimestamp, endTimestamp)
    if (force) this.contentScanCache = null
    if (
      !force &&
      this.contentScanCache &&
      this.contentScanCache.key === cacheKey &&
      Date.now() - this.contentScanCache.updatedAt < 5 * 60 * 1000
    ) {
      return this.contentScanCache.data
    }

    const { BrowserWindow } = require('electron')
    const win = BrowserWindow.getAllWindows()[0]

    const scan: SessionContentScan = {
      bucketCounts: new Array<number>(MESSAGE_LENGTH_BUCKETS.length).fill(0),
      scannedMessages: 0,
      emptyMessages: 0,
      textMessages: 0,
      lengthSum: 0,
      maxLength: 0,
      records: []
    }

    for (let index = 0; index < sessionIds.length; index++) {
      await this.iterateSessionMessages(sessionIds[index], (row) => {
        const createTime = this.getRowCreateTime(row)
        if (!createTime) return
        if (beginTimestamp > 0 && createTime < beginTimestamp) return
        if (endTimestamp > 0 && createTime > endTimestamp) return

        const localType = parseInt(row.local_type || row.type || '1', 10)
        const isText = TEXT_LOCAL_TYPES.includes(localType)
        scan.scannedMessages += 1
        if (!isText) return

        scan.textMessages += 1

        const rawContent =
          row.StrContent ??
          row.message_content ??
          row.messageContent ??
          row.msg_content ??
          row.content ??
          ''
        const length = String(rawContent).length

        if (length === 0) scan.emptyMessages += 1
        scan.lengthSum += length
        if (length > scan.maxLength) scan.maxLength = length

        for (let i = 0; i < MESSAGE_LENGTH_BUCKETS.length; i++) {
          const bucket = MESSAGE_LENGTH_BUCKETS[i]
          if (length >= bucket.min && (bucket.max === null || length <= bucket.max)) {
            scan.bucketCounts[i] += 1
            break
          }
        }

        const record = rowToMessageRecord(row)
        if (record) scan.records.push(record)
      }, beginTimestamp, endTimestamp)

      if (sessionIds.length > 1) {
        this.setProgress(
          win,
          `${progressLabel}... (${index + 1}/${sessionIds.length} 个会话)`,
          Math.floor(((index + 1) / sessionIds.length) * 60)
        )
      }
    }

    this.contentScanCache = { key: cacheKey, data: scan, updatedAt: Date.now() }
    return scan
  }

  /**
   * 词频/词云取数。
   *
   * 接线说明（原 wordFrequencyService 是零引用孤立服务，断点不在 IPC 而在适配器）：
   * 本方法负责「取会话消息 → rowToMessageRecord 适配 → 分词统计」，三者中
   * 适配器与分词入口都在 wordFrequencyService 内（rowToMessageRecord /
   * computeWordFrequencySummary），这里只做编排，避免把 DB 细节塞进纯统计模块。
   *
   * 只对文本类消息（TEXT_LOCAL_TYPES）分词：其他类型的内容是 XML（appmsg/msg/...），
   * 进去只会把标签名变成高频词。scannedMessages 仍统计全部类型，便于与页面总数对照。
   */
  async getWordFrequency(
    sessionId?: string,
    force = false
  ): Promise<{ success: boolean; data?: WordFrequencyResult; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const target = String(sessionId || '').trim()
      let sessionIds: string[]
      if (target) {
        sessionIds = [target]
      } else {
        const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
        sessionIds = sessionInfo.usernames
        if (sessionIds.length === 0) return { success: false, error: '未找到消息会话' }
      }

      const cacheKey = `word-freq-${this.buildAggregateCacheKey(sessionIds, 0, 0)}`
      if (force) this.wordFrequencyCache = null
      if (
        !force &&
        this.wordFrequencyCache &&
        this.wordFrequencyCache.key === cacheKey &&
        Date.now() - this.wordFrequencyCache.updatedAt < 5 * 60 * 1000
      ) {
        return { success: true, data: this.wordFrequencyCache.data }
      }

      const scan = await this.getSessionContentScan(sessionIds, 0, 0, force, '正在统计词频')

      const { BrowserWindow } = require('electron')
      const win = BrowserWindow.getAllWindows()[0]
      this.setProgress(win, '正在分词...', 70)
      const summary = await computeWordFrequencySummary(scan.records)

      const data: WordFrequencyResult = {
        sessionId: target || null,
        scannedMessages: scan.scannedMessages,
        textMessages: scan.textMessages,
        summary
      }

      this.wordFrequencyCache = { key: cacheKey, data, updatedAt: Date.now() }
      this.setProgress(win, '词频统计完成', 100)
      return { success: true, data }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async getSelfSentDailyDistribution(
    beginTimestamp: number = 0,
    endTimestamp: number = 0,
    force = false
  ): Promise<{ success: boolean; data?: SelfSentDailyDistribution; error?: string }> {
    try {
      const conn = await this.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const sessionInfo = await this.getPrivateSessions(conn.cleanedWxid)
      if (sessionInfo.usernames.length === 0) {
        return { success: false, error: '未找到消息会话' }
      }

      const cacheKey = `self-sent-daily-${this.buildAggregateCacheKey(sessionInfo.usernames, beginTimestamp, endTimestamp)}`
      if (force) this.selfSentDailyCache = null

      if (!force && this.selfSentDailyCache && this.selfSentDailyCache.key === cacheKey) {
        if (Date.now() - this.selfSentDailyCache.updatedAt < 5 * 60 * 1000) {
          return { success: true, data: this.selfSentDailyCache.data }
        }
      }

      const data = await this.computeSelfSentDailyDistribution(
        sessionInfo.usernames,
        conn.cleanedWxid,
        beginTimestamp,
        endTimestamp
      )
      const verifiedData = data

      this.selfSentDailyCache = { key: cacheKey, data: verifiedData, updatedAt: Date.now() }

      return { success: true, data: verifiedData }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }

  async clearCache(): Promise<{ success: boolean; error?: string }> {
    this.aggregateCache = null
    this.fallbackAggregateCache = null
    this.selfSentDailyCache = null
    this.wordFrequencyCache = null
    this.contentScanCache = null
    this.aggregatePromise = null
    try {
      await rm(this.getCacheFilePath(), { force: true })
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }
}

export const analyticsService = new AnalyticsService()
