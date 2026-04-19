import { useEffect, useRef, useState } from 'react'
import './ChatWindow.css'

const ZEN_PLACEHOLDERS = [
  '此刻你在想什么……',
  '有什么想和自己说的……',
  '心里那个声音是什么……',
  '放下来，说说看……',
  '你真正在意的是什么……',
]

function TypingDots() {
  return (
    <div className="typing-dots">
      <span /><span /><span />
    </div>
  )
}

function FeedbackButtons({ liked, disliked, onLike, onDislike }) {
  const [likeBurst, setLikeBurst] = useState(false)
  const [dislikeBurst, setDislikeBurst] = useState(false)

  const handleLike = () => {
    if (liked || disliked) return
    setLikeBurst(true)
    onLike()
    setTimeout(() => setLikeBurst(false), 600)
  }

  const handleDislike = () => {
    if (liked || disliked) return
    setDislikeBurst(true)
    onDislike()
    setTimeout(() => setDislikeBurst(false), 600)
  }

  return (
    <div className="feedback-btns">
      <button
        className={`feedback-btn feedback-btn--like ${liked ? 'feedback-btn--active-like' : ''} ${likeBurst ? 'feedback-btn--burst' : ''}`}
        onClick={handleLike}
        disabled={liked || disliked}
        title="学习此风格"
        aria-label="点赞"
      >
        <ThumbUpIcon filled={liked} />
      </button>
      <button
        className={`feedback-btn feedback-btn--dislike ${disliked ? 'feedback-btn--active-dislike' : ''} ${dislikeBurst ? 'feedback-btn--burst' : ''}`}
        onClick={handleDislike}
        disabled={liked || disliked}
        title="避免此风格"
        aria-label="不喜欢"
      >
        <ThumbDownIcon filled={disliked} />
      </button>
    </div>
  )
}

function Message({ msg, onLike, onDislike }) {
  const isUser = msg.role === 'user'
  const isZen = msg.role === 'zen'
  const showFeedback = isZen && !msg.error && msg.message_id

  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--zen'}`}>
      {isZen && (
        <div className="avatar zen-avatar">
          <span className="avatar-circle" />
        </div>
      )}
      <div className="msg-body">
        <div className={`bubble ${isUser ? 'bubble--user' : 'bubble--zen'} ${msg.error ? 'bubble--error' : ''}`}>
          {msg.content.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        {showFeedback && (
          <FeedbackButtons
            liked={!!msg.liked}
            disliked={!!msg.disliked}
            onLike={() => onLike(msg.id, msg.message_id)}
            onDislike={() => onDislike(msg.id, msg.message_id)}
          />
        )}
      </div>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="welcome">
      <div className="welcome-enso" />
      <h1 className="welcome-title">和自己说说话</h1>
      <p className="welcome-hint">be still · just this · let go</p>
    </div>
  )
}

export default function ChatWindow({ messages, loading, onSend, onLike, onDislike }) {
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
          messages.map(msg => (
            <Message key={msg.id} msg={msg} onLike={onLike} onDislike={onDislike} />
          ))
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
        <p className="input-hint">Enter 发送 &nbsp;·&nbsp; Shift+Enter 换行</p>
      </div>
    </div>
  )
}

function ThumbUpIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  )
}

function ThumbDownIcon({ filled }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
      <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
