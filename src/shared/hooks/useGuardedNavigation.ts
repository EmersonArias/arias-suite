import { useState } from 'react'
import { useBeforeUnloadGuard } from './useBeforeUnloadGuard'

interface UseGuardedNavigationOptions {
  dirty: boolean
  onNavigate: (path: string) => void
  onSave?: () => Promise<boolean> | boolean
}

export function useGuardedNavigation({
  dirty,
  onNavigate,
  onSave,
}: UseGuardedNavigationOptions) {
  const [pendingNavigation, setPendingNavigation] = useState<
    { type: 'path'; path: string } | { type: 'back' } | null
  >(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useBeforeUnloadGuard(dirty)

  function requestNavigation(path: string) {
    if (!dirty) {
      onNavigate(path)
      return
    }

    setPendingNavigation({ type: 'path', path })
    setDialogOpen(true)
  }

  function requestBackNavigation() {
    if (!dirty) {
      onNavigate('__HISTORY_BACK__')
      return
    }

    setPendingNavigation({ type: 'back' })
    setDialogOpen(true)
  }

  function cancelNavigation() {
    setDialogOpen(false)
    setPendingNavigation(null)
  }

  function executeNavigation(navigation: { type: 'path'; path: string } | { type: 'back' }) {
    if (navigation.type === 'back') {
      onNavigate('__HISTORY_BACK__')
      return
    }

    onNavigate(navigation.path)
  }

  function discardNavigation() {
    const navigation = pendingNavigation
    setDialogOpen(false)
    setPendingNavigation(null)
    if (navigation) executeNavigation(navigation)
  }

  async function saveAndNavigate() {
    if (!pendingNavigation || !onSave) return

    setSaving(true)
    try {
      const saved = await onSave()
      if (!saved) return

      const navigation = pendingNavigation
      setDialogOpen(false)
      setPendingNavigation(null)
      executeNavigation(navigation)
    } finally {
      setSaving(false)
    }
  }

  return {
    requestNavigation,
    requestBackNavigation,
    cancelNavigation,
    discardNavigation,
    saveAndNavigate,
    dialogOpen,
    saving,
  }
}
