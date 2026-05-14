import { useState, useEffect, useCallback } from 'react'
import { downloadDeck, generateDeckHtml } from '../utils/deckGenerator'
import './DeckOverlay.css'

const SLIDE_TYPES = [
  { value: 'quote',    label: '金句' },
  { value: 'content',  label: '内容' },
  { value: 'keywords', label: '关键词' },
]

function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()}`
}

// ── Slide preview thumbnail ────────────────────────────────────────
function SlideThumbnail({ item, index, onRemove, onChangeType, onMoveUp, onMoveDown, isFirst, isLast }) {
  const { entry, slideType } = item
  const preview = entry.summary || entry.reflection || entry.raw || entry.scene || ''

  return (
    <div className="deck-thumb">
      <div className="deck-thumb-num">{index + 1}</div>
      <div className="deck-thumb-card">
        <div className={`deck-thumb-preview deck-thumb--${slideType}`}>
          <span className="deck-thumb-type-icon">
            {slideType === 'quote' ? '「」' : slideType === 'content' ? '≡' : '•••'}
          </span>
          <p className="deck-thumb-text">{preview.slice(0, 40)}{preview.length > 40 ? '…' : ''}</p>
          <span className="deck-thumb-date">{formatDate(entry.created_at)}</span>
        </div>
        <div className="deck-thumb-controls">
          <select
            className="deck-type-select"
            value={slideType}
            onChange={e => onChangeType(entry.id, e.target.value)}
          >
            {SLIDE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="deck-thumb-arrows">
            <button onClick={onMoveUp} disabled={isFirst} title="上移">↑</button>
            <button onClick={onMoveDown} disabled={isLast} title="下移">↓</button>
          </div>
          <button className="deck-thumb-remove" onClick={() => onRemove(entry.id)} title="移除">✕</button>
        </div>
      </div>
    </div>
  )
}

// ── In-app preview player ──────────────────────────────────────────
function DeckPlayer({ html, onClose }) {
  return (
    <div className="deck-player-wrap">
      <button className="deck-player-close" onClick={onClose}>✕ 关闭预览</button>
      <iframe
        className="deck-player-frame"
        srcDoc={html}
        title="演示预览"
        sandbox="allow-scripts"
      />
    </div>
  )
}

// ── Main overlay ───────────────────────────────────────────────────
export default function DeckOverlay({ deckItems, onRemove, onChangeType, onReorder, onClose }) {
  const [title, setTitle]       = useState('我的演示')
  const [subtitle, setSubtitle] = useState('')
  const [preview, setPreview]   = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  // Keyboard ESC to close
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape' && !preview) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, preview])

  const handleDownload = () => {
    downloadDeck({ title, subtitle, items: deckItems })
  }

  const handlePreview = () => {
    const html = generateDeckHtml({ title, subtitle, items: deckItems })
    setPreviewHtml(html)
    setPreview(true)
  }

  const moveUp   = i => { if (i > 0) onReorder(i, i - 1) }
  const moveDown = i => { if (i < deckItems.length - 1) onReorder(i, i + 1) }

  if (preview) {
    return (
      <div className="deck-overlay">
        <DeckPlayer html={previewHtml} onClose={() => setPreview(false)} />
      </div>
    )
  }

  return (
    <div className="deck-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="deck-panel">
        {/* Header */}
        <div className="deck-panel-header">
          <div className="deck-panel-title-group">
            <span className="deck-panel-icon">◻</span>
            <span className="deck-panel-heading">演示编排</span>
            <span className="deck-panel-count">{deckItems.length} 张</span>
          </div>
          <button className="deck-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Presentation title */}
        <div className="deck-meta">
          <input
            className="deck-title-input"
            placeholder="演示标题"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <input
            className="deck-subtitle-input"
            placeholder="副标题（可选）"
            value={subtitle}
            onChange={e => setSubtitle(e.target.value)}
          />
        </div>

        {/* Slides list */}
        <div className="deck-slides-list">
          {deckItems.length === 0 && (
            <div className="deck-empty">
              <p>从随手记页面选择条目</p>
              <p className="deck-empty-hint">点击条目右下角的「演示」按钮加入</p>
            </div>
          )}

          {/* Cover slide preview */}
          {deckItems.length > 0 && (
            <div className="deck-thumb deck-thumb--cover">
              <div className="deck-thumb-num">封</div>
              <div className="deck-thumb-card">
                <div className="deck-thumb-preview deck-thumb--covercard">
                  <p className="deck-thumb-text">{title || '演示标题'}</p>
                  {subtitle && <span className="deck-thumb-date">{subtitle}</span>}
                </div>
              </div>
            </div>
          )}

          {deckItems.map((item, i) => (
            <SlideThumbnail
              key={item.entry.id}
              item={item} index={i}
              onRemove={onRemove}
              onChangeType={onChangeType}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
              isFirst={i === 0}
              isLast={i === deckItems.length - 1}
            />
          ))}
        </div>

        {/* Footer actions */}
        {deckItems.length > 0 && (
          <div className="deck-panel-footer">
            <button className="deck-btn deck-btn--preview" onClick={handlePreview}>
              ▶ 预览
            </button>
            <button className="deck-btn deck-btn--download" onClick={handleDownload}>
              ⬇ 下载 HTML
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
