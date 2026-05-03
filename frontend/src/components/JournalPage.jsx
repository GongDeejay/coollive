import { useState, useRef, useCallback } from 'react'
import JournalCharts from './JournalCharts'
import './JournalPage.css'

const TEMPLATE_FIELDS = [
  { key: 'scene',      placeholder: '当时的场景……' },
  { key: 'feeling',    placeholder: '当时的感受……' },
  { key: 'reflection', placeholder: '现在的体会……' },
]

// ── Color maps ────────────────────────────────────────────────────
const EMOTION_COLOR = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
  疲惫: '#8a6a5a', 兴奋: '#9aaf5a', 矛盾: '#8a6a9a',
  满足: '#6a9a7a', 孤独: '#6a6a8a', 轻松: '#6a9a8a', 烦躁: '#9a6a5a',
}

// ── Quadrant display helpers ──────────────────────────────────────
const QUADRANT_COLORS = { Others: '#7a9aaf', Self: '#c4a882', Task: '#9aaf7a', World: '#af8a7a' }
const QUADRANT_LABELS = { Others: '对人', Self: '对己', Task: '对事', World: '对世' }

// ── Layer config: label, short prefix, color class ────────────────
const LAYER_META = {
  object:      { label: '对象', cls: 'tag-layer-object' },
  operation:   { label: '动作', cls: 'tag-layer-operation' },
  tension:     { label: '张力', cls: 'tag-layer-tension' },
  output_form: { label: '输出', cls: 'tag-layer-output' },
  emotion:     { label: '情绪', cls: 'tag-layer-emotion' },
}

function TagPill({ label, layer }) {
  const meta = LAYER_META[layer] || {}
  const emotionColor = layer === 'emotion' ? EMOTION_COLOR[label] : undefined
  return (
    <span
      className={`tag-pill ${meta.cls || ''}`}
      style={emotionColor ? { borderColor: emotionColor, color: emotionColor } : {}}
    >
      {label}
    </span>
  )
}

// Compact tag row shown in collapsed card header
function TagRowCompact({ tags }) {
  if (!tags) return null
  return (
    <div className="entry-tags-row">
      {tags.emotion?.slice(0, 2).map(t => <TagPill key={t} label={t} layer="emotion" />)}
      {tags.object?.slice(0, 2).map(t => <TagPill key={t} label={t} layer="object" />)}
      {tags.tension?.slice(0, 1).map(t => <TagPill key={t} label={t} layer="tension" />)}
    </div>
  )
}

