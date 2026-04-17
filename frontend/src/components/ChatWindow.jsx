import { useEffect, useRef, useState } from 'react'
import './ChatWindow.css'

const ZEN_PLACEHOLDERS = [
  '你今日有何烦恼……',
  '心中有何困惑，说来听听……',
  '此刻，你在想什么……',
  '有何事如鲠在喉……',
  '放下一切，说说看……',
]

function TypingDots() {
  return (
    <div className="typing-dots">
      <span /><span /><span />
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--zen'}`}>
      {!isUser && (
        <div className="avatar zen-avatar">
          <span className="avatar-circle" />
        </div>
      )}
      <div className={`bubble ${isUser ? 'bubble--user' : 'bubble--zen'} ${msg.error ? 'bubble--error' : ''}`}>
        {msg.content.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="welcome">
      <div className="welcome-enso" />
      <h1 className="welcome-title">万物皆有答案</h1>
      <p className="welcome-sub">
        说出你的烦恼，禅师为你拨开迷雾
      </p>
      <p className="welcome-hint">be still · just this · let go</p>
    </div>
  )
}

export default function ChatWindow({ messages, loading, onSend }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const [placeholder] = useState(
    () => ZEN_PLACEHOLDERS[Math.floor(Math.random() * ZEN_PLACEHOLDERS.length)]
  )

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = () => {
    const text = input.trim()
    if (!text) return
    onSend(text)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  return (
    <div className="chat-window">
      <div className="messages-area">
        {messages.length === 0 ? (
          <WelcomeScreen />
        ) : (
          messages.map(msg => <Message key={msg.id} msg={msg} />)
        )}
        {loading && (
          <div className="msg-row msg-row--zen">
            <div className="avatar zen-avatar">
              <span className="avatar-circle" />
            </div>
            <div className="bubble bubble--zen bubble--loading">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-bar">
        <div className="input-wrap">
          <textarea
            ref={textareaRef}
            className="input-field"
            placeholder={placeholder}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={loading}
          />
          <button
            className={`send-btn ${input.trim() ? 'send-btn--active' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || loading}
            aria-label="发送"
          >
            <SendIcon />
          </button>
        </div>
        <p className="input-hint">Enter 发送 · Shift+Enter 换行</p>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
