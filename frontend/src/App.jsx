import { useState, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import JournalPage from './components/JournalPage'
import { useJournal } from './hooks/useJournal'
import './App.css'

export default function App() {
  const [tab, setTab] = useState('chat')          // 'chat' | 'journal'
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || '/api'

  const { entries, saving, addEntry, deleteEntry, exportMarkdown, exportJSON } =
    useJournal(sessionId, apiBase)

  // ── Chat ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text, id: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message: text }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!sessionId) setSessionId(data.session_id)
      setMessages(prev => [...prev, {
        role: 'zen', content: data.reply, id: Date.now() + 1,
        message_id: data.message_id, liked: false, disliked: false,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'zen',
        content: '静水深流，此刻连接暂断。\n片刻后，再来。',
        id: Date.now() + 1, error: true,
      }])
    } finally {
      setLoading(false)
    }
  }, [sessionId, loading, apiBase])

  const likeMessage = useCallback(async (msgId, messageId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, liked: true } : m))
    try {
      await fetch(`${apiBase}/feedback/like`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
    } catch {}
  }, [apiBase])

  const dislikeMessage = useCallback(async (msgId, messageId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, disliked: true } : m))
    try {
      await fetch(`${apiBase}/feedback/dislike`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
    } catch {}
  }, [apiBase])

  const clearSession = useCallback(async () => {
    if (sessionId) {
      await fetch(`${apiBase}/session/${sessionId}`, { method: 'DELETE' }).catch(() => {})
    }
    setSessionId(null)
    setMessages([])
  }, [sessionId, apiBase])

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-circle" />
            <span className="logo-text">ZenTalk</span>
          </div>

          <nav className="app-nav">
            <button
              className={`nav-tab ${tab === 'chat' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('chat')}
            >
              对话
            </button>
            <button
              className={`nav-tab ${tab === 'journal' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('journal')}
            >
              日记
              {entries.length > 0 && (
                <span className="nav-badge">{entries.length}</span>
              )}
            </button>
          </nav>

          {tab === 'chat' && messages.length > 0 && (
            <button className="btn-clear" onClick={clearSession}>新对话</button>
          )}
          {tab === 'journal' && <div className="btn-clear-placeholder" />}
        </div>
      </header>

      <main className="app-main">
        {tab === 'chat' && (
          <ChatWindow
            messages={messages}
            loading={loading}
            onSend={sendMessage}
            onLike={likeMessage}
            onDislike={dislikeMessage}
          />
        )}
        {tab === 'journal' && (
          <JournalPage
            onSave={addEntry}
            saving={saving}
            entries={entries}
            onDelete={deleteEntry}
            onExportMd={exportMarkdown}
            onExportJson={exportJSON}
          />
        )}
      </main>
    </div>
  )
}
