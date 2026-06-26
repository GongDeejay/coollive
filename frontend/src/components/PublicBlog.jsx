import { useEffect, useState } from 'react'
import './PublicBlog.css'

const EMOTION_COLOR = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
  疲惫: '#7a6a5a', 兴奋: '#9aaf6a', 矛盾: '#8a6a9a',
  满足: '#6a9a7a', 孤独: '#6a6a8a',
}

function TagPill({ label, type }) {
  const color = type === 'emotion' ? EMOTION_COLOR[label] : undefined
  return (
    <span className="bp-tag" style={color ? { borderColor: color, color } : {}}>
      #{label}
    </span>
  )
}

function BlogEntry({ entry }) {
  const d = new Date(entry.created_at)
  const dateStr = `${d.getFullYear()} · ${d.getMonth()+1}月${d.getDate()}日`
  const hasTemplate = entry.scene || entry.feeling || entry.reflection

  return (
    <article className="bp-entry">
      <header className="bp-entry-header">
        <time className="bp-entry-date">{dateStr}</time>
        {entry.tags && (
          <div className="bp-entry-tags">
            {entry.tags.emotion?.map(t => <TagPill key={t} label={t} type="emotion" />)}
            {entry.tags.topic?.slice(0, 3).map(t => <TagPill key={t} label={t} />)}
          </div>
        )}
      </header>

      {entry.summary && <p className="bp-entry-summary">{entry.summary}</p>}

      <div className="bp-entry-body">
        {hasTemplate ? (
          <>
            {entry.scene      && <div className="bp-field"><span>场景</span><p>{entry.scene}</p></div>}
            {entry.feeling    && <div className="bp-field"><span>感受</span><p>{entry.feeling}</p></div>}
            {entry.reflection && <div className="bp-field"><span>体会</span><p>{entry.reflection}</p></div>}
          </>
        ) : (
          <p className="bp-raw">{entry.raw}</p>
        )}
      </div>

      {entry.tags?.keywords?.length > 0 && (
        <div className="bp-keywords">
          {entry.tags.keywords.map(k => <span key={k} className="bp-kw">{k}</span>)}
        </div>
      )}
    </article>
  )
}

export default function PublicBlog({ userId, apiBase }) {
  const [profile, setProfile] = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    fetch(`${apiBase}/public/${userId}/entries`)
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'not_found' : 'error')
        return r.json()
      })
      .then(data => {
        setProfile(data.profile)
        setEntries(data.entries || [])
      })
      .catch(e => setError(e.message === 'not_found' ? '页面不存在' : '加载失败'))
      .finally(() => setLoading(false))
  }, [userId, apiBase])

  if (loading) return (
    <div className="bp-page bp-state">
      <div className="bp-loading-dot" />
    </div>
  )

  if (error) return (
    <div className="bp-page bp-state">
      <p className="bp-error">{error}</p>
      <a href="/" className="bp-back">← 返回 ZenTalk</a>
    </div>
  )

  return (
    <div className="bp-page">
      <header className="bp-header">
        <div className="bp-header-inner">
          <a href="/" className="bp-logo">
            <span className="bp-logo-circle" />
            <span>ZenTalk</span>
          </a>
        </div>
      </header>

      <main className="bp-main">
        <div className="bp-profile">
          <h1 className="bp-profile-name">{profile?.display_name}</h1>
          <p className="bp-profile-sub">{entries.length} 条公开记录</p>
        </div>

        {entries.length === 0 ? (
          <p className="bp-empty">暂无公开内容</p>
        ) : (
          <div className="bp-entries">
            {entries.map(e => <BlogEntry key={e.id} entry={e} />)}
          </div>
        )}
      </main>
    </div>
  )
}
