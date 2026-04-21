import { useState, useCallback } from 'react'

/**
 * Manages the "deck cart" — entries queued for a presentation.
 * No persistence needed; cleared when user closes the deck editor.
 */
export function useDeck() {
  const [deckItems, setDeckItems]   = useState([])   // [{entry, slideType}]
  const [deckOpen, setDeckOpen]     = useState(false)

  const addToDeck = useCallback((entry) => {
    setDeckItems(prev => {
      if (prev.some(i => i.entry.id === entry.id)) return prev
      // Auto-suggest slide type
      const type = suggestSlideType(entry)
      return [...prev, { entry, slideType: type }]
    })
  }, [])

  const removeFromDeck = useCallback((entryId) => {
    setDeckItems(prev => prev.filter(i => i.entry.id !== entryId))
  }, [])

  const changeSlideType = useCallback((entryId, slideType) => {
    setDeckItems(prev => prev.map(i =>
      i.entry.id === entryId ? { ...i, slideType } : i
    ))
  }, [])

  const reorder = useCallback((fromIdx, toIdx) => {
    setDeckItems(prev => {
      const arr = [...prev]
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
  }, [])

  const clearDeck = useCallback(() => {
    setDeckItems([])
    setDeckOpen(false)
  }, [])

  const isInDeck = useCallback((entryId) =>
    deckItems.some(i => i.entry.id === entryId)
  , [deckItems])

  return {
    deckItems, deckOpen, setDeckOpen,
    addToDeck, removeFromDeck, changeSlideType, reorder, clearDeck, isInDeck,
  }
}

// ── Auto slide-type suggestion ──────────────────────────────────────
function suggestSlideType(entry) {
  const hasTemplate = entry.scene || entry.feeling || entry.reflection
  const hasKeywords = entry.tags?.keywords?.length > 0
  const summary = entry.summary || ''

  if (hasKeywords && entry.tags?.keywords?.length >= 3) return 'keywords'
  if (hasTemplate) return 'content'
  if (summary.length > 0) return 'quote'
  return 'quote'
}
