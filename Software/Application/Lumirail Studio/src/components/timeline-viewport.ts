export const FINEST_GRID_STEP_MS = 1000

export function msToPx(ms: number, pxPerMs: number): number {
  return ms * pxPerMs
}

export function snapToFinestGrid(ms: number, durationMs: number): number {
  const step = FINEST_GRID_STEP_MS
  const snapped = Math.round(ms / step) * step
  return Math.max(0, Math.min(durationMs, snapped))
}

export function pxToMs(px: number, pxPerMs: number): number {
  return pxPerMs > 0 ? px / pxPerMs : 0
}

export interface TimelineTick {
  ms: number
  label: string
  simulatedH: number
  major: boolean
}

export function projectMsToSimulatedH(ms: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return (ms / durationMs) * 24
}

export function formatSimulatedH(simulatedH: number): string {
  const h = Math.floor(simulatedH)
  const m = Math.round((simulatedH - h) * 60)
  if (h === 0 && m === 0) return '0h00'
  if (h === 24 && m === 0) return '24h00'
  const mStr = String(m).padStart(2, '0')
  return m === 0 ? `${h}h00` : `${h}h${mStr}`
}

export function formatDurationMs(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    return mm === 0 ? `${h}h` : `${h}h${String(mm).padStart(2, '0')}`
  }
  if (m > 0) return s === 0 ? `${m}m` : `${m}m${String(s).padStart(2, '0')}`
  return `${s}s`
}

export function formatDurationMsPrecise(ms: number): string {
  if (ms >= 60000) return formatDurationMs(ms)
  if (ms >= 1000) {
    const s = Math.floor(ms / 1000)
    const frac = Math.round((ms % 1000) / 100)
    return frac === 0 ? `${s}s` : `${s}.${frac}s`
  }
  return `${(ms / 1000).toFixed(1)}s`
}

export function durationMsToSimulatedH(durationMs: number, projectDurationMs: number): number {
  if (projectDurationMs <= 0) return 0
  return (durationMs / projectDurationMs) * 24
}

export function simulatedMinutesToMs(simulatedMinutes: number, projectDurationMs: number): number {
  if (projectDurationMs <= 0) return 0
  return (simulatedMinutes / 1440) * projectDurationMs
}

export function msToSimulatedMinutes(ms: number, projectDurationMs: number): number {
  if (projectDurationMs <= 0) return 0
  return (ms / projectDurationMs) * 1440
}

const GRID_MIN_SPACING_PX = 16
const LABEL_MIN_SPACING_PX = 56

function computeProjectStepMs(
  durationMs: number,
  pxPerMs: number,
  viewportWidthPx: number,
  minSpacingPx: number
): number {
  const visibleDurationMs = viewportWidthPx / pxPerMs
  let baseStepMs: number
  if (visibleDurationMs >= 5 * 60000) baseStepMs = 60 * 1000
  else if (visibleDurationMs >= 2 * 60000) baseStepMs = 30 * 1000
  else if (visibleDurationMs >= 60000) baseStepMs = 15 * 1000
  else baseStepMs = 1000
  const stepPx = baseStepMs * pxPerMs
  const mult = stepPx < minSpacingPx ? Math.ceil(minSpacingPx / stepPx) : 1
  return baseStepMs * mult
}

export interface TicksResult {
  gridTicks: { ms: number; major: boolean }[]
  labelTicks: { ms: number; label: string; major: boolean }[]
}

export function computeTicks(
  durationMs: number,
  pxPerMs: number,
  viewportWidthPx: number
): TicksResult {
  const gridStepMs = computeProjectStepMs(durationMs, pxPerMs, viewportWidthPx, GRID_MIN_SPACING_PX)
  const labelStepMs = computeProjectStepMs(durationMs, pxPerMs, viewportWidthPx, LABEL_MIN_SPACING_PX)
  const gridTicks: { ms: number; major: boolean }[] = []
  const labelTicks: { ms: number; label: string; major: boolean }[] = []
  const visibleDurationMs = viewportWidthPx / pxPerMs
  let labelFn: (ms: number) => string
  if (visibleDurationMs >= 5 * 60000) labelFn = (ms) => `${Math.floor(ms / 60000)}m`
  else if (visibleDurationMs >= 2 * 60000)
    labelFn = (ms) => {
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      return s === 0 ? `${m}m` : `${m}m${s}`
    }
  else if (visibleDurationMs >= 60000)
    labelFn = (ms) => {
      const m = Math.floor(ms / 60000)
      const s = Math.floor((ms % 60000) / 1000)
      return m > 0 ? `${m}m${s}` : `${s}s`
    }
  else labelFn = (ms) => `${Math.floor(ms / 1000)}s`

  for (let ms = 0; ms <= durationMs; ms += gridStepMs) {
    const major = gridStepMs >= 60000 || ms % (5 * 60000) === 0
    gridTicks.push({ ms, major })
  }
  for (let ms = 0; ms <= durationMs; ms += labelStepMs) {
    const major = labelStepMs >= 60000 || ms % (5 * 60000) === 0
    labelTicks.push({ ms, label: labelFn(ms), major })
  }
  return { gridTicks, labelTicks }
}

