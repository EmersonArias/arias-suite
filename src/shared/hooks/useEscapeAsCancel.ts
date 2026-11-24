import { useEffect } from 'react'

interface UseEscapeAsCancelOptions {
  enabled: boolean
  onCancel: () => void
}

export function useEscapeAsCancel({
  enabled,
  onCancel,
}: UseEscapeAsCancelOptions) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onCancel])
}
