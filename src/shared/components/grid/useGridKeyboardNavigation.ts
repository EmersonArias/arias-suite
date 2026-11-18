import { useCallback, useEffect, useMemo, useRef } from 'react'

interface UseGridKeyboardNavigationOptions {
  ids: string[]
  selectedId: string | null
  onSelectedIdChange: (id: string) => void
  onOpen?: (id: string) => void
  autoFocusFirst?: boolean
}

export function useGridKeyboardNavigation({
  ids,
  selectedId,
  onSelectedIdChange,
  onOpen,
  autoFocusFirst = true,
}: UseGridKeyboardNavigationOptions) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  // A responsive screen can render both a desktop table and a mobile list.
  // Keep each view's refs separately so a hidden row can never mask the visible one.
  const rowRefs = useRef<Record<string, Record<string, HTMLElement | null>>>({})
  const rowRefCallbacks = useRef<Record<string, Record<string, (row: HTMLElement | null) => void>>>({})
  const hasAutoFocusedRef = useRef(false)

  const selectedIndex = useMemo(() => {
    if (!selectedId) return 0
    const index = ids.indexOf(selectedId)
    return index >= 0 ? index : 0
  }, [ids, selectedId])

  const getRowRef = useCallback((id: string, viewKey: string) => {
    if (!rowRefCallbacks.current[viewKey]) {
      rowRefCallbacks.current[viewKey] = {}
    }

    if (!rowRefCallbacks.current[viewKey][id]) {
      rowRefCallbacks.current[viewKey][id] = (row) => {
        if (!rowRefs.current[viewKey]) {
          rowRefs.current[viewKey] = {}
        }
        rowRefs.current[viewKey][id] = row
      }
    }

    return rowRefCallbacks.current[viewKey][id]
  }, [])

  const scrollRowIntoView = useCallback((id: string) => {
    const row = Object.values(rowRefs.current)
      .map((viewRows) => viewRows[id])
      .find((candidate): candidate is HTMLElement =>
        !!candidate && candidate.getClientRects().length > 0,
      )

    if (!row) return

    row.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [])

  const moveSelection = useCallback(
    (nextIndex: number) => {
      if (ids.length === 0) return

      const boundedIndex = Math.max(
        0,
        Math.min(nextIndex, ids.length - 1),
      )

      onSelectedIdChange(ids[boundedIndex])
    },
    [ids, onSelectedIdChange],
  )

  useEffect(() => {
    if (ids.length === 0) return

    const targetId =
      selectedId && ids.includes(selectedId)
        ? selectedId
        : ids[0]

    if (targetId !== selectedId) {
      onSelectedIdChange(targetId)
      return
    }

    const frame = window.requestAnimationFrame(() => {
      scrollRowIntoView(targetId)

      const gridElement = gridRef.current
      const gridIsVisible = !!gridElement && gridElement.getClientRects().length > 0

      if (autoFocusFirst && !hasAutoFocusedRef.current && gridIsVisible && gridElement) {
        hasAutoFocusedRef.current = true

        const activeElement = document.activeElement
        const isEditingText =
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement instanceof HTMLSelectElement

        if (!isEditingText) {
          gridElement.focus({ preventScroll: true })
        }
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    autoFocusFirst,
    ids,
    onSelectedIdChange,
    scrollRowIntoView,
    selectedId,
  ])

  const handleGridKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(selectedIndex + 1)
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(selectedIndex - 1)
        return
      }

      if (event.key === 'Home') {
        event.preventDefault()
        moveSelection(0)
        return
      }

      if (event.key === 'End') {
        event.preventDefault()
        moveSelection(ids.length - 1)
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const id = ids[selectedIndex]
        if (id) onOpen?.(id)
      }
    },
    [ids, moveSelection, onOpen, selectedIndex],
  )

  function getGridProps() {
    return {
      ref: gridRef,
      tabIndex: 0,
      role: 'grid',
      'aria-activedescendant': selectedId ? `grid-row-${selectedId}` : undefined,
      onKeyDown: handleGridKeyDown,
      onFocus: () => {
        if (ids.length > 0 && !selectedId) {
          onSelectedIdChange(ids[0])
        }
      },
    }
  }

  function getRowProps(id: string, viewKey = 'default') {
    return {
      ref: getRowRef(id, viewKey),
      id: viewKey === 'default' ? `grid-row-${id}` : `grid-row-${viewKey}-${id}`,
      role: 'row',
      'aria-selected': id === selectedId,
    }
  }

  return {
    currentIndex: selectedIndex,
    moveSelection,
    getGridProps,
    getRowProps,
  }
}
