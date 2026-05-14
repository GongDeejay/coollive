/**
 * Generates a fully self-contained HTML presentation file.
 * Open the file in any browser → full-screen deck player.
 * Arrow keys / Space to navigate, F for fullscreen, P to print.
 */

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(isoStr) {
  const d = new Date(isoStr)
  return `${d.getFullYear()} · ${d.getMonth() + 1}月${d.getDate()}日`
}

// ── Slide HTML generators ──────────────────────────────────────────

function slideCover(title, subtitle) {
  return `
    <div class="slide slide-cover" data-type="cover">
      <div class="cover-inner">
        <div class="cover-logo">
          <div class="logo-circle"></div>
          <span>ZenTalk</span>
        </div>
        <h1 class="cover-title">${escapeHtml(title || '演示')}</h1>
        ${subtitle ? `<p class="cover-sub">${escapeHtml(subtitle)}</p>` : ''}
      </div>
    </div>`
}

function slideQuote({ entry }) {
  const text = entry.summary || entry.reflection || entry.raw || ''
  const date = formatDate(entry.created_at)
  return `
    <div class="slide slide-quote" data-type="quote">
      <div class="quote-inner">
        <blockquote class="quote-text">${escapeHtml(text)}</blockquote>
        <span class="quote-date">${date}</span>
      </div>
    </div>`
}

function slideContent({ entry }) {
  const rows = [
    { label: '场景', value: entry.scene },
    { label: '感受', value: entry.feeling },
    { label: '体会', value: entry.reflection },
  ].filter(r => r.value)

  const date = formatDate(entry.created_at)
  return `
    <div class="slide slide-content" data-type="content">
      <div class="content-inner">
        ${entry.summary ? `<p class="content-headline">${escapeHtml(entry.summary)}</p>` : ''}
        <div class="content-fields">
          ${rows.map(r => `
            <div class="content-row">
              <span class="content-label">${r.label}</span>
              <p class="content-value">${escapeHtml(r.value)}</p>
            </div>`).join('')}
        </div>
        <span class="content-date">${date}</span>
      </div>
    </div>`
}

function slideKeywords({ entry }) {
  const keywords = entry.tags?.keywords || []
  const title = entry.summary || entry.reflection || ''
  const date = formatDate(entry.created_at)
  return `
    <div class="slide slide-keywords" data-type="keywords">
      <div class="kw-inner">
        ${title ? `<p class="kw-title">${escapeHtml(title)}</p>` : ''}
        <ul class="kw-list">
          ${keywords.map(k => `<li class="kw-item">${escapeHtml(k)}</li>`).join('\n          ')}
        </ul>
        <span class="kw-date">${date}</span>
      </div>
    </div>`
}

// ── Special slide generators ───────────────────────────────────────

function slideDivider(item) {
  return `
    <div class="slide slide-divider" data-type="divider">
      <div class="divider-inner">
        <div class="divider-line"></div>
        <h2 class="divider-title">${escapeHtml(item.text || '章节')}</h2>
        ${item.subtitle ? `<p class="divider-sub">${escapeHtml(item.subtitle)}</p>` : ''}
        <div class="divider-line"></div>
      </div>
    </div>`
}

function slideEnd(item) {
  return `
    <div class="slide slide-end" data-type="end">
      <div class="end-inner">
        <div class="end-logo">
          <div class="logo-circle"></div>
        </div>
        <h1 class="end-text">${escapeHtml(item.text || '谢谢')}</h1>
        ${item.subtitle ? `<p class="end-sub">${escapeHtml(item.subtitle)}</p>` : ''}
      </div>
    </div>`
}

function slideToc(allItems, deckTitle) {
  const entryItems = allItems.filter(i => i.kind === 'entry')
  const rows = entryItems.map((item, idx) => {
    const label = item.entry.summary || item.entry.reflection || item.entry.scene || item.entry.raw || ''
    return `<li class="toc-item"><span class="toc-num">${idx + 1}</span><span class="toc-label">${escapeHtml(label.slice(0, 50))}</span></li>`
  }).join('\n        ')
  return `
    <div class="slide slide-toc" data-type="toc">
      <div class="toc-inner">
        <h2 class="toc-heading">目录</h2>
        <ul class="toc-list">
        ${rows}
        </ul>
      </div>
    </div>`
}

