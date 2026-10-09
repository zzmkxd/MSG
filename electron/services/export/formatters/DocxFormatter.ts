/**
 * DocxFormatter.ts — DOCX 聊天记录导出格式器
 * 移植自 WeChatMsg/exporter/exporter_docx.py (337行 Python → TS)
 *
 * WF 现有 8 种格式（ChatLab/Excel/HTML/JSON/Markdown/SQL/TXT/WeClone），
 * DOCX 独缺。此为 net-new 格式器。
 *
 * 布局：1×2 表格模拟聊天气泡（头像列 + 内容列），左右对齐区分收发
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  convertInchesToTwip,
  PageBreak,
} from 'docx'

import { resolveExportDisplayProfile } from '../contacts/contactResolver'
import { formatTimestamp } from '../utils/timestamp'
import { parallelLimit } from '../utils/parallelLimit'
import { wcdbService } from '../../wcdbService'

// ── 常量 ────────────────────────────────────────────────────────────────────────
const DEFAULT_MSG_PER_FILE = 500
const AVATAR_SIZE = 24 // twip (0.5 inches ≈ 36pt)
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const GRAY_COLOR = '797979'

// ── 工具 ────────────────────────────────────────────────────────────────────────

function filterControlChars(input: string): string {
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/**
 * 构造一个 TextRun。
 * 注意：docx@9 的 Paragraph 没有 addRun()（只有私有 addRunToFront），
 * 段落文本必须在构造 Paragraph 时通过 children 传入 —— 故这里返回 Run 而不是往段落里塞。
 */
function buildRun(text: string, options?: { size?: number; color?: string; bold?: boolean }): TextRun {
  try {
    return new TextRun({
      text: filterControlChars(text),
      size: options?.size ?? 20, // half-points, 20 = 10pt
      color: options?.color ?? '000000',
      bold: options?.bold ?? false,
      font: { name: 'Cambria', eastAsia: '宋体' },
    })
  } catch {
    // 非法字符已过滤，此处兜底
    return new TextRun({ text: '[非法字符]', size: 20 })
  }
}

// ── Formatter ───────────────────────────────────────────────────────────────────

export class DocxFormatter {
  constructor(private exportService: any) {}