const SIMULATED_GRID_MIN_SPACING_PX = 12
const SIMULATED_LABEL_MIN_SPACING_PX = 48

function formatSimulatedLabel(h: number): string {
  if (h <= 0) return '0h00'
  if (h >= 24) return '24h00'
  const hours = Math.floor(h)
  const mins = Math.round((h - hours) * 60)
  return mins === 0 ? `${hours}h00` : `${hours}h${String(mins).padStart(2, '0')}`
}

const SIMULATED_STEPS: { stepMin: number; label: (h: number) => string }[] = [
  { stepMin: 1, label: formatSimulatedLabel },
  { stepMin: 5, label: formatSimulatedLabel },
  { stepMin: 10, label: formatSimulatedLabel },
  { stepMin: 15, label: formatSimulatedLabel },
  { stepMin: 30, label: formatSimulatedLabel },
  { stepMin: 60, label: formatSimulatedLabel },
  { stepMin: 180, label: formatSimulatedLabel },
]

function pickSimulatedStep(
  durationMs: number,
  pxPerMs: number,
  minSpacingPx: number
): number {
  let stepMin = 180
  for (const { stepMin: s } of SIMULATED_STEPS) {
    const stepMs = (s / 60 / 24) * durationMs
    const stepPx = stepMs * pxPerMs
    if (stepPx >= minSpacingPx) {
      stepMin = s
      break
    }
  }
  return stepMin
}

export interface SimulatedTicksResult {
  gridTicks: { ms: number; major: boolean }[]
  labelTicks: { ms: number; label: string; major: boolean }[]
}

export function computeSimulatedTicks(
  durationMs: number,
  pxPerMs: number,
  viewportWidthPx: number,
  stepMinOverride?: number | null
): SimulatedTicksResult {
  if (durationMs <= 0) return { gridTicks: [], labelTicks: [] }
  const gridStepMin =
    stepMinOverride != null ? stepMinOverride : pickSimulatedStep(durationMs, pxPerMs, SIMULATED_GRID_MIN_SPACING_PX)
  const labelStepMin =
    stepMinOverride != null ? stepMinOverride : pickSimulatedStep(durationMs, pxPerMs, SIMULATED_LABEL_MIN_SPACING_PX)
  const labelFn = SIMULATED_STEPS.find((x) => x.stepMin === labelStepMin)?.label ?? ((h: number) => `${h}h`)
  const gridTicks: { ms: number; major: boolean }[] = []
  const labelTicks: { ms: number; label: string; major: boolean }[] = []

  for (let simulatedMin = 0; simulatedMin <= 24 * 60; simulatedMin += gridStepMin) {
    const ms = (simulatedMin / (24 * 60)) * durationMs
    if (ms > durationMs) break
    const major = gridStepMin >= 60 || simulatedMin % 60 === 0
    gridTicks.push({ ms, major })
  }
  for (let simulatedMin = 0; simulatedMin <= 24 * 60; simulatedMin += labelStepMin) {
    const h = simulatedMin / 60
    const ms = (simulatedMin / (24 * 60)) * durationMs
    if (ms > durationMs) break
    const label = labelFn(h)
    const major = labelStepMin >= 60 || simulatedMin % 60 === 0
    labelTicks.push({ ms, label, major })
  }
  return { gridTicks, labelTicks }
}

export const ZOOM_LEVEL_MIN = 0.25
export const ZOOM_LEVEL_MAX = 20
export const ZOOM_STEP = 1.25

export function clampZoomLevel(level: number): number {
  return Math.max(ZOOM_LEVEL_MIN, Math.min(ZOOM_LEVEL_MAX, level))
}

export function fitZoom(containerWidthPx: number, durationMs: number): number {
  if (durationMs <= 0) return 0.001
  return containerWidthPx / durationMs
}

export function pxPerMsFromZoomLevel(
  containerWidthPx: number,
  durationMs: number,
  zoomLevel: number
): number {
  return fitZoom(containerWidthPx, durationMs) * clampZoomLevel(zoomLevel)
}