function buildSlideHtml(item, allItems) {
  if (item.kind === 'special' || !item.kind || item.kind === 'entry') {
    if (!item.kind || item.kind === 'entry') {
      switch (item.slideType) {
        case 'quote':    return slideQuote(item)
        case 'content':  return slideContent(item)
        case 'keywords': return slideKeywords(item)
        default:         return slideQuote(item)
      }
    }
  }
  switch (item.kind) {
    case 'entry':   {
      switch (item.slideType) {
        case 'content':  return slideContent(item)
        case 'keywords': return slideKeywords(item)
        default:         return slideQuote(item)
      }
    }
    case 'divider': return slideDivider(item)
    case 'end':     return slideEnd(item)
    case 'toc':     return slideToc(allItems)
    case 'cover':   return slideCover(item.text || item._deckTitle || '', item.subtitle || item._deckSubtitle || '')
    default:        return slideQuote({ entry: { summary: '', created_at: new Date().toISOString() } })
  }
}

// ── Full HTML template ─────────────────────────────────────────────

export function generateDeckHtml({ title, subtitle, items }) {
  // Check if user manually added a cover or end slide
  const hasCover = items.some(i => i.kind === 'cover')
  const hasEnd   = items.some(i => i.kind === 'end')

  const allSlides = [
    ...(hasCover ? [] : [slideCover(title, subtitle)]),
    ...items.map(item => buildSlideHtml(item, items)),
  ].join('\n')

  const total = items.length + (hasCover ? 0 : 1)
  const slidesHtml = allSlides

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title || '演示')}</title>
<style>
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0f0f0f;
  --surface: #1a1a1a;
  --border: #2e2e2e;
  --text: #e8e0d5;
  --dim: #8a8078;
  --accent: #c4a882;
  --serif: 'Georgia', 'Noto Serif SC', 'STSong', serif;
  --sans: 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}

html, body {
  width: 100%; height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  overflow: hidden;
  user-select: none;
}

/* ── Deck container ── */
#deck {
  width: 100vw; height: 100vh;
  position: relative;
  overflow: hidden;
}

/* ── Slides ── */
.slide {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  opacity: 0;
  transform: translateX(60px);
  transition: opacity 0.4s ease, transform 0.4s ease;
  pointer-events: none;
}

.slide.active {
  opacity: 1;
  transform: translateX(0);
  pointer-events: all;
}

.slide.exit-left {
  opacity: 0;
  transform: translateX(-60px);
}

/* ── Divider ── */
.slide-divider { background: var(--bg); }
.divider-inner { text-align: center; max-width: 600px; }
.divider-line {
  width: 40px; height: 1px;
  background: var(--accent);
  margin: 20px auto;
  opacity: 0.5;
}
.divider-title {
  font-family: var(--serif);
  font-size: clamp(24px, 4vw, 48px);
  font-weight: 400;
  color: var(--text);
  letter-spacing: 0.06em;
}
.divider-sub {
  margin-top: 12px;
  font-size: clamp(13px, 1.8vw, 18px);
  color: var(--dim);
  letter-spacing: 0.04em;
}

/* ── End page ── */
.slide-end { background: var(--bg); }
.end-inner { text-align: center; max-width: 500px; }
.end-logo {
  margin-bottom: 28px;
}
.end-text {
  font-family: var(--serif);
  font-size: clamp(28px, 5vw, 56px);
  font-weight: 400;
  color: var(--text);
  letter-spacing: 0.04em;
}
.end-sub {
  margin-top: 16px;
  font-size: clamp(12px, 1.8vw, 18px);
  color: var(--dim);
}

