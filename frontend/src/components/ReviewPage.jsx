import { useMemo, useState } from 'react'
import { formatLocation } from '../utils/location'
import './ReviewPage.css'

function entryText(entry) {
  return [entry.scene, entry.feeling, entry.reflection, entry.raw, entry.summary]
    .filter(Boolean)
    .join(' ')
}

function withinDays(entry, days) {
  const ts = new Date(entry.created_at).getTime()
  if (!Number.isFinite(ts)) return false
  return Date.now() - ts <= days * 86400000
}

function RelatedEntry({ entry }) {
  const d = new Date(entry.created_at)
  const date = `${d.getMonth() + 1}月${d.getDate()}日`
  const text = entryText(entry)
  return (
    <div className="review-entry">
      <div className="review-entry-head">
        <span>{date}</span>
        {entry.location && <span className="review-entry-location">📍 {formatLocation(entry.location)}</span>}
      </div>
      <p>{text.slice(0, 120)}{text.length > 120 ? '…' : ''}</p>
    </div>
  )
}

export default function ReviewPage({ entries, apiBase, onChatPrompt }) {
  const [days, setDays] = useState(7)
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scopedEntries = useMemo(() => {
    return entries
      .filter(e => withinDays(e, days))
      .slice(0, 80)
  }, [entries, days])

  const handleGenerate = async () => {
    if (loading || scopedEntries.length === 0) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${apiBase}/journal/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, entries: scopedEntries }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setReview(await res.json())
    } catch {
      setError('回看生成失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const chatQuestion = review?.suggested_question || review?.stuck_point || ''

  return (
    <div className="review-page">
      <section className="review-hero">
        <div>
          <p className="review-kicker">伙伴 · 回看</p>
          <h1>让过去的你，回来找你</h1>
          <p className="review-sub">
            ZenTalk 会读取最近的随记，帮你看见反复出现的主题、情绪和真正卡住的点。
          </p>
        </div>
      </section>

      <section className="review-control-card">
        <div className="review-range">
          {[7, 30].map(n => (
            <button
              key={n}
              className={days === n ? 'review-range-btn review-range-btn--on' : 'review-range-btn'}
              onClick={() => { setDays(n); setReview(null); setError('') }}
            >
              最近 {n} 天
            </button>
          ))}
        </div>
        <div className="review-control-bottom">
          <span>{scopedEntries.length} 条随记可回看</span>
          <button
            className="review-generate-btn"
            onClick={handleGenerate}
            disabled={loading || scopedEntries.length === 0}
          >
            {loading ? '正在回看…' : '生成回看'}
          </button>
        </div>
        {scopedEntries.length === 0 && (
          <p className="review-empty-hint">这段时间还没有随记。先写下一条，伙伴才有东西可以记得。</p>
        )}
        {error && <p className="review-error">{error}</p>}
      </section>

      {review && (
        <section className="review-result">
          <div className="review-title-row">
            <h2>{review.title}</h2>
            {review.fallback && <span className="review-fallback">本地回看</span>}
          </div>

          <div className="review-card review-summary">
            <span className="review-card-label">这段时间</span>
            <p>{review.period_summary}</p>
          </div>

          <div className="review-grid">
            <div className="review-card">
              <span className="review-card-label">情绪天气</span>
              <p>{review.emotional_weather}</p>
            </div>
            <div className="review-card">
              <span className="review-card-label">核心张力</span>
              <p>{review.core_tension}</p>
            </div>
          </div>

          <div className="review-card review-stuck">
            <span className="review-card-label">可能真正卡住的点</span>
            <p>{review.stuck_point}</p>
          </div>

          {review.recurring_patterns?.length > 0 && (
            <div className="review-card">
              <span className="review-card-label">反复出现的模式</span>
              <ul className="review-patterns">
                {review.recurring_patterns.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {review.keywords?.length > 0 && (
            <div className="review-keywords">
              {review.keywords.map(k => <span key={k}>{k}</span>)}
            </div>
          )}

          {review.gentle_action && (
            <div className="review-card review-action">
              <span className="review-card-label">一个很轻的下一步</span>
              <p>{review.gentle_action}</p>
            </div>
          )}

          {chatQuestion && (
            <button className="review-chat-btn" onClick={() => onChatPrompt(chatQuestion)}>
              就这个点聊聊
            </button>
          )}

          {review.related_entries?.length > 0 && (
            <div className="review-related">
              <h3>相关原文</h3>
              {review.related_entries.map(e => <RelatedEntry key={e.id} entry={e} />)}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