  public async export(
    sessionId: any,
    outputPath: any,
    options: any,
    onProgress: any,
    control: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.exportService.throwIfStopRequested(control)
      const conn = await this.exportService.ensureConnected()
      if (!conn.success || !conn.cleanedWxid) return { success: false, error: conn.error }

      const cleanedMyWxid = conn.cleanedWxid
      const isGroup = sessionId.includes('@chatroom')
      const rawMyWxid = this.exportService.getConfiguredMyWxid()
      const sessionInfo = await this.exportService.getContactInfo(sessionId)
      const myInfo = await this.exportService.getContactInfo(cleanedMyWxid)

      const contactCache = new Map<string, any>()
      const getContactCached = async (username: string) => {
        if (contactCache.has(username)) return contactCache.get(username)!
        const result = await wcdbService.getContact(username)
        contactCache.set(username, result)
        return result
      }

      // 阶段 1：消息收集
      onProgress?.({ current: 0, total: 100, currentSession: sessionInfo.displayName, phase: 'preparing' })

      const collectParams = this.exportService.resolveCollectParams(options)
      const collectProgressReporter = this.exportService.createCollectProgressReporter(
        sessionInfo.displayName, onProgress, 5
      )
      const collected = await this.exportService.collectMessages(
        sessionId, cleanedMyWxid, options.dateRange, options.senderUsername,
        collectParams.mode, collectParams.targetMediaTypes, control, collectProgressReporter
      )
      const totalMessages = collected.rows.length
      if (totalMessages === 0) {
        return { success: false, error: await this.exportService.buildNoMessagesError(sessionId, collected) }
      }

      // 阶段 2：预加载联系人 + 媒体
      await this.exportService.hydrateEmojiCaptionsForMessages(sessionId, collected.rows, control)
      await this.exportService.resolveQuotedMessagesForExport(collected.rows, sessionId)

      const senderUsernames = new Set<string>()
      for (const msg of collected.rows) {
        if (msg.senderUsername) senderUsernames.add(msg.senderUsername)
      }
      senderUsernames.add(sessionId)
      await this.exportService.preloadContacts(senderUsernames, contactCache)

      const sortedMessages = collected.rows
      const { exportMediaEnabled, mediaRootDir, mediaRelativePrefix } =
        this.exportService.getMediaLayout(outputPath, options)
      const mediaMessages = this.exportService.collectMediaMessagesForExport(sortedMessages, options)

      const mediaCache = new Map<string, any>()
      const mediaDirCache = new Set<string>()

      if (mediaMessages.length > 0) {
        await this.exportService.preloadMediaLookupCaches(sessionId, mediaMessages, {
          exportImages: options.exportImages,
          exportVideos: options.exportVideos,
        }, control)

        onProgress?.({ current: 25, total: 100, currentSession: sessionInfo.displayName, phase: 'exporting-media' })

        const mediaConcurrency = this.exportService.getClampedConcurrency(options.exportConcurrency)
        await parallelLimit(mediaMessages, mediaConcurrency, async (msg: any) => {
          this.exportService.throwIfStopRequested(control)
          const mediaKey = this.exportService.getMediaCacheKey(msg)
          if (!mediaCache.has(mediaKey)) {
            const mediaItem = await this.exportService.exportMediaForMessage(
              msg, sessionId, mediaRootDir, mediaRelativePrefix, {
                exportImages: options.exportImages,
                exportVoices: options.exportVoices,
                exportVideos: options.exportVideos,
                exportEmojis: options.exportEmojis,
                exportFiles: options.exportFiles,
                maxFileSizeMb: options.maxFileSizeMb,
                exportVoiceAsText: false,
                exportConflictStrategy: options.exportConflictStrategy,
                includeVideoPoster: false,
                dirCache: mediaDirCache,
                control,
              }
            )
            mediaCache.set(mediaKey, mediaItem)
          }
        })
      }

      // 阶段 3：创建 DOCX
      onProgress?.({ current: 50, total: 100, currentSession: sessionInfo.displayName, phase: 'exporting' })

      const msgNumPerFile = options.msgNumPerDocx ?? DEFAULT_MSG_PER_FILE
      const baseName = path.basename(outputPath, path.extname(outputPath))
      const dirName = path.dirname(outputPath)

      let docIndex = 0
      let fileCount = 0
      let currentChildren: (Paragraph | Table)[] = []
      let exportedInFile = 0

      const outputFiles: string[] = []

      // docx@9 的 Document 必须显式带 sections；且一个 section 内的内容才是「连续排版」。
      // 旧实现用 File.addSection() 逐条消息建 section，OOXML 中未标注 w:type 的 sectPr
      // 默认按 nextPage 分节 → 每条消息一页。这里改为单 section 累积全部消息。
      const newDoc = (): void => {
        currentChildren = []
        docIndex++
        exportedInFile = 0
      }

      const saveDoc = async (): Promise<void> => {
        if (currentChildren.length === 0) return
        const currentDoc = new Document({
          styles: {
            default: {
              document: {
                run: { font: 'Cambria', size: 20 },
              },
            },
          },
          sections: [{ children: currentChildren }],
        })
        const filePath = fileCount === 0
          ? outputPath
          : path.join(dirName, `${baseName}_${docIndex}.docx`)
        const buffer = await Packer.toBuffer(currentDoc)
        fs.writeFileSync(filePath, buffer)
        outputFiles.push(filePath)
        fileCount++
      }

      newDoc()

      for (let i = 0; i < totalMessages; i++) {
        if ((i & 0x3f) === 0) this.exportService.throwIfStopRequested(control)

        const msg = sortedMessages[i]
        const isSend = msg.isSend === 1
        const localType = Number(msg.localType || 0)

        // 按 WM 模式：每 500 条或最后一条时保存并新建文档
        if (exportedInFile >= msgNumPerFile) {
          await saveDoc()
          newDoc()
        }

        const senderWxid = isGroup
          ? (isSend ? cleanedMyWxid : (msg.senderUsername || cleanedMyWxid))
          : (isSend ? cleanedMyWxid : sessionId)

        const senderProfile = await resolveExportDisplayProfile(
          senderWxid,
          options.displayNamePreference,
          getContactCached,
          new Map(),
          isSend ? (myInfo.displayName || cleanedMyWxid) : (msg.senderUsername || ''),
          isSend ? [rawMyWxid, cleanedMyWxid] : []
        )

        const displayName = isGroup ? senderProfile.displayName : ''
        const align = isSend ? AlignmentType.RIGHT : AlignmentType.LEFT

        if (localType === 50 || localType === 9999) {
          // 系统消息 — 居中文本
          const sysContent = msg.parsedContent || msg.rawContent || msg.content || ''
          const cleanSys = sysContent
            .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
            .replace(/<[^>]+>/g, '')
            .trim()
          if (cleanSys) {
            currentChildren.push(new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [buildRun(cleanSys, { size: 18, color: GRAY_COLOR })],
            }))
          }
        } else {
          // 普通消息 — 1×2 表格气泡
          const table = new Table({
            rows: [
              new TableRow({
                children: [
                  // 头像列
                  new TableCell({
                    width: { size: AVATAR_SIZE, type: WidthType.DXA },
                    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
                    children: [], // 头像暂不嵌入（DOCX 内联头像需 ImageRun，依赖图片解密路径）
                  }),
                  // 内容列
                  new TableCell({
                    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
                    children: [
                      (() => {
                        const runs: TextRun[] = []
                        if (isGroup && displayName) {
                          runs.push(buildRun(displayName + '\n', { size: 18, color: GRAY_COLOR, bold: true }))
                        }
                        const content = msg.parsedContent || msg.rawContent || msg.content || '[消息]'
                        runs.push(buildRun(content))
                        return new Paragraph({ alignment: align, children: runs })
                      })(),
                    ],
                  }),
                ],
              }),
            ],
          })

          currentChildren.push(table, new Paragraph({ spacing: { after: 60 } }))
        }

        exportedInFile++

        if ((i + 1) % 100 === 0 || i === totalMessages - 1) {
          onProgress?.({
            current: 50 + Math.floor(((i + 1) / totalMessages) * 40),
            total: 100,
            currentSession: sessionInfo.displayName,
            phase: 'exporting',
            exportedMessages: i + 1,
            totalMessages,
          })
        }
      }

      // 保存最后一个文档
      await saveDoc()

      onProgress?.({
        current: 100,
        total: 100,
        currentSession: sessionInfo.displayName,
        phase: 'complete',
        totalMessages,
        exportedMessages: totalMessages,
        writtenFiles: outputFiles.length,
      })

      return { success: true }
    } catch (e) {
      if (this.exportService.isStopError?.(e)) return { success: false, error: '导出任务已停止' }
      if (this.exportService.isPauseError?.(e)) return { success: false, error: '导出任务已暂停' }
      return { success: false, error: String(e) }
    }
  }
}
