import { useState, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import JournalPage from './components/JournalPage'
import AuthModal from './components/AuthModal'
import PublicBlog from './components/PublicBlog'
import DeckOverlay from './components/DeckOverlay'
import MindFreedomPage from './components/MindFreedomPage'
import AdminDashboard from './components/AdminDashboard'
import ChangePasswordModal from './components/ChangePasswordModal'

const ADMIN_EMAIL = 'gongdj@gmail.com'
import { useJournal } from './hooks/useJournal'
import { useAuth } from './hooks/useAuth'
import { useDeck } from './hooks/useDeck'
import './App.css'

// Simple client-side route detection
function getPublicBlogUserId() {
  const m = window.location.pathname.match(/^\/blog\/([^/]+)/)
  return m ? m[1] : null
}

export default function App() {
  const [tab, setTab]           = useState('chat')
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [showAuth, setShowAuth]     = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showUserMenu, setShowUserMenu]   = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || '/api'

  const { user, token, loading: authLoading, error: authError,
          register, login, logout, clearError } = useAuth(apiBase)

  const { entries, saving, syncing, addEntry, deleteEntry, togglePublic,
          exportMarkdown, exportJSON } = useJournal(sessionId, apiBase, token)

  const {
    deckItems, deckOpen, setDeckOpen,
    addToDeck, removeFromDeck, changeSlideType, reorder,
    addSpecialSlide, updateSpecialSlide,
    clearDeck, isInDeck,
    savedDecks, saveDeck, loadDeck, deleteSavedDeck,
  } = useDeck()

  // Public blog route — render immediately, no auth needed
  const blogUserId = getPublicBlogUserId()
  if (blogUserId) {
    return <PublicBlog userId={blogUserId} apiBase={apiBase} />
  }

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
  const handleLogout = () => { logout(); setShowAuth(false); setShowUserMenu(false) }

  // Derive display name for header
  const userLabel = user ? user.email.split('@')[0] : null

  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="header-inner">
          {/* Logo */}
          <div className="logo">
            <span className="logo-circle" />
            <span className="logo-text">Hello World</span>
          </div>

          {/* Center nav */}
          <nav className="app-nav">
            <button className={`nav-tab ${tab === 'chat' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('chat')}>聊聊</button>
            <button className={`nav-tab ${tab === 'journal' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('journal')}>
              随记
              {entries.length > 0 && <span className="nav-badge">{entries.length}</span>}
            </button>
            <button className={`nav-tab ${tab === 'freedom' ? 'nav-tab--active' : ''}`}
              onClick={() => setTab('freedom')}>测测</button>
            {user?.email === ADMIN_EMAIL && (
              <button className={`nav-tab ${tab === 'admin' ? 'nav-tab--active' : ''}`}
                onClick={() => setTab('admin')}>后台</button>
            )}
          </nav>

          {/* Right actions */}
          <div className="header-actions">
            {tab === 'chat' && messages.length > 0 && (
              <button className="btn-clear" onClick={clearSession}>新对话</button>
            )}
            {user ? (
              <div className="user-menu-wrap">
                <button className="btn-auth btn-auth--user"
                  onClick={() => setShowUserMenu(v => !v)}
                  title={user.email}>
                  {userLabel} ▾
                </button>
                {showUserMenu && (
                  <div className="user-menu-dropdown" onClick={() => setShowUserMenu(false)}>
                    <button onClick={() => { setShowChangePwd(true) }}>修改密码</button>
                    <button onClick={handleLogout}>退出登录</button>
                  </div>
                )}
              </div>
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
        {tab === 'freedom' && (
          <MindFreedomPage
            apiBase={apiBase}
            user={user}
            token={token}
            onLoginPrompt={() => setShowAuth(true)}
          />
        )}
        {tab === 'admin' && user?.email === ADMIN_EMAIL && (
          <AdminDashboard apiBase={apiBase} token={token} />
        )}
        {tab === 'journal' && (
          <JournalPage
            onSave={addEntry} saving={saving} syncing={syncing}
            entries={entries} onDelete={deleteEntry} onTogglePublic={togglePublic}
            onExportMd={exportMarkdown} onExportJson={exportJSON}
            isLoggedIn={!!user} userId={user?.user_id}
            onLoginPrompt={() => setShowAuth(true)}
            onAddToDeck={addToDeck} isInDeck={isInDeck}
          />
        )}
      </main>

      {/* Floating deck button */}
      {!deckOpen && (deckItems.length > 0 || savedDecks.length > 0) && (
        <button className="deck-fab" onClick={() => setDeckOpen(true)}>
          <span className="deck-fab-icon">&#9633;</span>
          演示
          {deckItems.length > 0 && <span className="deck-fab-badge">{deckItems.length}</span>}
        </button>
      )}

      {deckOpen && (
        <DeckOverlay
          deckItems={deckItems}
          onRemove={removeFromDeck}
          onChangeType={changeSlideType}
          onReorder={reorder}
          addSpecialSlide={addSpecialSlide}
          updateSpecialSlide={updateSpecialSlide}
          onClose={() => setDeckOpen(false)}
          savedDecks={savedDecks}
          onSaveDeck={saveDeck}
          onLoadDeck={loadDeck}
          onDeleteSavedDeck={deleteSavedDeck}
          journalEntries={entries}
          addToDeck={addToDeck}
        />
      )}

      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); clearError() }}
          onRegister={register} onLogin={login}
          loading={authLoading} error={authError} clearError={clearError}
        />
      )}

      {showChangePwd && user && (
        <ChangePasswordModal
          apiBase={apiBase} token={token}
          userEmail={user.email}
          onClose={() => setShowChangePwd(false)}
        />
      )}
    </div>
  )
}
