import { useState, useRef, useCallback } from 'react'
import JournalCharts from './JournalCharts'
import './JournalPage.css'

// ── Image compression helper ───────────────────────────────────────
function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.floor(img.width  * scale)
        canvas.height = Math.floor(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), width: canvas.width, height: canvas.height })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

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
  const [copied, setCopied] = useState(false)

  const handleCopy = (e) => {
    e.stopPropagation()
    const parts = []
    const d = new Date(entry.created_at)
    parts.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`)
    if (entry.scene)      parts.push(`场景：${entry.scene}`)
    if (entry.feeling)    parts.push(`感受：${entry.feeling}`)
    if (entry.reflection) parts.push(`体会：${entry.reflection}`)
    if (entry.raw && !entry.scene) parts.push(entry.raw)
    if (entry.summary)    parts.push(`—— ${entry.summary}`)
    navigator.clipboard.writeText(parts.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
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
          {entry.images?.length > 0 && (
            <div className="entry-images">
              {entry.images.map(img => (
                <img key={img.id} src={img.dataUrl} className="entry-image-thumb"
                  alt="" loading="lazy" />
              ))}
            </div>
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
              className={`entry-copy-btn ${copied ? 'entry-copy-btn--done' : ''}`}
              onClick={handleCopy}
              title="复制内容"
            >
              {copied ? '已复制' : '复制'}
            </button>
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
  const [images, setImages] = useState([])
  const refs = { scene: useRef(), feeling: useRef(), reflection: useRef(), free: useRef() }
  const uploadRef  = useRef()
  const cameraRef  = useRef()

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

  const handleImageFile = useCallback(async (e, type) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const compressed = await Promise.all(
      files.map(async f => {
        const { dataUrl, width, height } = await compressImage(f)
        return { id: crypto.randomUUID(), dataUrl, type, width, height }
      })
    )
    setImages(prev => [...prev, ...compressed].slice(0, 6))
    e.target.value = ''
  }, [])

  const removeImage = (id) => setImages(prev => prev.filter(img => img.id !== id))

  const handleSave = () => {
    if (isEmpty || saving) return
    if (useTemplate) {
      onSave({ scene: fields.scene, feeling: fields.feeling, reflection: fields.reflection, raw: '', images })
      setFields({ scene: '', feeling: '', reflection: '' })
      Object.values(refs).forEach(r => { if (r.current) r.current.style.height = 'auto' })
    } else {
      onSave({ scene: '', feeling: '', reflection: '', raw: freeText, images })
      setFreeText('')
      if (refs.free.current) refs.free.current.style.height = 'auto'
    }
    setImages([])
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

      {/* Image toolbar */}
      <div className="journal-image-toolbar">
        <input ref={uploadRef} type="file" accept="image/*" multiple
          style={{ display: 'none' }} onChange={e => handleImageFile(e, 'upload')} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }} onChange={e => handleImageFile(e, 'camera')} />
        <button className="img-btn" onClick={() => uploadRef.current?.click()} title="从相册上传">
          🖼 上传图片
        </button>
        <button className="img-btn" onClick={() => cameraRef.current?.click()} title="拍照">
          📷 拍照
        </button>
        {images.length > 0 && (
          <span className="img-count">{images.length} 张</span>
        )}
      </div>

      {images.length > 0 && (
        <div className="journal-image-previews">
          {images.map(img => (
            <div key={img.id} className="img-preview-wrap">
              <img src={img.dataUrl} className="img-preview" alt="" />
              <button className="img-remove" onClick={() => removeImage(img.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="journal-input-footer">
        <span className="journal-hint">⌘+Enter 保存</span>
        <button
          className={`journal-save-btn ${(isEmpty && images.length === 0) ? '' : 'journal-save-btn--active'}`}
          onClick={handleSave}
          disabled={(isEmpty && images.length === 0) || saving}
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
          <span>随手记仅保存在本地</span>
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
