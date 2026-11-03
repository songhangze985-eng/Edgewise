import { useEffect } from 'react'

/**
 * Space → toggle mic; Ctrl/Cmd+Enter → submit. Respects enabled flag from settings.
 */
export function useRoomKeyboardShortcuts({
  enabled,
  onToggleMic,
  onSubmit,
  canToggleMic,
  canSubmit,
}) {
  useEffect(() => {
    if (!enabled) return undefined

    const onKeyDown = (e) => {
      if (e.defaultPrevented) return
      if (e.nativeEvent.isComposing) return

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (canSubmit?.()) {
          e.preventDefault()
          onSubmit?.()
        }
        return
      }

      if (e.key !== ' ' && e.code !== 'Space') return
      if (e.shiftKey) return

      const tag = e.target?.tagName
      const isTextEntry = tag === 'TEXTAREA' || tag === 'INPUT'
      if (isTextEntry) {
        e.preventDefault()
      }

      if (canToggleMic?.()) {
        e.preventDefault()
        onToggleMic?.()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onToggleMic, onSubmit, canToggleMic, canSubmit])
}
