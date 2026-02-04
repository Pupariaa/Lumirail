import type { IntentionKind, IntentionParams } from '../data/types'
import type { LucideIcon } from 'lucide-react'
import { Zap, ZapOff, Shuffle, Sparkles, Sun, Moon, ArrowDown, ArrowUp, Activity } from 'lucide-react'

export interface IntentionDef {
  kind: IntentionKind
  label: string
  description: string
  icon: LucideIcon
  type: 'on' | 'off' | 'effect'
  requiresPwm?: boolean
  params?: { key: keyof IntentionParams; label: string; min: number; max: number; step: number; unit: string; default: number }[]
}

export const INTENTION_DEFS: IntentionDef[] = [
  {
    kind: 'always_on',
    label: 'Toujours allumé',
    description: 'Rest allumé pendant toute la durée',
    icon: Zap,
    type: 'on',
  },
  {
    kind: 'always_off',
    label: 'Toujours éteint',
    description: 'Rest éteint pendant toute la durée',
    icon: ZapOff,
    type: 'off',
  },
  {
    kind: 'random_off',
    label: 'Allumé avec coupures aléatoires',
    description: 'Allumé la plupart du temps, s\'éteint brièvement de façon aléatoire',
    icon: Shuffle,
    type: 'on',
    params: [
      { key: 'chance', label: 'Probabilité', min: 1, max: 30, step: 1, unit: '%', default: 5 },
      { key: 'rateMs', label: 'Durée coupure', min: 100, max: 120000, step: 100, unit: 'dur', default: 2000 },
    ],
  },
  {
    kind: 'random_on',
    label: 'Éteint avec allumages aléatoires',
    description: 'Éteint la plupart du temps, s\'allume brièvement de façon aléatoire',
    icon: Sparkles,
    type: 'off',
    params: [
      { key: 'chance', label: 'Probabilité', min: 1, max: 30, step: 1, unit: '%', default: 5 },
      { key: 'rateMs', label: 'Durée allumage', min: 100, max: 120000, step: 100, unit: 'dur', default: 2000 },
    ],
  },
  {
    kind: 'blink',
    label: 'Clignotement',
    description: 'Alterne allumé/éteint à intervalle régulier',
    icon: Sun,
    type: 'effect',
    params: [
      { key: 'rateMs', label: 'Période', min: 100, max: 600000, step: 100, unit: 'dur', default: 2000 },
    ],
  },
  {
    kind: 'breathe',
    label: 'Respiration',
    description: 'Variation douce d\'intensité (effet fade cyclique)',
    icon: Activity,
    type: 'effect',
    requiresPwm: true,
    params: [
      { key: 'periodMs', label: 'Période', min: 100, max: 60000, step: 100, unit: 'dur', default: 3000 },
      { key: 'intensity', label: 'Intensité min', min: 10, max: 90, step: 5, unit: '%', default: 20 },
    ],
  },
  {
    kind: 'flicker',
    label: 'Vacillement',
    description: 'Fluctuation rapide type bougie ou néon défaillant',
    icon: Sparkles,
    type: 'effect',
    requiresPwm: true,
    params: [
      { key: 'rateMs', label: 'Vitesse', min: 100, max: 5000, step: 100, unit: 'dur', default: 400 },
      { key: 'chance', label: 'Variation', min: 10, max: 80, step: 5, unit: '%', default: 40 },
    ],
  },
  {
    kind: 'fade_in',
    label: 'Allumage progressif',
    description: 'Passe progressivement de l\'éteint à l\'allumé',
    icon: ArrowUp,
    type: 'effect',
    requiresPwm: true,
    params: [
      { key: 'periodMs', label: 'Durée montée', min: 100, max: 60000, step: 100, unit: 'dur', default: 2000 },
    ],
  },
  {
    kind: 'fade_out',
    label: 'Extinction progressive',
    description: 'Passe progressivement de l\'allumé à l\'éteint',
    icon: ArrowDown,
    type: 'effect',
    requiresPwm: true,
    params: [
      { key: 'periodMs', label: 'Durée descente', min: 100, max: 60000, step: 100, unit: 'dur', default: 2000 },
    ],
  },
  {
    kind: 'fade_in_out',
    label: 'Allumage et extinction progressifs',
    description: 'Montée puis descente en douceur sur toute la durée',
    icon: Moon,
    type: 'effect',
    requiresPwm: true,
    params: [
      { key: 'intensity', label: 'Intensité max', min: 50, max: 100, step: 5, unit: '%', default: 100 },
    ],
  },
]

export function getIntentionDef(kind: IntentionKind | undefined): IntentionDef | undefined {
  if (!kind) return undefined
  return INTENTION_DEFS.find((d) => d.kind === kind)
}

export function blockToIntentionKind(block: { type: string; effectKind?: IntentionKind }): IntentionKind {
  if (block.effectKind) return block.effectKind
  if (block.type === 'on') return 'always_on'
  if (block.type === 'off') return 'always_off'
  return 'blink'
}

export function intentionKindToType(kind: IntentionKind): 'on' | 'off' | 'effect' {
  const def = getIntentionDef(kind)
  return def?.type ?? 'effect'
}

export function getDefaultParams(kind: IntentionKind): IntentionParams {
  const def = getIntentionDef(kind)
  if (!def?.params) return {}
  const params: IntentionParams = {}
  for (const p of def.params) {
    params[p.key] = p.default
  }
  return params
}
