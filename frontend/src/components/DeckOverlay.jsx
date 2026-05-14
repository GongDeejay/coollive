import { useState, useEffect } from 'react'
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

// ── Slide thumbnail in left panel ─────────────────────────────────
function SlideThumbnail({ item, index, isSelected, onClick, onMoveUp, onMoveDown, onRemove, isFirst, isLast }) {
  const id = getItemId(item)

  if (item.kind === 'entry') {
    const preview = item.entry.summary || item.entry.reflection || item.entry.raw || item.entry.scene || ''
    return (
      <div className={`slide-thumb ${isSelected ? 'slide-thumb--selected' : ''}`} onClick={onClick}>
        <span className="slide-thumb-num">{index + 1}</span>
        <div className="slide-thumb-body">
          <span className="slide-thumb-type">{ENTRY_SLIDE_TYPES.find(t => t.value === item.slideType)?.label}</span>
          <p className="slide-thumb-preview">{preview.slice(0, 36)}{preview.length > 36 ? '…' : ''}</p>
          <span className="slide-thumb-date">{formatDate(item.entry.created_at)}</span>
        </div>
        <div className="slide-thumb-actions">
          <button onClick={e => { e.stopPropagation(); onMoveUp() }} disabled={isFirst} title="上移">↑</button>
          <button onClick={e => { e.stopPropagation(); onMoveDown() }} disabled={isLast} title="下移">↓</button>
          <button onClick={e => { e.stopPropagation(); onRemove(id) }} title="移除" className="slide-thumb-del">✕</button>
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
        <button onClick={e => { e.stopPropagation(); onRemove(id) }} title="移除" className="slide-thumb-del">✕</button>
      </div>
    </div>
  )
}

// ── Right panel: slide editor ──────────────────────────────────────
function SlideEditor({ item, deckItems, onChangeType, onUpdateSpecial }) {
  if (!item) return <div className="slide-editor-empty"><p>选择左侧幻灯片进行编辑</p></div>

  if (item.kind === 'entry') {
    const entry = item.entry
    const preview = [
      entry.scene && `场景：${entry.scene}`,
      entry.feeling && `感受：${entry.feeling}`,
      entry.reflection && `体会：${entry.reflection}`,
      !entry.scene && entry.raw,
    ].filter(Boolean).join('\n')
    return (
      <div className="slide-editor">
        <div className="slide-editor-section">
          <label className="slide-editor-label">页面类型</label>
          <div className="slide-type-btns">
            {ENTRY_SLIDE_TYPES.map(t => (
              <button
                key={t.value}
                className={`slide-type-btn ${item.slideType === t.value ? 'slide-type-btn--active' : ''}`}
                onClick={() => onChangeType(entry.id, t.value)}
              >
                {t.label}
              </button>
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

  // Special slide editor
  return (
    <div className="slide-editor">
      <div className="slide-editor-section">
        <label className="slide-editor-label">类型</label>
        <span className="slide-editor-meta">{SPECIAL_LABELS[item.kind]?.label}</span>
      </div>

      {item.kind === 'toc' && (
        <div className="slide-editor-section">
          <p className="slide-editor-info">目录页将自动列出所有条目页的摘要，共 {deckItems.filter(i => i.kind === 'entry').length} 条</p>
        </div>
      )}

      {(item.kind === 'divider' || item.kind === 'end') && (
        <>
          <div className="slide-editor-section">
            <label className="slide-editor-label">{item.kind === 'end' ? '结束语' : '标题'}</label>
            <input
              className="slide-editor-input"
              value={item.text || ''}
              onChange={e => onUpdateSpecial(item._id, { text: e.target.value })}
              placeholder={item.kind === 'end' ? '谢谢' : '章节标题'}
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
function DeckPlayer({ html, onClose }) {
  return (
    <div className="deck-player-wrap">
      <button className="deck-player-close" onClick={onClose}>✕ 关闭预览</button>
      <iframe className="deck-player-frame" srcDoc={html} title="演示预览" sandbox="allow-scripts" />
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
}) {
  const [title, setTitle]         = useState('我的演示')
  const [subtitle, setSubtitle]   = useState('')
  const [selectedIdx, setSelectedIdx] = useState(null)
  const [preview, setPreview]     = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [showLibrary, setShowLibrary] = useState(false)
  const [savedMsg, setSavedMsg]   = useState('')

  // Keyboard ESC
  useEffect(() => {
    const handler = e => {
      if (e.key === 'Escape') {
        if (preview) setPreview(false)
        else if (showLibrary) setShowLibrary(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, preview, showLibrary])

  const selectedItem = selectedIdx !== null ? deckItems[selectedIdx] : null

  const handlePreview = () => {
    const html = generateDeckHtml({ title, subtitle, items: deckItems })
    setPreviewHtml(html)
    setPreview(true)
  }

  const handleDownload = () => downloadDeck({ title, subtitle, items: deckItems })

  const handleSave = () => {
    onSaveDeck(title, subtitle)
    setSavedMsg('已保存')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  const handleLoadDeck = (deckId) => {
    const meta = onLoadDeck(deckId)
    if (meta) {
      setTitle(meta.title)
      setSubtitle(meta.subtitle)
    }
    setShowLibrary(false)
    setSelectedIdx(null)
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

  return (
    <div className="deck-overlay">
      <div className="deck-editor">

        {/* ── Top bar ── */}
        <div className="deck-editor-topbar">
          <button className="deck-back-btn" onClick={onClose} title="返回">← 返回</button>
          <div className="deck-title-area">
            <input className="deck-title-main" value={title} onChange={e => setTitle(e.target.value)} placeholder="演示标题" />
            <input className="deck-subtitle-main" value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="副标题" />
          </div>
          <div className="deck-topbar-actions">
            <button className="deck-tb-btn" onClick={() => setShowLibrary(v => !v)} title="演示库">
              📂 库{savedDecks.length > 0 ? `(${savedDecks.length})` : ''}
            </button>
            <button className="deck-tb-btn" onClick={handleSave}>
              {savedMsg || '保存'}
            </button>
            <button className="deck-tb-btn deck-tb-btn--preview" onClick={handlePreview} disabled={deckItems.length === 0}>
              ▶ 预览
            </button>
            <button className="deck-tb-btn deck-tb-btn--download" onClick={handleDownload} disabled={deckItems.length === 0}>
              ⬇ 下载
            </button>
          </div>
        </div>

        {/* ── Insert special slide bar ── */}
        <div className="deck-insert-bar">
          <span className="deck-insert-label">插入：</span>
          {Object.entries(SPECIAL_LABELS).map(([kind, meta]) => (
            <button key={kind} className="deck-insert-btn"
              onClick={() => addSpecialSlide(kind, selectedIdx ?? deckItems.length - 1)}
              title={`插入${meta.label}`}>
              {meta.icon} {meta.label}
            </button>
          ))}
          <span className="deck-insert-hint">· 也可从随手记页面「演示」按钮加入条目</span>
        </div>

        {/* ── Body ── */}
        <div className="deck-editor-body">

          {/* Library sidebar */}
          {showLibrary && (
            <DeckLibrary
              savedDecks={savedDecks}
              onLoad={handleLoadDeck}
              onDelete={onDeleteSavedDeck}
              onClose={() => setShowLibrary(false)}
            />
          )}

          {/* Left: slide list */}
          <div className="deck-slide-list">
            {/* Auto cover preview */}
            {!deckItems.some(i => i.kind === 'cover') && (
              <div className="slide-thumb slide-thumb--auto">
                <span className="slide-thumb-num slide-thumb-icon">◈</span>
                <div className="slide-thumb-body">
                  <span className="slide-thumb-type">封面（自动）</span>
                  <p className="slide-thumb-preview">{title}</p>
                </div>
              </div>
            )}

            {deckItems.length === 0 && (
              <div className="deck-list-empty">
                <p>点击上方按钮插入特殊页</p>
                <p>或从随手记加入条目</p>
              </div>
            )}

            {deckItems.map((item, i) => (
              <SlideThumbnail
                key={getItemId(item)}
                item={item}
                index={i + 1}
                isSelected={selectedIdx === i}
                onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                onMoveUp={() => moveUp(i)}
                onMoveDown={() => moveDown(i)}
                onRemove={onRemove}
                isFirst={i === 0}
                isLast={i === deckItems.length - 1}
              />
            ))}
          </div>

          {/* Right: editor */}
          <div className="deck-editor-right">
            <SlideEditor
              item={selectedItem}
              deckItems={deckItems}
              onChangeType={onChangeType}
              onUpdateSpecial={updateSpecialSlide}
            />
          </div>
        </div>

        {/* ── Status bar ── */}
        <div className="deck-status-bar">
          <span>共 {deckItems.length + (deckItems.some(i => i.kind === 'cover') ? 0 : 1)} 页</span>
          {selectedItem && <span>· 已选第 {selectedIdx + 2} 页</span>}
        </div>
      </div>
    </div>
  )
}
