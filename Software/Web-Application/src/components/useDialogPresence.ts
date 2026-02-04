import { useEffect, useMemo, useState } from 'react'

export type DialogPresenceState = 'open' | 'closing'

export function useDialogPresence(open: boolean, durationMs = 160): { present: boolean; state: DialogPresenceState } {
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const actualDuration = prefersReducedMotion ? 0 : durationMs
  const [present, setPresent] = useState(open)
  const [state, setState] = useState<DialogPresenceState>(open ? 'open' : 'closing')

  useEffect(() => {
    if (open) {
      setPresent(true)
      setState('open')
      return
    }
    if (!present) return
    setState('closing')
    if (actualDuration <= 0) {
      setPresent(false)
      return
    }
    const t = window.setTimeout(() => setPresent(false), actualDuration)
    return () => window.clearTimeout(t)
  }, [open, present, actualDuration])

  return { present, state }
}

