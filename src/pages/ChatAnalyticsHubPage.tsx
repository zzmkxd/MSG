import { ArrowRight, HeartHandshake, MessageSquare, Users, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import './ChatAnalyticsHubPage.scss'

function ChatAnalyticsHubPage() {
  const navigate = useNavigate()

  return (
    <div className="analytics-hub">
      <div className="analytics-hub-inner">
        <div className="analytics-hub-hero">
          <div className="analytics-hub-kicker">
            <Sparkles size={14} />
            <span>本地私密 · 一眼看懂关系结构</span>
          </div>
          <h1 className="analytics-hub-title">聊天分析</h1>
          <p className="analytics-hub-desc">
            先选视角。私聊看总量与节律；双人看双方私聊仪表盘；群聊看成员与媒体。
          </p>
        </div>

        <div className="analytics-hub-perspectives">
          <div className="analytics-hub-perspectives-label">视角</div>

          <button
            type="button"
            className="analytics-hub-row analytics-hub-row--private"
            onClick={() => navigate('/analytics/private')}
          >
            <div className="analytics-hub-row-icon">
              <MessageSquare size={18} strokeWidth={2.25} />
            </div>
            <div className="analytics-hub-row-body">
              <div className="analytics-hub-row-title">私聊分析</div>
              <div className="analytics-hub-row-desc">好友统计、类型分布、小时节律、词云与 Top 联系人；可导出长图。</div>
              <div className="analytics-hub-row-chips">
                <span>KPI</span>
                <span>ECharts</span>
                <span>长图导出</span>
              </div>
            </div>
            <ArrowRight size={16} className="analytics-hub-row-arrow" />
          </button>

          <button
            type="button"
            className="analytics-hub-row analytics-hub-row--dual"
            onClick={() => navigate('/analytics/dual')}
          >
            <div className="analytics-hub-row-icon analytics-hub-row-icon--dual">
              <HeartHandshake size={18} strokeWidth={2.25} />
            </div>
            <div className="analytics-hub-row-body">
              <div className="analytics-hub-row-title">双人分析</div>
              <div className="analytics-hub-row-desc">选定好友，看私聊双方的互惠、热力、时延、词云、媒体与纪录。</div>
              <div className="analytics-hub-row-chips">
                <span>互惠</span>
                <span>热力</span>
                <span>词云</span>
                <span>导出</span>
              </div>
            </div>
            <ArrowRight size={16} className="analytics-hub-row-arrow" />
          </button>

          <button
            type="button"
            className="analytics-hub-row analytics-hub-row--group"
            onClick={() => navigate('/analytics/group')}
          >
            <div className="analytics-hub-row-icon analytics-hub-row-icon--group">
              <Users size={18} strokeWidth={2.25} />
            </div>
            <div className="analytics-hub-row-body">
              <div className="analytics-hub-row-title">群聊分析</div>
              <div className="analytics-hub-row-desc">成员排行、活跃时段、媒体占比与群内互动结构。</div>
              <div className="analytics-hub-row-chips">
                <span>成员</span>
                <span>时段</span>
                <span>媒体</span>
              </div>
            </div>
            <ArrowRight size={16} className="analytics-hub-row-arrow" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChatAnalyticsHubPage
