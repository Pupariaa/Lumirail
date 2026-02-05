const KEY_SOUNDS = 'lumirail_pref_sounds'
const KEY_TUTORIAL_DISMISSED = 'lumirail_pref_tutorial_dismissed'
const KEY_DEFAULT_PROJECT_DURATION = 'lumirail_pref_default_project_duration'

const DEFAULT_PROJECT_DURATION = 10

export function getSoundsEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const v = window.localStorage.getItem(KEY_SOUNDS)
  if (v === null) return true
  return v === '1'
}

export function setSoundsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY_SOUNDS, enabled ? '1' : '0')
}

export function getTutorialDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(KEY_TUTORIAL_DISMISSED) === '1'
}

export function setTutorialDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY_TUTORIAL_DISMISSED, dismissed ? '1' : '0')
}

export function getDefaultProjectDuration(): number {
  if (typeof window === 'undefined') return DEFAULT_PROJECT_DURATION
  const v = window.localStorage.getItem(KEY_DEFAULT_PROJECT_DURATION)
  if (v === null) return DEFAULT_PROJECT_DURATION
  const n = parseInt(v, 10)
  if (Number.isNaN(n)) return DEFAULT_PROJECT_DURATION
  return Math.max(2, Math.min(30, n))
}

export function setDefaultProjectDuration(minutes: number): void {
  if (typeof window === 'undefined') return
  const clamped = Math.max(2, Math.min(30, Math.round(minutes)))
  window.localStorage.setItem(KEY_DEFAULT_PROJECT_DURATION, String(clamped))
}