/* ── TOC ── */
.slide-toc { background: var(--bg); }
.toc-inner { max-width: 640px; width: 100%; }
.toc-heading {
  font-family: var(--serif);
  font-size: clamp(14px, 2vw, 22px);
  font-weight: 300;
  color: var(--dim);
  letter-spacing: 0.12em;
  margin-bottom: 28px;
  text-transform: uppercase;
}
.toc-list { list-style: none; }
.toc-item {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.toc-num {
  font-size: clamp(11px, 1.4vw, 14px);
  color: var(--accent);
  opacity: 0.7;
  min-width: 20px;
  font-variant-numeric: tabular-nums;
}
.toc-label {
  font-family: var(--serif);
  font-size: clamp(14px, 2vw, 20px);
  color: var(--text);
  opacity: 0.85;
  line-height: 1.4;
}

/* ── Cover ── */
.slide-cover { background: var(--bg); }
.cover-inner { text-align: center; max-width: 700px; }
.cover-logo {
  display: flex; align-items: center; justify-content: center;
  gap: 10px; margin-bottom: 36px;
  font-size: 14px; color: var(--accent);
  letter-spacing: 0.1em;
}
.logo-circle {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  position: relative;
}
.logo-circle::after {
  content: '';
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 6px; height: 6px;
  border-radius: 50%; background: var(--accent);
}
.cover-title {
  font-family: var(--serif);
  font-size: clamp(28px, 5vw, 54px);
  font-weight: 400;
  line-height: 1.3;
  color: var(--text);
  letter-spacing: 0.04em;
  margin-bottom: 16px;
}
.cover-sub {
  font-size: clamp(13px, 2vw, 18px);
  color: var(--dim);
  font-weight: 300;
  letter-spacing: 0.06em;
}

/* ── Quote ── */
.slide-quote { background: var(--bg); }
.quote-inner { max-width: 680px; text-align: center; }
.quote-text {
  font-family: var(--serif);
  font-size: clamp(20px, 3.5vw, 40px);
  font-weight: 400;
  line-height: 1.7;
  color: var(--text);
  letter-spacing: 0.04em;
  position: relative;
  padding: 0 20px;
}
.quote-text::before {
  content: '「';
  position: absolute; left: -4px; top: -8px;
  font-size: 0.7em; color: var(--accent); opacity: 0.5;
}
.quote-text::after {
  content: '」';
  font-size: 0.7em; color: var(--accent); opacity: 0.5;
}
.quote-date {
  display: block; margin-top: 28px;
  font-size: 12px; color: var(--dim); opacity: 0.5;
  letter-spacing: 0.08em;
}

/* ── Content ── */
.slide-content { background: var(--bg); }
.content-inner { max-width: 700px; width: 100%; }
.content-headline {
  font-family: var(--serif);
  font-size: clamp(16px, 2.5vw, 26px);
  font-weight: 400;
  color: var(--accent);
  margin-bottom: 32px;
  letter-spacing: 0.03em;
  line-height: 1.5;
}
.content-fields { display: flex; flex-direction: column; gap: 20px; }
.content-row { display: flex; gap: 20px; align-items: flex-start; }
.content-label {
  font-size: 11px; color: var(--dim); opacity: 0.5;
  width: 36px; flex-shrink: 0;
  padding-top: 4px; letter-spacing: 0.06em;
}
.content-value {
  font-family: var(--serif);
  font-size: clamp(15px, 2.2vw, 22px);
  line-height: 1.75;
  color: var(--text);
}
.content-date {
  display: block; margin-top: 32px;
  font-size: 11px; color: var(--dim); opacity: 0.4;
  letter-spacing: 0.08em;
}

/* ── Keywords ── */
.slide-keywords { background: var(--bg); }
.kw-inner { max-width: 640px; width: 100%; }
.kw-title {
  font-family: var(--serif);
  font-size: clamp(15px, 2.2vw, 24px);
  color: var(--dim);
  margin-bottom: 36px;
  line-height: 1.5;
  letter-spacing: 0.02em;
}
.kw-list { list-style: none; display: flex; flex-direction: column; gap: 16px; }
.kw-item {
  font-family: var(--serif);
  font-size: clamp(18px, 3vw, 36px);
  font-weight: 400;
  color: var(--text);
  letter-spacing: 0.04em;
  padding-left: 20px;
  position: relative;
  opacity: 0;
  transform: translateX(16px);
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.kw-item::before {
  content: '·';
  position: absolute; left: 0;
  color: var(--accent);
}
.slide.active .kw-item { opacity: 1; transform: translateX(0); }
.slide.active .kw-item:nth-child(1) { transition-delay: 0.15s; }
.slide.active .kw-item:nth-child(2) { transition-delay: 0.3s; }
.slide.active .kw-item:nth-child(3) { transition-delay: 0.45s; }
.slide.active .kw-item:nth-child(4) { transition-delay: 0.6s; }
.slide.active .kw-item:nth-child(5) { transition-delay: 0.75s; }
.kw-date {
  display: block; margin-top: 32px;
  font-size: 11px; color: var(--dim); opacity: 0.4;
  letter-spacing: 0.08em;
}

/* ── Controls ── */
#controls {
  position: fixed; bottom: 28px; left: 0; right: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 16px; z-index: 100;
  opacity: 0; transition: opacity 0.3s;
}
#deck:hover #controls { opacity: 1; }

.ctrl-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--dim); font-size: 18px;
  width: 40px; height: 40px;
  border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; backdrop-filter: blur(4px);
}
.ctrl-btn:hover { color: var(--text); border-color: var(--accent); }

