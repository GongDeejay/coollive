import { useState, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import JournalPage from './components/JournalPage'
import AuthModal from './components/AuthModal'
import { useJournal } from './hooks/useJournal'
import { useAuth } from './hooks/useAuth'
import './App.css'

export default function App() {
  const [tab, setTab]           = useState('chat')
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || '/api'

  const { user, token, loading: authLoading, error: authError,
          register, login, logout, clearError } = useAuth(apiBase)

  const { entries, saving, syncing, addEntry, deleteEntry,
          exportMarkdown, exportJSON } = useJournal(sessionId, apiBase, token)

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
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!sessionId) setSessionId(data.session_id)
      setMessages(prev => [...prev, {
        role: 'zen', content: data.reply, id: Date.now() + 1,
        message_id: data.message_id, liked: false, disliked: false,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'zen',
        content: '此刻连接暂断。\n稍后再来。',
        id: Date.now() + 1, error: true,
      }])
    } finally { setLoading(false) }
  }, [sessionId, loading, apiBase])

  const likeMessage = useCallback(async (msgId, messageId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, liked: true } : m))
    fetch(`${apiBase}/feedback/like`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    }).catch(() => {})
  }, [apiBase])

  const dislikeMessage = useCallback(async (msgId, messageId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, disliked: true } : m))
    fetch(`${apiBase}/feedback/dislike`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: messageId }),
    }).catch(() => {})
  }, [apiBase])

  const clearSession = useCallback(async () => {
    if (sessionId)
      await fetch(`${apiBase}/session/${sessionId}`, { method: 'DELETE' }).catch(() => {})
    setSessionId(null); setMessages([])
  }, [sessionId, apiBase])

  // ── Auth ──────────────────────────────────────────────────────────
  const handleLogout = () => { logout(); setShowAuth(false) }

  // Derive display name for header
  const userLabel = user ? user.email.split('@')[0] : null

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          {/* Logo */}
          <div className="logo">
            <span className="logo-circle" />
            <span className="logo-text">ZenTalk</span>
          </div>

          {/* Center nav */}
          <nav className="app-nav">
            <button className={`nav-tab ${tab === 'chat' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('chat')}>对话</button>
            <button className={`nav-tab ${tab === 'journal' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('journal')}>
              日记
              {entries.length > 0 && <span className="nav-badge">{entries.length}</span>}
            </button>
          </nav>

          {/* Right actions */}
          <div className="header-actions">
            {tab === 'chat' && messages.length > 0 && (
              <button className="btn-clear" onClick={clearSession}>新对话</button>
            )}
            {user ? (
              <button className="btn-auth btn-auth--user" onClick={handleLogout}
                title={`${user.email} · 点击退出`}>
                {userLabel}
              </button>
            ) : (
              <button className="btn-auth" onClick={() => setShowAuth(true)}>登录</button>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        {tab === 'chat' && (
          <ChatWindow
            messages={messages} loading={loading}
            onSend={sendMessage} onLike={likeMessage} onDislike={dislikeMessage}
          />
        )}
        {tab === 'journal' && (
          <JournalPage
            onSave={addEntry} saving={saving} syncing={syncing}
            entries={entries} onDelete={deleteEntry}
            onExportMd={exportMarkdown} onExportJson={exportJSON}
            isLoggedIn={!!user}
            onLoginPrompt={() => setShowAuth(true)}
          />
        )}
      </main>

      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); clearError() }}
          onRegister={register} onLogin={login}
          loading={authLoading} error={authError} clearError={clearError}
        />
      )}
    </div>
  )
}
