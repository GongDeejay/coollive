import { useState, useCallback } from 'react'

const LIBRARY_KEY = 'zentalk_decks_v1'

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY)) || [] } catch { return [] }
}
function saveLibrary(decks) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(decks))
}

/**
 * deckItems is an array of slide descriptors:
 *   Entry slide:   { kind: 'entry', entry, slideType: 'quote'|'content'|'keywords' }
 *   Special slides: { kind: 'cover' | 'end' | 'divider' | 'toc', text?, subtitle? }
 *
 * Special slides 'cover' and 'end' are optional — the generator always
 * inserts a cover from the deck title, but the user can also insert extra ones.
 */
export function useDeck() {
  const [deckItems, setDeckItems] = useState([])
  const [deckOpen, setDeckOpen]   = useState(false)
  const [savedDecks, setSavedDecks] = useState(() => loadLibrary())

  // ── Entry slides ───────────────────────────────────────────────────
  const addToDeck = useCallback((entry) => {
    setDeckItems(prev => {
      if (prev.some(i => i.kind === 'entry' && i.entry.id === entry.id)) return prev
      return [...prev, { kind: 'entry', entry, slideType: suggestSlideType(entry) }]
    })
  }, [])

  const removeFromDeck = useCallback((itemId) => {
    setDeckItems(prev => prev.filter(i => {
      if (i.kind === 'entry') return i.entry.id !== itemId
      return i._id !== itemId
    }))
  }, [])

  const changeSlideType = useCallback((entryId, slideType) => {
    setDeckItems(prev => prev.map(i =>
      i.kind === 'entry' && i.entry.id === entryId ? { ...i, slideType } : i
    ))
  }, [])

  const isInDeck = useCallback((entryId) =>
    deckItems.some(i => i.kind === 'entry' && i.entry.id === entryId)
  , [deckItems])

  // ── Special slides ─────────────────────────────────────────────────
  const addSpecialSlide = useCallback((kind, insertAfterIdx = -1) => {
    const slide = {
      _id: `special-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      text: kind === 'end' ? '谢谢' : kind === 'divider' ? '章节标题' : '',
      subtitle: '',
    }
    setDeckItems(prev => {
      const arr = [...prev]
      const pos = insertAfterIdx >= 0 ? insertAfterIdx + 1 : arr.length
      arr.splice(pos, 0, slide)
      return arr
    })
  }, [])

  const updateSpecialSlide = useCallback((slideId, fields) => {
    setDeckItems(prev => prev.map(i =>
      i._id === slideId ? { ...i, ...fields } : i
    ))
  }, [])

  // ── Ordering ───────────────────────────────────────────────────────
  const reorder = useCallback((fromIdx, toIdx) => {
    setDeckItems(prev => {
      const arr = [...prev]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
  }, [])

  // ── Deck library ───────────────────────────────────────────────────
  const saveDeck = useCallback((title, subtitle) => {
    const deck = {
      id: `deck-${Date.now()}`,
      title: title || '未命名演示',
      subtitle: subtitle || '',
      items: deckItems,
      createdAt: new Date().toISOString(),
      slideCount: deckItems.length + 1, // +1 for auto cover
    }
    setSavedDecks(prev => {
      const next = [deck, ...prev].slice(0, 30)
      saveLibrary(next)
      return next
    })
    return deck.id
  }, [deckItems])

  const loadDeck = useCallback((deckId) => {
    const deck = savedDecks.find(d => d.id === deckId)
    if (!deck) return
    setDeckItems(deck.items)
    return { title: deck.title, subtitle: deck.subtitle }
  }, [savedDecks])

  const deleteSavedDeck = useCallback((deckId) => {
    setSavedDecks(prev => {
      const next = prev.filter(d => d.id !== deckId)
      saveLibrary(next)
      return next
    })
  }, [])

  const clearDeck = useCallback(() => {
    setDeckItems([])
    setDeckOpen(false)
  }, [])

  return {
    deckItems, deckOpen, setDeckOpen,
    addToDeck, removeFromDeck, changeSlideType, reorder,
    addSpecialSlide, updateSpecialSlide,
    clearDeck, isInDeck,
    savedDecks, saveDeck, loadDeck, deleteSavedDeck,
  }
}

// ── Helpers ────────────────────────────────────────────────────────
function suggestSlideType(entry) {
  if (entry.tags?.keywords?.length >= 3) return 'keywords'
  if (entry.scene || entry.feeling || entry.reflection) return 'content'
  return 'quote'
}

export function getItemId(item) {
  return item.kind === 'entry' ? item.entry.id : item._id
}
