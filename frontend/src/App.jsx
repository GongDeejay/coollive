import { useState, useRef, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import './App.css'

export default function App() {
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || '/api'

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

      const zenMsg = { role: 'zen', content: data.reply, id: Date.now() + 1 }
      setMessages(prev => [...prev, zenMsg])
    } catch (e) {
      const errMsg = {
        role: 'zen',
        content: '静水深流，此刻连接暂断。\n片刻后，再来。',
        id: Date.now() + 1,
        error: true,
      }
      setMessages(prev => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }, [sessionId, loading, apiBase])

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
            <span className="logo-sub">· 禅语问答</span>
          </div>
          {messages.length > 0 && (
            <button className="btn-clear" onClick={clearSession} title="开启新的对话">
              新对话
            </button>
          )}
        </div>
      </header>
      <main className="app-main">
        <ChatWindow messages={messages} loading={loading} onSend={sendMessage} />
      </main>
    </div>
  )
}
