/**
 * 资源页媒体元数据索引（参考 wechat-decrypt media_manifest / 会话 type stats）。
 * - totals：用 native message type stats 求和，不拉缩略图
 * - index：后台翻 getMediaStream 全量元数据并落盘，UI 可立刻滚动已索引部分
 */
import { app, BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { wcdbService } from './wcdbService'
import { chatService } from './chatService'

export type MediaIndexMediaType = 'image' | 'video' | 'all'

export type MediaIndexItem = {
  sessionId: string
  sessionDisplayName?: string
  mediaType: 'image' | 'video'
  localId: number
  serverId?: string
  createTime: number
  localType: number
  senderUsername?: string
  isSend?: number | null
  imageMd5?: string
  imageDatName?: string
  videoMd5?: string
  content?: string
}

export type MediaIndexFilter = {
  sessionId?: string
  mediaType?: MediaIndexMediaType
  beginTimestamp?: number
  endTimestamp?: number
}

export type MediaIndexProgress = {
  key: string
  status: 'idle' | 'building' | 'ready' | 'error'
  indexed: number
  totalEstimated: number | null
  error?: string
  fromCache?: boolean
  /** 本轮新增元数据（避免每次推全量） */
  itemsDelta?: MediaIndexItem[]
  /** ready + fromCache 时带全量，便于首屏一次灌入 */
  items?: MediaIndexItem[]
}

type DiskIndexPayload = {
  version: 1
  key: string
  builtAt: number
  accountHint: string
  filter: MediaIndexFilter
  totalEstimated: number | null
  items: MediaIndexItem[]
}

const INDEX_VERSION = 1
const STREAM_PAGE = 240
const SAVE_EVERY = 480
const YIELD_MS = 8

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toInt(value: unknown): number {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

function normalizeFilter(filter: MediaIndexFilter = {}): Required<MediaIndexFilter> {
  return {
    sessionId: String(filter.sessionId || '').trim(),
    mediaType: (filter.mediaType === 'video' || filter.mediaType === 'all' ? filter.mediaType : 'image'),
    beginTimestamp: toInt(filter.beginTimestamp),
    endTimestamp: toInt(filter.endTimestamp)
  }
}

function filterKey(filter: Required<MediaIndexFilter>, accountHint: string): string {
  const raw = JSON.stringify({ v: INDEX_VERSION, accountHint, ...filter })
  return createHash('sha1').update(raw).digest('hex').slice(0, 24)
}

function itemKey(item: MediaIndexItem): string {
  return [
    item.mediaType,
    item.sessionId,
    item.localId,
    item.createTime,
    item.imageMd5 || item.imageDatName || item.videoMd5 || ''
  ].join('|')
}

class MediaIndexService {
  private memory = new Map<string, DiskIndexPayload>()
  private building = new Map<string, Promise<MediaIndexProgress>>()
  private lastProgress: MediaIndexProgress = {
    key: '',
    status: 'idle',
    indexed: 0,
    totalEstimated: null
  }

  private cacheDir(): string {
    const root = app?.getPath?.('userData') || process.cwd()
    const dir = join(root, 'media-index')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
  }

  private cachePath(key: string): string {
    return join(this.cacheDir(), `media-index-${key}.json`)
  }

  private emit(progress: MediaIndexProgress): void {
    this.lastProgress = progress
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('chat:mediaIndexProgress', progress)
      } catch {
        // ignore
      }
    }
  }

  getProgress(): MediaIndexProgress {
    return { ...this.lastProgress }
  }

  private readDisk(key: string): DiskIndexPayload | null {
    try {
      const path = this.cachePath(key)
      if (!existsSync(path)) return null
      const raw = JSON.parse(readFileSync(path, 'utf8')) as DiskIndexPayload
      if (!raw || raw.version !== 1 || raw.key !== key || !Array.isArray(raw.items)) return null
      return raw
    } catch {
      return null
    }
  }

  private writeDisk(payload: DiskIndexPayload): void {
    try {
      writeFileSync(this.cachePath(payload.key), JSON.stringify(payload), 'utf8')
    } catch (error) {
      console.warn('[mediaIndex] write disk failed:', error)
    }
  }

  private async resolveAccountHint(): Promise<string> {
    try {
      const sessions = await chatService.getSessions()
      if (sessions?.success && Array.isArray(sessions.sessions) && sessions.sessions.length > 0) {
        const first = String(sessions.sessions[0]?.username || sessions.sessions[0]?.sessionId || '')
        return createHash('sha1').update(`n=${sessions.sessions.length}|${first}`).digest('hex').slice(0, 12)
      }
    } catch {
      // ignore
    }
    return 'unknown'
  }

  async getMediaTotals(filter: MediaIndexFilter = {}): Promise<{
    success: boolean
    total?: number
    imageTotal?: number
    videoTotal?: number
    sessionCount?: number
    error?: string
  }> {
    const normalized = normalizeFilter(filter)
    try {
      await chatService.connect()
      let sessionIds: string[] = []
      if (normalized.sessionId) {
        sessionIds = [normalized.sessionId]
      } else {
        const sessions = await chatService.getSessions()
        if (!sessions?.success) return { success: false, error: sessions?.error || '获取会话失败' }
        sessionIds = (sessions.sessions || [])
          .map((row: any) => String(row?.username || row?.sessionId || '').trim())
          .filter(Boolean)
      }
      if (sessionIds.length === 0) {
        return { success: true, total: 0, imageTotal: 0, videoTotal: 0, sessionCount: 0 }
      }

      const batch = await wcdbService.getSessionMessageTypeStatsBatch(sessionIds, {
        beginTimestamp: normalized.beginTimestamp,
        endTimestamp: normalized.endTimestamp,
        quickMode: sessionIds.length > 1,
        includeGroupSenderCount: false
      })

      let imageTotal = 0
      let videoTotal = 0
      if (batch.success && batch.data) {
        for (const id of sessionIds) {
          const row = batch.data[id] as Record<string, any> | undefined
          if (!row) continue
          imageTotal += toInt(row.image_messages)
          videoTotal += toInt(row.video_messages)
        }
      } else {
        // 批失败则抽样单会话累计（上限防卡死）
        const capped = sessionIds.slice(0, 80)
        for (const id of capped) {
          const one = await wcdbService.getSessionMessageTypeStats(
            id,
            normalized.beginTimestamp,
            normalized.endTimestamp
          )
          if (!one.success || !one.data) continue
          imageTotal += toInt(one.data.image_messages)
          videoTotal += toInt(one.data.video_messages)
        }
      }

      const total =
        normalized.mediaType === 'video'
          ? videoTotal
          : normalized.mediaType === 'all'
            ? imageTotal + videoTotal
            : imageTotal

      return {
        success: true,
        total,
        imageTotal,
        videoTotal,
        sessionCount: sessionIds.length
      }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  async ensureIndex(
    filter: MediaIndexFilter = {},
    options?: { forceRebuild?: boolean }
  ): Promise<MediaIndexProgress> {
    const normalized = normalizeFilter(filter)
    const accountHint = await this.resolveAccountHint()
    const key = filterKey(normalized, accountHint)

    if (!options?.forceRebuild) {
      const mem = this.memory.get(key)
      if (mem) {
        const ready: MediaIndexProgress = {
          key,
          status: 'ready',
          indexed: mem.items.length,
          totalEstimated: mem.totalEstimated,
          fromCache: true,
          items: mem.items
        }
        this.emit(ready)
        return ready
      }
      const disk = this.readDisk(key)
      if (disk) {
        this.memory.set(key, disk)
        const ready: MediaIndexProgress = {
          key,
          status: 'ready',
          indexed: disk.items.length,
          totalEstimated: disk.totalEstimated,
          fromCache: true,
          items: disk.items
        }
        this.emit(ready)
        return ready
      }
    }

    const inflight = this.building.get(key)
    if (inflight) return inflight

    const task = this.buildIndex(key, normalized, accountHint)
    this.building.set(key, task)
    try {
      return await task
    } finally {
      this.building.delete(key)
    }
  }

  private async buildIndex(
    key: string,
    filter: Required<MediaIndexFilter>,
    accountHint: string
  ): Promise<MediaIndexProgress> {
    const totals = await this.getMediaTotals(filter)
    const totalEstimated = totals.success ? Number(totals.total || 0) : null

    this.emit({
      key,
      status: 'building',
      indexed: 0,
      totalEstimated
    })

    try {
      await chatService.connect()
      const items: MediaIndexItem[] = []
      const seen = new Set<string>()
      let offset = 0
      let guard = 0

      while (guard < 20000) {
        guard += 1
        const page = await wcdbService.getMediaStream({
          sessionId: filter.sessionId || undefined,
          mediaType: filter.mediaType,
          beginTimestamp: filter.beginTimestamp || undefined,
          endTimestamp: filter.endTimestamp || undefined,
          offset,
          limit: STREAM_PAGE
        })
        if (!page.success) {
          const err: MediaIndexProgress = {
            key,
            status: 'error',
            indexed: items.length,
            totalEstimated,
            error: page.error || '媒体流扫描失败'
          }
          this.emit(err)
          return err
        }

        const incoming = Array.isArray(page.items) ? page.items : []
        const delta: MediaIndexItem[] = []
        for (const row of incoming) {
          const item = row as MediaIndexItem
          const k = itemKey(item)
          if (seen.has(k)) continue
          seen.add(k)
          items.push(item)
          delta.push(item)
        }

        const reportedNext = toInt(page.nextOffset)
        const nextOffset = reportedNext > offset ? reportedNext : offset + incoming.length
        const hasMore = Boolean(page.hasMore) && nextOffset > offset && incoming.length > 0
        offset = nextOffset

        this.emit({
          key,
          status: 'building',
          indexed: items.length,
          totalEstimated,
          itemsDelta: delta
        })

        if (items.length > 0 && items.length % SAVE_EVERY < STREAM_PAGE) {
          const partial: DiskIndexPayload = {
            version: 1,
            key,
            builtAt: Date.now(),
            accountHint,
            filter,
            totalEstimated,
            items
          }
          this.memory.set(key, partial)
          this.writeDisk(partial)
        }

        if (!hasMore) break
        await sleep(YIELD_MS)
      }

      const payload: DiskIndexPayload = {
        version: 1,
        key,
        builtAt: Date.now(),
        accountHint,
        filter,
        totalEstimated,
        items
      }
      this.memory.set(key, payload)
      this.writeDisk(payload)

      const ready: MediaIndexProgress = {
        key,
        status: 'ready',
        indexed: items.length,
        totalEstimated,
        fromCache: false,
        items
      }
      this.emit(ready)
      return ready
    } catch (error) {
      const err: MediaIndexProgress = {
        key,
        status: 'error',
        indexed: 0,
        totalEstimated,
        error: String(error)
      }
      this.emit(err)
      return err
    }
  }

  getSnapshot(filter: MediaIndexFilter = {}): {
    success: boolean
    key?: string
    status?: MediaIndexProgress['status']
    items?: MediaIndexItem[]
    totalEstimated?: number | null
    indexed?: number
    error?: string
  } {
    const normalized = normalizeFilter(filter)
    // accountHint 可能未解析；优先匹配 memory 里同 filter 的最新项
    for (const payload of this.memory.values()) {
      const f = normalizeFilter(payload.filter)
      if (
        f.sessionId === normalized.sessionId &&
        f.mediaType === normalized.mediaType &&
        f.beginTimestamp === normalized.beginTimestamp &&
        f.endTimestamp === normalized.endTimestamp
      ) {
        return {
          success: true,
          key: payload.key,
          status: 'ready',
          items: payload.items,
          totalEstimated: payload.totalEstimated,
          indexed: payload.items.length
        }
      }
    }
    return { success: false, error: '索引尚未就绪', status: 'idle', items: [], indexed: 0, totalEstimated: null }
  }

  /** 构建过程中也可取当前已收集的 items */
  getBuildingItems(key: string): MediaIndexItem[] {
    return this.memory.get(key)?.items || []
  }
}

export const mediaIndexService = new MediaIndexService()
