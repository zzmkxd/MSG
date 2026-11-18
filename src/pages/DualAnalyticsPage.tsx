import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Calendar,
  Clock,
  ImageDown,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Users
} from 'lucide-react'
import ReactECharts from 'echarts-for-react'
import html2canvas from 'html2canvas'
import ChatAnalysisHeader from '../components/ChatAnalysisHeader'
import DateRangePicker from '../components/DateRangePicker'
import { Avatar } from '../components/Avatar'
import ReportHeatmap from '../components/ReportHeatmap'
import ReportWordCloud from '../components/ReportWordCloud'
import './DualAnalyticsPage.scss'

interface ContactRanking {
  username: string
  displayName: string
  avatarUrl?: string
  wechatId?: string
  messageCount: number
  sentCount: number
  receivedCount: number
  lastMessageTime?: number | null
}

interface DualDashboard {
  selfName: string
  selfAvatarUrl?: string
  friendUsername: string
  friendName: string
  friendAvatarUrl?: string
  firstChat?: {
    createTime?: number
    createTimeStr?: string
  } | null
  firstChatMessages?: Array<{
    content: string
    isSentByMe: boolean
    createTime: number
    createTimeStr: string
  }>
  stats: {
    totalMessages: number
    totalWords: number
    imageCount: number
    voiceCount: number
    emojiCount: number
    myTopEmojiUrl?: string
    friendTopEmojiUrl?: string
    myTopEmojiCount?: number
    friendTopEmojiCount?: number
  }
  topPhrases?: Array<{ phrase: string; count: number }>
  myExclusivePhrases?: Array<{ phrase: string; count: number }>
  friendExclusivePhrases?: Array<{ phrase: string; count: number }>
  heatmap?: number[][]
  initiative?: { initiated: number; received: number }
  response?: { avg: number; fastest: number; count: number }
  monthly?: Record<string, number>
  streak?: { days: number; startDate: string; endDate: string }
}

function formatCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return n.toLocaleString()
}

