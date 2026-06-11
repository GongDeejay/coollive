import { useEffect, useState, useCallback } from 'react'
import './ChatHistoryPanel.css'

function relativeTime(isoStr) {
  if (!isoStr) return ''
  try {
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
    if (diff < 60)        return '刚刚'
    if (diff < 3600)      return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400)     return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`
    return new Date(isoStr).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function ChatHistoryPanel({ apiBase, token, onLoadSession, onNewSession, onClose }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/chat/history`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = res.ok ? await res.json() : { sessions: [] }
      setSessions(data.sessions || [])
    } catch { setSessions([]) }
    finally  { setLoading(false) }
  }, [apiBase, token])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const handleDelete = async (e, session_id) => {
    e.stopPropagation()
    if (!window.confirm('删除这段对话？')) return
    setDeletingId(session_id)
    try {
      await fetch(`${apiBase}/chat/history/${session_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setSessions(s => s.filter(x => x.session_id !== session_id))
    } finally { setDeletingId(null) }
  }

  return (
    <div className="chp-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="chp-panel">
        {/* Header */}
        <div className="chp-header">
          <span className="chp-title">历史对话</span>
          <button className="chp-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        {/* New conversation CTA */}
        <button className="chp-new-btn" onClick={onNewSession}>
          <span className="chp-new-icon">＋</span> 开始新对话
        </button>

        {/* List */}
        <div className="chp-list">
          {loading ? (
            <div className="chp-state">加载中…</div>
          ) : sessions.length === 0 ? (
            <div className="chp-state chp-state--empty">
              <p>还没有历史对话</p>
              <p className="chp-state-sub">下次聊天会自动保存</p>
            </div>
          ) : (
            sessions.map(s => (
              <div
                key={s.session_id}
                className={`chp-item ${deletingId === s.session_id ? 'chp-item--deleting' : ''}`}
                onClick={() => onLoadSession(s.session_id)}
              >
                <div className="chp-item-body">
                  <p className="chp-item-title">{s.title || '（无标题）'}</p>
                  <p className="chp-item-meta">
                    {relativeTime(s.last_at)}
                    <span className="chp-item-dot">·</span>
                    {s.turn_count} 轮
                  </p>
                </div>
                <button
                  className="chp-item-del"
                  onClick={e => handleDelete(e, s.session_id)}
                  aria-label="删除"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
