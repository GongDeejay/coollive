import { useState, useEffect, useRef } from 'react'
import { downloadDeck, generateDeckHtml } from '../utils/deckGenerator'
import { getItemId } from '../hooks/useDeck'
import './DeckOverlay.css'

const ENTRY_SLIDE_TYPES = [
  { value: 'quote',    label: '金句' },
  { value: 'content',  label: '内容' },
  { value: 'keywords', label: '关键词' },
]

const SPECIAL_LABELS = {
  cover:   { icon: '◈', label: '封面页' },
  toc:     { icon: '≡', label: '目录页' },
  divider: { icon: '─', label: '分隔页' },
  end:     { icon: '◉', label: '结束页' },
}

function formatDate(iso) {
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()}`
}

// ── Slide thumbnail ────────────────────────────────────────────────
function SlideThumbnail({ item, index, isSelected, onClick, onMoveUp, onMoveDown, onRemove, isFirst, isLast }) {
  const id = getItemId(item)

  if (item.kind === 'entry') {
    const preview = item.entry.summary || item.entry.reflection || item.entry.raw || item.entry.scene || ''
    return (
      <div className={`slide-thumb ${isSelected ? 'slide-thumb--selected' : ''}`} onClick={onClick}>
        <span className="slide-thumb-num">{index}</span>
        <div className="slide-thumb-body">
          <span className="slide-thumb-type">{ENTRY_SLIDE_TYPES.find(t => t.value === item.slideType)?.label}</span>
          <p className="slide-thumb-preview">{preview.slice(0, 36)}{preview.length > 36 ? '…' : ''}</p>
          <span className="slide-thumb-date">{formatDate(item.entry.created_at)}</span>
        </div>
        <div className="slide-thumb-actions">
          <button onClick={e => { e.stopPropagation(); onMoveUp() }} disabled={isFirst} title="上移">↑</button>
          <button onClick={e => { e.stopPropagation(); onMoveDown() }} disabled={isLast} title="下移">↓</button>
          <button onClick={e => { e.stopPropagation(); onRemove(id) }} className="slide-thumb-del" title="移除">✕</button>
        </div>
      </div>
    )
  }

  const meta = SPECIAL_LABELS[item.kind] || { icon: '?', label: item.kind }
  return (
    <div className={`slide-thumb slide-thumb--special ${isSelected ? 'slide-thumb--selected' : ''}`} onClick={onClick}>
      <span className="slide-thumb-num slide-thumb-icon">{meta.icon}</span>
      <div className="slide-thumb-body">
        <span className="slide-thumb-type">{meta.label}</span>
        {item.text && <p className="slide-thumb-preview">{item.text.slice(0, 30)}</p>}
      </div>
      <div className="slide-thumb-actions">
        <button onClick={e => { e.stopPropagation(); onMoveUp() }} disabled={isFirst} title="上移">↑</button>
        <button onClick={e => { e.stopPropagation(); onMoveDown() }} disabled={isLast} title="下移">↓</button>
        <button onClick={e => { e.stopPropagation(); onRemove(id) }} className="slide-thumb-del" title="移除">✕</button>
      </div>
    </div>
  )
}

// ── Right panel: slide editor ──────────────────────────────────────
// selectedIdx === 'cover-auto' → editing the auto cover (deck title/subtitle)
function SlideEditor({ selectedIdx, item, deckItems, title, subtitle, onChangeTitle, onChangeSubtitle, onChangeType, onUpdateSpecial }) {
  if (selectedIdx === 'cover-auto') {
    return (
      <div className="slide-editor">
        <div className="slide-editor-section">
          <label className="slide-editor-label">封面标题</label>
          <input
            className="slide-editor-input"
            value={title}
            onChange={e => onChangeTitle(e.target.value)}
            placeholder="演示标题"
          />
        </div>
        <div className="slide-editor-section">
          <label className="slide-editor-label">封面副标题</label>
          <input
            className="slide-editor-input"
            value={subtitle}
            onChange={e => onChangeSubtitle(e.target.value)}
            placeholder="副标题（可选）"
          />
        </div>
        <div className="slide-editor-section">
          <p className="slide-editor-info">此封面由演示标题自动生成。顶部标题栏同步更新。</p>
        </div>
      </div>
    )
  }

  if (!item) return <div className="slide-editor-empty"><p>选择左侧幻灯片进行编辑</p></div>

  if (item.kind === 'entry') {
    const entry = item.entry
    const preview = [
      entry.scene    && `场景：${entry.scene}`,
      entry.feeling  && `感受：${entry.feeling}`,
      entry.reflection && `体会：${entry.reflection}`,
      !entry.scene && entry.raw,
    ].filter(Boolean).join('\n')
    return (
      <div className="slide-editor">
        <div className="slide-editor-section">
          <label className="slide-editor-label">页面类型</label>
          <div className="slide-type-btns">
            {ENTRY_SLIDE_TYPES.map(t => (
              <button key={t.value}
                className={`slide-type-btn ${item.slideType === t.value ? 'slide-type-btn--active' : ''}`}
                onClick={() => onChangeType(entry.id, t.value)}
              >{t.label}</button>
            ))}
          </div>
        </div>
        <div className="slide-editor-section">
          <label className="slide-editor-label">内容预览</label>
          <div className="slide-editor-preview">{preview || entry.summary || '（无内容）'}</div>
          {entry.summary && <div className="slide-editor-summary">摘要：{entry.summary}</div>}
        </div>
        <div className="slide-editor-section">
          <label className="slide-editor-label">日期</label>
          <span className="slide-editor-meta">{new Date(entry.created_at).toLocaleString('zh-CN')}</span>
        </div>
      </div>
    )
  }

  // Special slides: cover / divider / end / toc
  return (
    <div className="slide-editor">
      <div className="slide-editor-section">
        <label className="slide-editor-label">类型</label>
        <span className="slide-editor-meta">{SPECIAL_LABELS[item.kind]?.label}</span>
      </div>
      {item.kind === 'toc' && (
        <div className="slide-editor-section">
          <p className="slide-editor-info">目录页自动列出所有条目页摘要，共 {deckItems.filter(i => i.kind === 'entry').length} 条</p>
        </div>
      )}
      {(item.kind === 'cover' || item.kind === 'divider' || item.kind === 'end') && (
        <>
          <div className="slide-editor-section">
            <label className="slide-editor-label">
              {item.kind === 'cover' ? '标题（留空则使用演示标题）' : item.kind === 'end' ? '结束语' : '章节标题'}
            </label>
            <input
              className="slide-editor-input"
              value={item.text || ''}
              onChange={e => onUpdateSpecial(item._id, { text: e.target.value })}
              placeholder={item.kind === 'cover' ? title : item.kind === 'end' ? '谢谢' : '章节标题'}
            />
          </div>
          <div className="slide-editor-section">
            <label className="slide-editor-label">副标题（可选）</label>
            <input
              className="slide-editor-input"
              value={item.subtitle || ''}
              onChange={e => onUpdateSpecial(item._id, { subtitle: e.target.value })}
              placeholder="副标题"
            />
          </div>
        </>
      )}
    </div>
  )
}

// ── Journal entry picker (insert from notes) ───────────────────────
function JournalPicker({ entries, deckItems, onAdd, onClose }) {
  const alreadyIn = new Set(deckItems.filter(i => i.kind === 'entry').map(i => i.entry.id))
  const available = entries.filter(e => !alreadyIn.has(e.id))

  return (
    <div className="journal-picker">
      <div className="journal-picker-header">
        <span className="journal-picker-title">从随手记选择</span>
        <button className="deck-close-btn" onClick={onClose}>✕</button>
      </div>
      {available.length === 0 ? (
        <div className="journal-picker-empty">
          <p>所有条目都已加入演示</p>
        </div>
      ) : (
        <ul className="journal-picker-list">
          {available.map(e => {
            const preview = e.summary || e.reflection || e.scene || e.raw || ''
            const d = new Date(e.created_at)
            return (
              <li key={e.id} className="journal-picker-item" onClick={() => onAdd(e)}>
                <div className="journal-picker-date">{d.getMonth()+1}/{d.getDate()}</div>
                <div className="journal-picker-body">
                  <p className="journal-picker-preview">{preview.slice(0, 60)}{preview.length > 60 ? '…' : ''}</p>
                  {e.tags?.emotion?.length > 0 && (
                    <span className="journal-picker-tag">{e.tags.emotion[0]}</span>
                  )}
                </div>
                <span className="journal-picker-add">+</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Deck library panel ─────────────────────────────────────────────
function DeckLibrary({ savedDecks, onLoad, onDelete, onClose }) {
  return (
    <div className="deck-library">
      <div className="deck-library-header">
        <span className="deck-library-title">演示库</span>
        <button className="deck-close-btn" onClick={onClose}>✕</button>
      </div>
      {savedDecks.length === 0 ? (
        <div className="deck-library-empty">
          <p>暂无已保存的演示</p>
          <p className="deck-library-hint">编排完成后点「保存」即可存入库中</p>
        </div>
      ) : (
        <ul className="deck-library-list">
          {savedDecks.map(deck => (
            <li key={deck.id} className="deck-library-item">
              <div className="deck-library-info">
                <span className="deck-library-name">{deck.title}</span>
                <span className="deck-library-meta">
                  {deck.slideCount} 页 · {new Date(deck.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <div className="deck-library-btns">
                <button onClick={() => onLoad(deck.id)}>载入</button>
                <button className="deck-library-del" onClick={() => onDelete(deck.id)}>删</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── In-app preview player ──────────────────────────────────────────
// Fix: auto-focus iframe + overlay-level keyboard handler via postMessage
function DeckPlayer({ html, onClose }) {
  const frameRef = useRef(null)

  // Focus iframe on mount so keyboard events reach it
  useEffect(() => {
    const timer = setTimeout(() => frameRef.current?.focus(), 200)
    return () => clearTimeout(timer)
  }, [])

  // Overlay-level keyboard handler: relay to iframe via postMessage
  useEffect(() => {
    const handler = e => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        frameRef.current?.contentWindow?.postMessage('next', '*')
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        frameRef.current?.contentWindow?.postMessage('prev', '*')
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="deck-player-wrap">
      <button className="deck-player-close" onClick={onClose}>✕ 关闭预览</button>
      <p className="deck-player-hint">← → 翻页 &nbsp;·&nbsp; ESC 退出</p>
      <iframe
        ref={frameRef}
        className="deck-player-frame"
        srcDoc={html}
        title="演示预览"
        sandbox="allow-scripts"
        tabIndex={0}
      />
    </div>
  )
}

// ── Main overlay ───────────────────────────────────────────────────
export default function DeckOverlay({
  deckItems,
  onRemove, onChangeType, onReorder,
  addSpecialSlide, updateSpecialSlide,
  onClose,
  savedDecks, onSaveDeck, onLoadDeck, onDeleteSavedDeck,
  journalEntries = [],
  addToDeck,
}) {
  const [title, setTitle]       = useState('我的演示')
  const [subtitle, setSubtitle] = useState('')
  // selectedIdx: number | 'cover-auto' | null
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [preview, setPreview]   = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [showPicker, setShowPicker]   = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') {
        if (preview) setPreview(false)
        else if (showLibrary) setShowLibrary(false)
        else if (showPicker) setShowPicker(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, preview, showLibrary, showPicker])

  const selectedItem = typeof selectedIdx === 'number' && selectedIdx !== null ? deckItems[selectedIdx] : null

  const handlePreview = () => {
    const html = generateDeckHtml({ title, subtitle, items: deckItems })
    setPreviewHtml(html)
    setPreview(true)
  }

  const handleSave = () => {
    onSaveDeck(title, subtitle)
    setSavedMsg('已保存')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleLoadDeck = (deckId) => {
    const meta = onLoadDeck(deckId)
    if (meta) { setTitle(meta.title); setSubtitle(meta.subtitle) }
    setShowLibrary(false); setSelectedIdx(null)
  }

  const handleAddFromPicker = (entry) => {
    addToDeck(entry)
    // Keep picker open to allow multi-select
  }

  const moveUp   = i => { if (i > 0) { onReorder(i, i - 1); setSelectedIdx(i - 1) } }
  const moveDown = i => { if (i < deckItems.length - 1) { onReorder(i, i + 1); setSelectedIdx(i + 1) } }

  if (preview) {
    return (
      <div className="deck-overlay">
        <DeckPlayer html={previewHtml} onClose={() => setPreview(false)} />
      </div>
    )
  }

  const hasAutoCover = !deckItems.some(i => i.kind === 'cover')

  return (
    <div className="deck-overlay">
      <div className="deck-editor">

        {/* ── Top bar ── */}
        <div className="deck-editor-topbar">
          <button className="deck-back-btn" onClick={onClose}>← 返回</button>
          <div className="deck-title-area">
            <input className="deck-title-main" value={title} onChange={e => setTitle(e.target.value)} placeholder="演示标题" />
            <input className="deck-subtitle-main" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="副标题" />
          </div>
          <div className="deck-topbar-actions">
            <button className="deck-tb-btn" onClick={() => { setShowPicker(v => !v); setShowLibrary(false) }}>
              + 随手记
            </button>
            <button className="deck-tb-btn" onClick={() => { setShowLibrary(v => !v); setShowPicker(false) }}>
              📂 库{savedDecks.length > 0 ? `(${savedDecks.length})` : ''}
            </button>
            <button className="deck-tb-btn" onClick={handleSave}>{savedMsg || '保存'}</button>
            <button className="deck-tb-btn deck-tb-btn--preview" onClick={handlePreview} disabled={deckItems.length === 0}>▶ 预览</button>
            <button className="deck-tb-btn deck-tb-btn--download"
              onClick={() => { const html = generateDeckHtml({ title, subtitle, items: deckItems }); const b = new Blob([html], {type:'text/html'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${title || 'deck'}.html`; a.click() }}
              disabled={deckItems.length === 0}>⬇ 下载</button>
          </div>
        </div>

        {/* ── Insert special slide bar ── */}
        <div className="deck-insert-bar">
          <span className="deck-insert-label">插入特殊页：</span>
          {Object.entries(SPECIAL_LABELS).map(([kind, meta]) => (
            <button key={kind} className="deck-insert-btn"
              onClick={() => addSpecialSlide(kind, typeof selectedIdx === 'number' ? selectedIdx : deckItems.length - 1)}>
              {meta.icon} {meta.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="deck-editor-body">

          {/* Sidebars (absolute, overlay slide list) */}
          {showLibrary && (
            <DeckLibrary savedDecks={savedDecks} onLoad={handleLoadDeck}
              onDelete={onDeleteSavedDeck} onClose={() => setShowLibrary(false)} />
          )}
          {showPicker && (
            <JournalPicker entries={journalEntries} deckItems={deckItems}
              onAdd={handleAddFromPicker} onClose={() => setShowPicker(false)} />
          )}

          {/* Left: slide list */}
          <div className="deck-slide-list">
            {/* Auto cover (always shown when no explicit cover) */}
            {hasAutoCover && (
              <div
                className={`slide-thumb slide-thumb--auto ${selectedIdx === 'cover-auto' ? 'slide-thumb--selected' : ''}`}
                onClick={() => setSelectedIdx(selectedIdx === 'cover-auto' ? null : 'cover-auto')}
                title="点击编辑封面标题"
              >
                <span className="slide-thumb-num slide-thumb-icon">◈</span>
                <div className="slide-thumb-body">
                  <span className="slide-thumb-type">封面（自动）</span>
                  <p className="slide-thumb-preview">{title || '演示标题'}</p>
                </div>
                <span className="slide-thumb-edit-hint">点击编辑</span>
              </div>
            )}

            {deckItems.length === 0 && (
              <div className="deck-list-empty">
                <p>点击上方插入特殊页</p>
                <p>或点「+ 随手记」选条目</p>
              </div>
            )}

            {deckItems.map((item, i) => (
              <SlideThumbnail
                key={getItemId(item)}
                item={item} index={i + (hasAutoCover ? 2 : 1)}
                isSelected={selectedIdx === i}
                onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                onRemove={onRemove}
                isFirst={i === 0} isLast={i === deckItems.length - 1}
              />
            ))}
          </div>

          {/* Right: editor */}
          <div className="deck-editor-right">
            <SlideEditor
              selectedIdx={selectedIdx}
              item={selectedItem}
              deckItems={deckItems}
              title={title} subtitle={subtitle}
              onChangeTitle={setTitle} onChangeSubtitle={setSubtitle}
              onChangeType={onChangeType}
              onUpdateSpecial={updateSpecialSlide}
            />
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className="deck-status-bar">
          <span>共 {deckItems.length + (hasAutoCover ? 1 : 0)} 页</span>
          {typeof selectedIdx === 'number' && selectedItem && (
            <span>· 已选第 {selectedIdx + (hasAutoCover ? 2 : 1)} 页</span>
          )}
          {selectedIdx === 'cover-auto' && <span>· 已选封面页</span>}
        </div>
      </div>
    </div>
  )
}