function formatTime(ts?: number | null) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function formatSeconds(seconds?: number | null) {
  const value = Math.max(0, Math.round(Number(seconds) || 0))
  if (value < 60) return `${value}s`
  const minutes = Math.floor(value / 60)
  const rem = value % 60
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMin = minutes % 60
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`
}

function DualAnalyticsPage() {
  const exportRootRef = useRef<HTMLDivElement>(null)
  const [rankings, setRankings] = useState<ContactRanking[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<DualDashboard | null>(null)
  const [dashLoading, setDashLoading] = useState(false)
  const [dashStatus, setDashStatus] = useState('')
  const [dashError, setDashError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [dateReady, setDateReady] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  const selectedRank = useMemo(
    () => rankings.find((item) => item.username === selectedUsername) || null,
    [rankings, selectedUsername]
  )

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return rankings
    return rankings.filter((item) => {
      const wechatId = (item.wechatId || '').toLowerCase()
      return item.displayName.toLowerCase().includes(q) || wechatId.includes(q) || item.username.toLowerCase().includes(q)
    })
  }, [rankings, keyword])

  const timeRange = useMemo(() => ({
    beginTimestamp: startDate ? Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000) : undefined,
    endTimestamp: endDate ? Math.floor(new Date(`${endDate}T23:59:59`).getTime() / 1000) : undefined
  }), [startDate, endDate])

  const loadRankings = useCallback(async () => {
    setListLoading(true)
    setListError(null)
    try {
      const result = await window.electronAPI.analytics.getContactRankings(200, 0, 0)
      if (result.success && result.data) {
        setRankings(result.data)
        setSelectedUsername((prev) => prev || result.data![0]?.username || null)
      } else {
        setListError(result.error || '加载好友列表失败')
      }
    } catch (e) {
      setListError(String(e))
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadDashboard = useCallback(async (username: string) => {
    if (!username) return
    setDashLoading(true)
    setDashError(null)
    setDashStatus('正在分析双人私聊…')
    setDashboard(null)
    const stop = window.electronAPI.dualAnalytics.onProgress?.((payload) => {
      if (payload?.status) setDashStatus(payload.status)
    })
    try {
      const hasRange = timeRange.beginTimestamp != null || timeRange.endTimestamp != null
      const result = await window.electronAPI.dualAnalytics.getDashboard({
        friendUsername: username,
        beginTimestamp: hasRange ? (timeRange.beginTimestamp || 0) : undefined,
        endTimestamp: hasRange ? (timeRange.endTimestamp || 0) : undefined
      })
      if (!result.success || !result.data) {
        setDashError(result.error || '加载双人分析失败')
        return
      }
      setDashboard(result.data)
    } catch (e) {
      setDashError(String(e))
    } finally {
      stop?.()
      setDashLoading(false)
      setDashStatus('')
    }
  }, [timeRange.beginTimestamp, timeRange.endTimestamp])

  useEffect(() => {
    void loadRankings()
  }, [loadRankings])

  useEffect(() => {
    if (!selectedUsername) return
    void loadDashboard(selectedUsername)
  }, [selectedUsername, loadDashboard])

  useEffect(() => {
    if (!dateReady || !selectedUsername) return
    setDateReady(false)
    void loadDashboard(selectedUsername)
  }, [dateReady, selectedUsername, loadDashboard])

  const reciprocity = useMemo(() => {
    const sent = selectedRank?.sentCount || 0
    const recv = selectedRank?.receivedCount || 0
    const total = Math.max(1, sent + recv)
    return { sent, recv, sentRatio: sent / total, recvRatio: recv / total }
  }, [selectedRank])

  const mediaOption = useMemo(() => {
    const stats = dashboard?.stats
    if (!stats) return {}
    const data = [
      { name: '图片', value: stats.imageCount || 0, itemStyle: { color: '#22c55e' } },
      { name: '语音', value: stats.voiceCount || 0, itemStyle: { color: '#f97316' } },
      { name: '表情', value: stats.emojiCount || 0, itemStyle: { color: '#ec4899' } },
      {
        name: '其他文本等',
        value: Math.max(0, (stats.totalMessages || 0) - (stats.imageCount || 0) - (stats.voiceCount || 0) - (stats.emojiCount || 0)),
        itemStyle: { color: '#3b82f6' }
      }
    ].filter((item) => item.value > 0)
    return {
      tooltip: { trigger: 'item' },
      series: [{ type: 'pie', radius: ['42%', '70%'], data, label: { formatter: '{b} {d}%' } }]
    }
  }, [dashboard])

  const monthlyOption = useMemo(() => {
    const monthly = dashboard?.monthly || {}
    const keys = Object.keys(monthly).sort()
    if (keys.length === 0) return {}
    return {
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: keys },
      yAxis: { type: 'value' },
      series: [{
        type: 'bar',
        data: keys.map((k) => monthly[k] || 0),
        itemStyle: { color: '#07c160', borderRadius: [4, 4, 0, 0] }
      }]
    }
  }, [dashboard])

  const initiativeOption = useMemo(() => {
    const init = dashboard?.initiative
    if (!init) return {}
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['40%', '68%'],
        data: [
          { name: '我发起', value: init.initiated || 0, itemStyle: { color: '#2563eb' } },
          { name: '对方发起', value: init.received || 0, itemStyle: { color: '#7c3aed' } }
        ].filter((item) => item.value > 0),
        label: { formatter: '{b}\n{d}%' }
      }]
    }
  }, [dashboard])

  const handleExportLongImage = async () => {
    if (!exportRootRef.current || isExporting || !dashboard) return
    setIsExporting(true)
    setExportMessage('')
    try {
      const dirResult = await window.electronAPI.dialog.openDirectory({
        title: '选择双人分析长图导出目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (dirResult.canceled || !dirResult.filePaths?.[0]) {
        setIsExporting(false)
        return
      }
      const root = exportRootRef.current
      root.classList.add('exporting-capture')
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const canvas = await html2canvas(root, {
        backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: root.scrollWidth,
        windowHeight: root.scrollHeight
      })
      root.classList.remove('exporting-capture')
      const dataUrl = canvas.toDataURL('image/png')
      const stamp = new Date()
      const friend = dashboard.friendName || selectedUsername || 'friend'
      const name = `MSG双人分析_${friend}_${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}.png`
      const exportResult = await window.electronAPI.annualReport.exportImages({
        baseDir: dirResult.filePaths[0],
        folderName: 'MSG双人分析导出',
        images: [{ name, dataUrl }]
      })
      if (!exportResult.success) throw new Error(exportResult.error || '导出失败')
      setExportMessage(`已导出：${exportResult.dir || dirResult.filePaths[0]}`)
    } catch (error: any) {
      exportRootRef.current?.classList.remove('exporting-capture')
      setExportMessage(error?.message || String(error) || '导出失败')
    } finally {
      setIsExporting(false)
    }
  }

  const openChat = () => {
    if (!selectedRank) return
    void window.electronAPI.window.openSessionChatWindow(selectedRank.username, {
      source: 'chat',
      initialDisplayName: selectedRank.displayName,
      initialAvatarUrl: selectedRank.avatarUrl,
      initialContactType: 'friend'
    })
  }

  const headerActions = (
    <>
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onRangeComplete={() => setDateReady(true)}
        emptyLabel="全部时间"
      />
      <button
        type="button"
        className="analytics-export-btn analytics-export-btn--header"
        data-testid="dual-analytics-export"
        disabled={!dashboard || dashLoading || isExporting}
        onClick={() => void handleExportLongImage()}
      >
        {isExporting ? <Loader2 size={16} className="spin" /> : <ImageDown size={16} />}
        <span>{isExporting ? '导出中...' : '导出长图'}</span>
      </button>
    </>
  )

  return (
    <div className="dual-analytics-shell">
      <ChatAnalysisHeader currentMode="dual" actions={headerActions} />

      <div className="dual-analytics-body">
        <aside className="dual-analytics-list-pane">
          <div className="dual-analytics-list-head">
            <h2>双人分析</h2>
            <p>选定好友，看你们私聊的互惠、节律、表达与纪录。</p>
          </div>
          <div className="dual-analytics-search">
            <Search size={15} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索好友（昵称 / 微信号 / wxid）"
            />
          </div>
          {listLoading ? (
            <div className="dual-analytics-state"><Loader2 size={22} className="spin" /><span>加载好友…</span></div>
          ) : listError ? (
            <div className="dual-analytics-state error">
              <p>{listError}</p>
              <button type="button" className="btn btn-secondary" onClick={() => void loadRankings()}>重试</button>
            </div>
          ) : (
            <div className="dual-analytics-list">
              {filtered.map((item, index) => (
                <button
                  key={item.username}
                  type="button"
                  className={`dual-analytics-row ${selectedUsername === item.username ? 'active' : ''}`}
                  onClick={() => setSelectedUsername(item.username)}
                >
                  <span className={`rank ${index < 3 ? 'top' : ''}`}>{index + 1}</span>
                  <Avatar src={item.avatarUrl} name={item.displayName} size={36} />
                  <div className="meta">
                    <div className="name">{item.displayName}</div>
                    <div className="sub">{formatCount(item.messageCount)} 条</div>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="dual-analytics-state">没有匹配的好友</div>}
            </div>
          )}
        </aside>

        <section className="dual-analytics-detail-pane">
          {!selectedUsername ? (
            <div className="dual-analytics-placeholder"><Users size={48} /><p>从左侧选择一位好友</p></div>
          ) : dashLoading ? (
            <div className="dual-analytics-placeholder">
              <Loader2 size={40} className="spin" />
              <p>{dashStatus || '正在计算双人私聊指标…'}</p>
            </div>
          ) : dashError ? (
            <div className="dual-analytics-placeholder error">
              <p>{dashError}</p>
              <button type="button" className="btn btn-primary" onClick={() => selectedUsername && void loadDashboard(selectedUsername)}>重试</button>
            </div>
          ) : !dashboard ? (
            <div className="dual-analytics-placeholder"><p>暂无分析数据</p></div>
          ) : (
            <>
              {exportMessage && <div className="analytics-export-toast">{exportMessage}</div>}
              <div className="dual-analytics-export-root" ref={exportRootRef} data-testid="dual-analytics-dashboard">
                <div className="dual-analytics-hero">
                  <div className="hero-pair">
                    <Avatar src={dashboard.selfAvatarUrl} name={dashboard.selfName} size={56} />
                    <span className="pair-x">×</span>
                    <Avatar src={dashboard.friendAvatarUrl || selectedRank?.avatarUrl} name={dashboard.friendName} size={56} />
                  </div>
                  <div className="hero-text">
                    <h3>{dashboard.selfName} · {dashboard.friendName}</h3>
                    <p>
                      首聊 {dashboard.firstChat?.createTimeStr || formatTime(dashboard.firstChat?.createTime)}
                      {dashboard.streak ? ` · 最长连续 ${dashboard.streak.days} 天` : ''}
                    </p>
                  </div>
                  <div className="hero-actions">
                    <button type="button" className="btn btn-secondary" onClick={openChat}>
                      <MessageSquare size={16} />
                      打开会话
                    </button>
                    <button
                      type="button"
                      className="analytics-export-btn analytics-export-btn--banner"
                      disabled={isExporting}
                      onClick={() => void handleExportLongImage()}
                    >
                      {isExporting ? <Loader2 size={16} className="spin" /> : <ImageDown size={16} />}
                      导出长图
                    </button>
                  </div>
                </div>

                <div className="dual-analytics-kpis" data-testid="dual-module-reciprocity">
                  <div className="kpi">
                    <span className="kpi-label">总消息</span>
                    <span className="kpi-value">{formatCount(dashboard.stats.totalMessages || selectedRank?.messageCount || 0)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">总字数</span>
                    <span className="kpi-value">{formatCount(dashboard.stats.totalWords || 0)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">我发出</span>
                    <span className="kpi-value">{formatCount(reciprocity.sent)}</span>
                  </div>
                  <div className="kpi">
                    <span className="kpi-label">我收到</span>
                    <span className="kpi-value">{formatCount(reciprocity.recv)}</span>
                  </div>
                </div>

                <div className="dual-analytics-reciprocity">
                  <div className="reciprocity-head">
                    <span>互惠比例（消息条数）</span>
                    <span>我 {Math.round(reciprocity.sentRatio * 100)}% · 对方 {Math.round(reciprocity.recvRatio * 100)}%</span>
                  </div>
                  <div className="reciprocity-bar">
                    <div className="sent" style={{ width: `${reciprocity.sentRatio * 100}%` }} />
                    <div className="recv" style={{ width: `${reciprocity.recvRatio * 100}%` }} />
                  </div>
                </div>

                <div className="dual-charts-grid">
                  <div className="chart-card" data-testid="dual-module-initiative">
                    <h4>会话发起</h4>
                    {dashboard.initiative ? (
                      <ReactECharts option={initiativeOption} style={{ height: 240 }} />
                    ) : <p className="empty-hint">暂无发起数据</p>}
                  </div>
                  <div className="chart-card" data-testid="dual-module-response">
                    <h4>回应时延</h4>
                    {dashboard.response ? (
                      <div className="response-stats">
                        <div><Clock size={16} /><span>平均 {formatSeconds(dashboard.response.avg)}</span></div>
                        <div><Send size={16} /><span>最快 {formatSeconds(dashboard.response.fastest)}</span></div>
                        <div><Users size={16} /><span>样本 {formatCount(dashboard.response.count || 0)} 次</span></div>
                      </div>
                    ) : <p className="empty-hint">暂无时延数据</p>}
                  </div>
                  <div className="chart-card wide" data-testid="dual-module-heatmap">
                    <h4>活跃热力（星期 × 小时）</h4>
                    {dashboard.heatmap && dashboard.heatmap.length > 0 ? (
                      <ReportHeatmap data={dashboard.heatmap} />
                    ) : <p className="empty-hint">暂无热力数据</p>}
                  </div>
                  <div className="chart-card" data-testid="dual-module-media">
                    <h4>媒体结构</h4>
                    {(dashboard.stats.imageCount || dashboard.stats.voiceCount || dashboard.stats.emojiCount) ? (
                      <ReactECharts option={mediaOption} style={{ height: 240 }} />
                    ) : <p className="empty-hint">暂无媒体统计</p>}
                  </div>
                  <div className="chart-card" data-testid="dual-module-monthly">
                    <h4>月度脉搏</h4>
                    {dashboard.monthly && Object.keys(dashboard.monthly).length > 0 ? (
                      <ReactECharts option={monthlyOption} style={{ height: 240 }} />
                    ) : <p className="empty-hint">暂无月度数据</p>}
                  </div>
                  <div className="chart-card wide" data-testid="dual-module-words">
                    <h4>共同高频词</h4>
                    {dashboard.topPhrases?.length ? (
                      <ReportWordCloud words={dashboard.topPhrases} />
                    ) : <p className="empty-hint">暂无词云</p>}
                  </div>
                  <div className="chart-card">
                    <h4>我的专属词</h4>
                    <div className="phrase-chips">
                      {(dashboard.myExclusivePhrases || []).slice(0, 12).map((item) => (
                        <span key={`my-${item.phrase}`} className="chip">{item.phrase}<em>{item.count}</em></span>
                      ))}
                      {(dashboard.myExclusivePhrases || []).length === 0 && <p className="empty-hint">暂无</p>}
                    </div>
                  </div>
                  <div className="chart-card">
                    <h4>对方专属词</h4>
                    <div className="phrase-chips">
                      {(dashboard.friendExclusivePhrases || []).slice(0, 12).map((item) => (
                        <span key={`fr-${item.phrase}`} className="chip">{item.phrase}<em>{item.count}</em></span>
                      ))}
                      {(dashboard.friendExclusivePhrases || []).length === 0 && <p className="empty-hint">暂无</p>}
                    </div>
                  </div>
                  <div className="chart-card" data-testid="dual-module-emoji">
                    <h4>双方 Top 表情</h4>
                    <div className="emoji-pair">
                      <div>
                        <span className="label">我</span>
                        {dashboard.stats.myTopEmojiUrl ? (
                          <img src={dashboard.stats.myTopEmojiUrl} alt="" />
                        ) : <span className="empty-hint">—</span>}
                        <small>{dashboard.stats.myTopEmojiCount ? `${dashboard.stats.myTopEmojiCount} 次` : ''}</small>
                      </div>
                      <div>
                        <span className="label">对方</span>
                        {dashboard.stats.friendTopEmojiUrl ? (
                          <img src={dashboard.stats.friendTopEmojiUrl} alt="" />
                        ) : <span className="empty-hint">—</span>}
                        <small>{dashboard.stats.friendTopEmojiCount ? `${dashboard.stats.friendTopEmojiCount} 次` : ''}</small>
                      </div>
                    </div>
                  </div>
                  <div className="chart-card" data-testid="dual-module-records">
                    <h4>纪录</h4>
                    <div className="records">
                      {dashboard.streak ? (
                        <div><Calendar size={14} /><span>连续 {dashboard.streak.days} 天（{dashboard.streak.startDate} — {dashboard.streak.endDate}）</span></div>
                      ) : null}
                      {(dashboard.firstChatMessages || []).slice(0, 3).map((msg, idx) => (
                        <div key={`${msg.createTime}-${idx}`} className="first-msg">
                          <strong>{msg.isSentByMe ? '我' : '对方'}</strong>
                          <span>{msg.createTimeStr}</span>
                          <p>{msg.content || '（非文本）'}</p>
                        </div>
                      ))}
                      {!dashboard.streak && !(dashboard.firstChatMessages || []).length && (
                        <p className="empty-hint">暂无纪录片段</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default DualAnalyticsPage
