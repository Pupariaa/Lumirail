import type { TimelineBlock, IntentionParams } from './data/types'

export const FRAME_MS_DEFAULT = 200

function seededRandom(seed: number): number {
  let s = seed
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

function getBlockAtTime(blocks: TimelineBlock[], outputIndex: number, timeMs: number): TimelineBlock | null {
  for (const b of blocks) {
    if ((b.outputIndex ?? 0) !== outputIndex) continue
    if (timeMs >= b.startMs && timeMs < b.startMs + b.durationMs) return b
  }
  return null
}

function evalOnOff(
  block: TimelineBlock,
  timeMs: number,
  p: IntentionParams
): 0 | 1 {
  const kind = block.effectKind ?? (block.type === 'on' ? 'always_on' : block.type === 'off' ? 'always_off' : 'blink')
  const start = block.startMs
  const elapsed = timeMs - start
  const rateMs = Math.max(FRAME_MS_DEFAULT, p.rateMs ?? 1000)
  const periodMs = Math.max(FRAME_MS_DEFAULT, p.periodMs ?? 2000)
  const chance = (p.chance ?? 5) / 100

  switch (kind) {
    case 'always_on':
      return 1
    case 'always_off':
      return 0
    case 'blink': {
      const phase = elapsed % rateMs
      return phase < rateMs / 2 ? 1 : 0
    }
    case 'random_off': {
      const seed = hashString(block.id) + Math.floor(timeMs / rateMs)
      const rng = seededRandom(seed)
      const inCut = rng() < chance
      if (inCut) return 0
      return 1
    }
    case 'random_on': {
      const seed = hashString(block.id) + Math.floor(timeMs / rateMs)
      const rng = seededRandom(seed)
      const inOn = rng() < chance
      return inOn ? 1 : 0
    }
    default:
      return 1
  }
}

function evalPwm(
  block: TimelineBlock,
  timeMs: number,
  p: IntentionParams
): number {
  const kind = block.effectKind ?? (block.type === 'on' ? 'always_on' : block.type === 'off' ? 'always_off' : 'blink')
  const start = block.startMs
  const duration = block.durationMs
  const elapsed = timeMs - start
  const rateMs = Math.max(FRAME_MS_DEFAULT, p.rateMs ?? 1000)
  const periodMs = Math.max(FRAME_MS_DEFAULT, p.periodMs ?? 2000)
  const intensityMin = (p.intensity ?? 20) / 100
  const intensityMax = (p.intensity ?? 100) / 100
  const chancePct = (p.chance ?? 5) / 100

  const clamp = (v: number) => Math.round(Math.max(0, Math.min(255, v)))

  switch (kind) {
    case 'always_on':
      return 255
    case 'always_off':
      return 0
    case 'blink': {
      const phase = elapsed % rateMs
      return phase < rateMs / 2 ? 255 : 0
    }
    case 'random_off': {
      const seed = hashString(block.id) + Math.floor(timeMs / rateMs)
      const rng = seededRandom(seed)
      return rng() < chancePct ? 0 : 255
    }
    case 'random_on': {
      const seed = hashString(block.id) + Math.floor(timeMs / rateMs)
      const rng = seededRandom(seed)
      return rng() < chancePct ? 255 : 0
    }
    case 'breathe': {
      const phase = (elapsed % periodMs) / periodMs
      const sine = 0.5 + 0.5 * Math.sin(2 * Math.PI * phase - Math.PI / 2)
      const val = intensityMin + (1 - intensityMin) * sine
      return clamp(val * 255)
    }
    case 'flicker': {
      const seed = hashString(block.id) + Math.floor(timeMs / rateMs)
      const rng = seededRandom(seed)
      const flickerChance = (p.chance ?? 40) / 100
      const base = 255 * (1 - flickerChance)
      const vary = 255 * flickerChance * rng()
      return clamp(base + vary)
    }
    case 'fade_in': {
      if (elapsed >= periodMs) return 255
      return clamp(255 * (elapsed / periodMs))
    }
    case 'fade_out': {
      if (elapsed >= periodMs) return 0
      return clamp(255 * (1 - elapsed / periodMs))
    }
    case 'fade_in_out': {
      const half = duration / 2
      if (elapsed < half) {
        return clamp(255 * intensityMax * (elapsed / half))
      }
      return clamp(255 * intensityMax * (1 - (elapsed - half) / half))
    }
    default:
      return 255
  }
}

export function generateScene(
  blocks: TimelineBlock[],
  durationMs: number,
  onOffCount: number,
  pwmCount: number,
  frameMs: number = FRAME_MS_DEFAULT
): string[] {
  const frame = Math.max(FRAME_MS_DEFAULT, frameMs)
  const lines: string[] = []
  const numFrames = Math.ceil(durationMs / frame)

  for (let f = 0; f < numFrames; f++) {
    const timeMs = f * frame
    if (timeMs >= durationMs) break
    const frameNum = String(f + 1).padStart(6, '0')
    const values: (number | string)[] = [frameNum]
    for (let i = 0; i < onOffCount; i++) {
      const block = getBlockAtTime(blocks, i, timeMs)
      const p = block?.effectParams ?? {}
      const v = block ? evalOnOff(block, timeMs, p) : 0
      values.push(v)
    }
    for (let i = 0; i < pwmCount; i++) {
      const outputIndex = onOffCount + i
      const block = getBlockAtTime(blocks, outputIndex, timeMs)
      const p = block?.effectParams ?? {}
      const v = block ? evalPwm(block, timeMs, p) : 0
      values.push(v)
    }
    lines.push(values.join('|'))
  }
  return lines
}

export function generateSceneText(
  blocks: TimelineBlock[],
  durationMs: number,
  onOffCount: number,
  pwmCount: number,
  frameMs: number = FRAME_MS_DEFAULT
): string {
  return generateScene(blocks, durationMs, onOffCount, pwmCount, frameMs).join('\n')
}