// Full four-layer tag block shown in expanded card
function TagLayerBlock({ tags }) {
  if (!tags) return null
  const layers = [
    { key: 'object',      items: tags.object      || [] },
    { key: 'operation',   items: tags.operation   || [] },
    { key: 'tension',     items: tags.tension     || [] },
    { key: 'output_form', items: tags.output_form || [] },
    { key: 'emotion',     items: tags.emotion     || [] },
  ].filter(l => l.items.length > 0)

  return (
    <div className="tag-layer-block">
      {layers.map(({ key, items }) => (
        <div key={key} className="tag-layer-row">
          <span className="tag-layer-label">{LAYER_META[key]?.label}</span>
          <div className="tag-layer-pills">
            {items.map(t => <TagPill key={t} label={t} layer={key} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function EntryCard({ entry, onDelete, onTogglePublic, isLoggedIn, onAddToDeck, inDeck }) {
  const [expanded, setExpanded] = useState(false)
  const d = new Date(entry.created_at)
  const dateStr = `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

  const hasTemplate = entry.scene || entry.feeling || entry.reflection
  const preview = entry.summary || entry.scene || entry.raw || ''

  return (
    <div className="entry-card" onClick={() => setExpanded(e => !e)}>
      <div className="entry-header">
        <span className="entry-date">{dateStr}</span>
        <div className="entry-header-right">
          {entry.is_public && <span className="entry-public-badge">公开</span>}
          {entry.tags ? <TagRowCompact tags={entry.tags} /> : <span className="entry-tagging">分析中…</span>}
        </div>
      </div>

      {!expanded && (
        <p className="entry-preview">{preview.slice(0, 60)}{preview.length > 60 ? '…' : ''}</p>
      )}

      {expanded && (
        <div className="entry-body">
          {hasTemplate ? (
            <>
              {entry.scene      && <div className="entry-field"><span>场景</span><p>{entry.scene}</p></div>}
              {entry.feeling    && <div className="entry-field"><span>感受</span><p>{entry.feeling}</p></div>}
              {entry.reflection && <div className="entry-field"><span>体会</span><p>{entry.reflection}</p></div>}
            </>
          ) : (
            <p className="entry-raw">{entry.raw}</p>
          )}
          {entry.tags && (
            <>
              <TagLayerBlock tags={entry.tags} />
              {entry.tags.keywords?.length > 0 && (
                <div className="entry-keywords">
                  {entry.tags.keywords.map(k => (
                    <span key={k} className="keyword-chip">{k}</span>
                  ))}
                </div>
              )}
            </>
          )}
          {entry.quadrant && (
            <div className="entry-quadrant">
              <span className="entry-quadrant-dim"
                style={{ color: QUADRANT_COLORS[entry.quadrant.dim] }}>
                {QUADRANT_LABELS[entry.quadrant.dim]}
              </span>
              <span className="entry-quadrant-val">
                {entry.quadrant.value > 0 ? '+' : ''}{entry.quadrant.value}
              </span>
              <span className="entry-quadrant-energy">⚡{entry.quadrant.energy}</span>
              <span className="entry-quadrant-reason">{entry.quadrant.reason}</span>
            </div>
          )}
          <div className="entry-actions">
            <button
              className={`entry-deck-btn ${inDeck ? 'entry-deck-btn--on' : ''}`}
              onClick={e => { e.stopPropagation(); if (!inDeck) onAddToDeck(entry) }}
              title={inDeck ? '已加入演示' : '加入演示'}
            >
              {inDeck ? '◻ 已加入' : '◻ 演示'}
            </button>
            {isLoggedIn && (
              <button
                className={`entry-public-btn ${entry.is_public ? 'entry-public-btn--on' : ''}`}
                onClick={e => { e.stopPropagation(); onTogglePublic(entry.id) }}
              >
                {entry.is_public ? '✓ 已公开' : '公开'}
              </button>
            )}
            <button className="entry-delete" onClick={e => { e.stopPropagation(); onDelete(entry.id) }}>
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function JournalInput({ onSave, saving }) {
  const [useTemplate, setUseTemplate] = useState(true)
  const [fields, setFields] = useState({ scene: '', feeling: '', reflection: '' })
  const [freeText, setFreeText] = useState('')
  const refs = { scene: useRef(), feeling: useRef(), reflection: useRef(), free: useRef() }

  const isEmpty = useTemplate
    ? !fields.scene && !fields.feeling && !fields.reflection
    : !freeText.trim()

  const handleFieldInput = (key, e) => {
    setFields(prev => ({ ...prev, [key]: e.target.value }))
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const handleFreeInput = (e) => {
    setFreeText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 300) + 'px'
  }

  const handleSave = () => {
    if (isEmpty || saving) return
    if (useTemplate) {
      onSave({ scene: fields.scene, feeling: fields.feeling, reflection: fields.reflection, raw: '' })
      setFields({ scene: '', feeling: '', reflection: '' })
      Object.values(refs).forEach(r => { if (r.current) r.current.style.height = 'auto' })
    } else {
      onSave({ scene: '', feeling: '', reflection: '', raw: freeText })
      setFreeText('')
      if (refs.free.current) refs.free.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="journal-input-card">
      <div className="journal-input-toolbar">
        <span className="journal-input-title">新记录</span>
        <button
          className={`template-toggle ${useTemplate ? 'template-toggle--on' : ''}`}
          onClick={() => setUseTemplate(v => !v)}
          title={useTemplate ? '切换为自由输入' : '切换为模板'}
        >
          {useTemplate ? '模板' : '自由'}
        </button>
      </div>

      {useTemplate ? (
        <div className="template-fields">
          {TEMPLATE_FIELDS.map(({ key, placeholder }) => (
            <div key={key} className="template-row">
              <span className="template-label">{placeholder.replace('……', '')}</span>
              <textarea
                ref={refs[key]}
                className="template-textarea"
                placeholder={placeholder}
                value={fields[key]}
                onChange={e => handleFieldInput(key, e)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
            </div>
          ))}
        </div>
      ) : (
        <textarea
          ref={refs.free}
          className="journal-free-textarea"
          placeholder="写下此刻……"
          value={freeText}
          onChange={handleFreeInput}
          onKeyDown={handleKeyDown}
          rows={4}
        />
      )}

      <div className="journal-input-footer">
        <span className="journal-hint">⌘+Enter 保存</span>
        <button
          className={`journal-save-btn ${isEmpty ? '' : 'journal-save-btn--active'}`}
          onClick={handleSave}
          disabled={isEmpty || saving}
        >
          {saving ? '分析中…' : '记录'}
        </button>
      </div>
    </div>
  )
}

function groupByDate(entries) {
  const groups = {}
  entries.forEach(e => {
    const d = new Date(e.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  })
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

function formatDateGroup(key) {
  const today = new Date()
  const d = new Date(key)
  const diff = Math.floor((today - d) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${d.getMonth()+1}月${d.getDate()}日`
}

export default function JournalPage({ onSave, saving, syncing, entries, onDelete, onTogglePublic, onExportMd, onExportJson, isLoggedIn, userId, onLoginPrompt, onAddToDeck, isInDeck, analyzeHistorical }) {
  const [view, setView] = useState('list')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState({ done: 0, total: 0 }) // 'list' | 'charts'
  const groups = groupByDate(entries)

  const handleExport = (type) => {
    const content = type === 'md' ? onExportMd() : onExportJson()
    const ext = type === 'md' ? 'md' : 'json'
    const mime = type === 'md' ? 'text/markdown' : 'application/json'
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zentalk-journal-${new Date().toISOString().slice(0,10)}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleAnalyze = async () => {
    if (analyzing || !analyzeHistorical) return
    const pending = entries.filter(e => !e.quadrant && (e.scene || e.feeling || e.reflection || e.raw))
    if (pending.length === 0) return
    setAnalyzing(true)
    setAnalyzeProgress({ done: 0, total: pending.length })
    await analyzeHistorical((done, total) => setAnalyzeProgress({ done, total }))
    setAnalyzing(false)
    setAnalyzeProgress({ done: 0, total: 0 })
  }

  return (
    <div className="journal-page">
      {!isLoggedIn && (
        <div className="journal-login-banner">
          <span>日记仅保存在本地</span>
          <button onClick={onLoginPrompt}>登录同步云端 →</button>
        </div>
      )}
      {syncing && <div className="journal-syncing">云端同步中…</div>}
      <JournalInput onSave={onSave} saving={saving} />

      {entries.length > 0 && (
        <div className="journal-view-tabs">
          <button className={`view-tab ${view === 'list' ? 'view-tab--active' : ''}`}
            onClick={() => setView('list')}>记录</button>
          <button className={`view-tab ${view === 'charts' ? 'view-tab--active' : ''}`}
            onClick={() => setView('charts')}>图谱</button>
          <div className="journal-export-group">
            <button className="export-btn" onClick={() => handleExport('md')}>MD</button>
            <button className="export-btn" onClick={() => handleExport('json')}>JSON</button>
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="journal-list">
          {entries.length === 0 && (
            <div className="journal-empty">
              <p>此刻，写下第一条记录</p>
              <p className="journal-empty-hint">场景 · 感受 · 体会</p>
            </div>
          )}
          {isLoggedIn && userId && entries.some(e => e.is_public) && (
            <div className="public-blog-link">
              <span>公开文章可在</span>
              <a
                href={`/blog/${userId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                /blog/{userId.slice(0, 8)}…
              </a>
              <span>访问</span>
            </div>
          )}
          {groups.map(([key, dayEntries]) => (
            <div key={key} className="entry-group">
              <div className="entry-group-date">{formatDateGroup(key)}</div>
              {dayEntries.map(e => (
                <EntryCard
                  key={e.id} entry={e}
                  onDelete={onDelete}
                  onTogglePublic={onTogglePublic}
                  isLoggedIn={isLoggedIn}
                  onAddToDeck={onAddToDeck}
                  inDeck={isInDeck(e.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {view === 'charts' && (
        <div className="charts-section">
          {(() => {
            const pending = entries.filter(e => !e.quadrant && (e.scene || e.feeling || e.reflection || e.raw))
            if (pending.length > 0 && !analyzing) return (
              <div className="analyze-banner">
                <span>{pending.length} 条记录尚未四维分析</span>
                <button className="analyze-btn" onClick={handleAnalyze}>
                  分析历史记录 →
                </button>
              </div>
            )
            if (analyzing) return (
              <div className="analyze-progress">
                <div className="analyze-progress-bar"
                  style={{ width: analyzeProgress.total > 0
                    ? (analyzeProgress.done / analyzeProgress.total * 100) + '%'
                    : '0%' }} />
                <span>正在分析 {analyzeProgress.done} / {analyzeProgress.total}…</span>
              </div>
            )
            return null
          })()}
          <JournalCharts entries={entries} />
        </div>
      )}
    </div>
  )
}
