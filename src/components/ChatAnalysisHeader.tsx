import { ChevronDown, ChevronLeft } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import './ChatAnalysisHeader.scss'

export type ChatAnalysisMode = 'private' | 'group' | 'dual'

interface ChatAnalysisHeaderProps {
  currentMode: ChatAnalysisMode
  actions?: ReactNode
}

const MODE_CONFIG: Record<ChatAnalysisMode, { label: string; path: string }> = {
  private: {
    label: '私聊分析',
    path: '/analytics/private'
  },
  group: {
    label: '群聊分析',
    path: '/analytics/group'
  },
  dual: {
    label: '双人分析',
    path: '/analytics/dual'
  }
}

const MODE_ORDER: ChatAnalysisMode[] = ['private', 'dual', 'group']

function ChatAnalysisHeader({ currentMode, actions }: ChatAnalysisHeaderProps) {
  const navigate = useNavigate()
  const currentLabel = MODE_CONFIG[currentMode].label
  const [menuOpen, setMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const otherModes = useMemo(
    () => MODE_ORDER.filter((mode) => mode !== currentMode),
    [currentMode]
  )

  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  return (
    <div className="chat-analysis-header">
      <div className="chat-analysis-breadcrumb">
        <button
          type="button"
          className="chat-analysis-back"
          onClick={() => navigate('/analytics')}
        >
          <ChevronLeft size={16} />
          <span>聊天分析</span>
        </button>
        <span className="chat-analysis-breadcrumb-separator">/</span>
        <div className="chat-analysis-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className={`chat-analysis-current-trigger ${menuOpen ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className="current">{currentLabel}</span>
            <ChevronDown size={14} />
          </button>

          {menuOpen && (
            <div className="chat-analysis-menu" role="menu" aria-label="切换聊天分析类型">
              {otherModes.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitem"
                  className="chat-analysis-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate(MODE_CONFIG[mode].path)
                  }}
                >
                  {MODE_CONFIG[mode].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {actions ? <div className="chat-analysis-actions">{actions}</div> : null}
    </div>
  )
}

export default ChatAnalysisHeader