#progress {
  font-size: 12px; color: var(--dim);
  opacity: 0.5; letter-spacing: 0.06em;
  min-width: 48px; text-align: center;
}

/* ── Download / Fullscreen button (top-right corner) ── */
#corner-btns {
  position: fixed; top: 20px; right: 20px;
  display: flex; gap: 8px;
  z-index: 100; opacity: 0; transition: opacity 0.3s;
}
#deck:hover #corner-btns { opacity: 1; }
.corner-btn {
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--dim); font-size: 13px;
  padding: 5px 12px; border-radius: 14px;
  cursor: pointer; font-family: var(--sans);
  backdrop-filter: blur(4px); transition: all 0.15s;
}
.corner-btn:hover { color: var(--accent); border-color: var(--accent); }

/* ── Print mode (each slide = one page) ── */
@media print {
  html, body { overflow: visible; }
  #deck { width: 100%; height: auto; overflow: visible; }
  #controls, #corner-btns { display: none !important; }
  .slide {
    position: relative !important;
    opacity: 1 !important; transform: none !important;
    width: 100%; height: 100vh;
    page-break-after: always;
    pointer-events: none;
  }
  .kw-item { opacity: 1 !important; transform: none !important; }
}

/* ── Mobile adjustments ── */
@media (max-width: 600px) {
  .slide { padding: 32px 24px; }
}
</style>
</head>
<body>
<div id="deck">
${slidesHtml}

  <div id="corner-btns">
    <button class="corner-btn" onclick="toggleFullscreen()">⛶ 全屏</button>
    <button class="corner-btn" onclick="window.print()">⎙ 打印/PDF</button>
  </div>

  <div id="controls">
    <button class="ctrl-btn" onclick="prevSlide()" title="上一页">&#8592;</button>
    <span id="progress">1 / ${total}</span>
    <button class="ctrl-btn" onclick="nextSlide()" title="下一页">&#8594;</button>
  </div>
</div>

<script>
const slides = document.querySelectorAll('.slide');
const progressEl = document.getElementById('progress');
let cur = 0;

function show(idx) {
  const prev = cur;
  cur = Math.max(0, Math.min(slides.length - 1, idx));
  slides[prev].classList.remove('active');
  slides[prev].classList.add('exit-left');
  setTimeout(() => slides[prev].classList.remove('exit-left'), 400);
  slides[cur].classList.add('active');
  progressEl.textContent = (cur + 1) + ' / ${total}';
}

function nextSlide() { if (cur < slides.length - 1) show(cur + 1); }
function prevSlide() { if (cur > 0) show(cur - 1); }

// Init first slide
slides[0].classList.add('active');

// Keyboard
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); nextSlide(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevSlide(); }
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});

// Touch swipe
let touchX = 0;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
document.addEventListener('touchend', e => {
  const diff = touchX - e.changedTouches[0].clientX;
  if (Math.abs(diff) > 40) diff > 0 ? nextSlide() : prevSlide();
});

// Fullscreen
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

// postMessage from parent (overlay keyboard relay)
window.addEventListener('message', e => {
  if (e.data === 'next') nextSlide();
  if (e.data === 'prev') prevSlide();
});
</script>
</body>
</html>`
}

export function downloadDeck({ title, subtitle, items }) {
  const html = generateDeckHtml({ title, subtitle, items })
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = (title || 'zentalk-deck').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '-')
  a.href = url
  a.download = `${safe}.html`
  a.click()
  URL.revokeObjectURL(url)
}
