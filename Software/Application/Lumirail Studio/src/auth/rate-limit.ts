const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000
const STORAGE_KEY = 'lumirail_login_attempts'

interface AttemptRecord {
  count: number
  lastAttempt: number
  lockedUntil: number | null
}

function getAttemptRecord(): AttemptRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { count: 0, lastAttempt: 0, lockedUntil: null }
    return JSON.parse(raw) as AttemptRecord
  } catch {
    return { count: 0, lastAttempt: 0, lockedUntil: null }
  }
}

function saveAttemptRecord(record: AttemptRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
}

export function checkRateLimit(): { allowed: boolean; error?: string } {
  const record = getAttemptRecord()
  const now = Date.now()

  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now
    const remainingMinutes = Math.ceil(remainingMs / 60000)
    return {
      allowed: false,
      error: `Too many failed attempts. Try again in ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}.`,
    }
  }

  if (record.lockedUntil && now >= record.lockedUntil) {
    saveAttemptRecord({ count: 0, lastAttempt: 0, lockedUntil: null })
  }

  return { allowed: true }
}

export function recordFailedAttempt(): void {
  const record = getAttemptRecord()
  const now = Date.now()
  const newCount = record.count + 1

  if (newCount >= MAX_ATTEMPTS) {
    saveAttemptRecord({
      count: newCount,
      lastAttempt: now,
      lockedUntil: now + LOCKOUT_DURATION_MS,
    })
  } else {
    saveAttemptRecord({
      count: newCount,
      lastAttempt: now,
      lockedUntil: null,
    })
  }
}

export function clearAttempts(): void {
  localStorage.removeItem(STORAGE_KEY)
}
