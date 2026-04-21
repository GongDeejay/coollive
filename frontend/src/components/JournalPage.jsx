import { useState, useRef, useCallback } from 'react'
import JournalCharts from './JournalCharts'
import './JournalPage.css'

const TEMPLATE_FIELDS = [
  { key: 'scene',      placeholder: '当时的场景……' },
  { key: 'feeling',    placeholder: '当时的感受……' },
  { key: 'reflection', placeholder: '现在的体会……' },
]

const EMOTION_COLOR = {
  焦虑: '#c4855a', 平静: '#6a9b8a', 顿悟: '#c4a882',
  喜悦: '#8aaf6a', 低落: '#7a7a9a', 愤怒: '#9a5a5a',
  困惑: '#8a7a5a', 感恩: '#7a9a6a', 空: '#6a6a6a',
}

const ENERGY_COLOR = { 高能: '#6a9b6a', 低谷: '#9a5a5a', 平稳: '#8a8a6a' }

function TagPill({ label, type }) {
  const color = type === 'emotion' ? EMOTION_COLOR[label]
    : type === 'energy' ? ENERGY_COLOR[label]
    : undefined
  return (
    <span className="tag-pill" style={color ? { borderColor: color, color } : {}}>
      #{label}
    </span>
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
          {entry.tags && (
            <div className="entry-tags-row">
              {entry.tags.emotion?.map(t => <TagPill key={t} label={t} type="emotion" />)}
              {entry.tags.topic?.slice(0, 2).map(t => <TagPill key={t} label={t} />)}
              <TagPill label={entry.tags.energy} type="energy" />
            </div>
          )}
          {!entry.tags && <span className="entry-tagging">分析中…</span>}
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
              <div className="entry-all-tags">
                {entry.tags.emotion?.map(t => <TagPill key={t} label={t} type="emotion" />)}
                {entry.tags.topic?.map(t => <TagPill key={t} label={t} />)}
                {entry.tags.operation?.map(t => <TagPill key={t} label={t} />)}
                <TagPill label={entry.tags.timeview} />
                <TagPill label={entry.tags.energy} type="energy" />
              </div>
              {entry.tags.keywords?.length > 0 && (
                <div className="entry-keywords">
                  {entry.tags.keywords.map(k => (
                    <span key={k} className="keyword-chip">{k}</span>
                  ))}
                </div>
              )}
            </>
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

export default function JournalPage({ onSave, saving, syncing, entries, onDelete, onTogglePublic, onExportMd, onExportJson, isLoggedIn, userId, onLoginPrompt, onAddToDeck, isInDeck }) {
  const [view, setView] = useState('list') // 'list' | 'charts'
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
        <JournalCharts entries={entries} />
      )}
    </div>
  )
}
