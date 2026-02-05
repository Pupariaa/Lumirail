import { useState, useEffect, useRef } from 'react'
import type { IntentionKind, IntentionParams } from '../data/types'
import { INTENTION_DEFS, getIntentionDef } from './intention-definitions'
import { formatDurationMsPrecise, msToSimulatedMinutes, simulatedMinutesToMs } from './timeline-viewport'
import { useDialogPresence } from './useDialogPresence'

const FIXES: IntentionKind[] = ['always_on', 'always_off']
const DYNAMIQUES: IntentionKind[] = ['random_off', 'random_on', 'blink', 'breathe', 'flicker', 'fade_in', 'fade_out', 'fade_in_out']

export interface SlotResult {
  startMs: number
  durationMs: number
}

interface IntentionPickerDialogProps {
  open: boolean
  mode: 'add' | 'modify'
  trackType?: 'pwm' | 'onoff'
  projectDurationMs?: number
  intentionDurationMs?: number
  initialKind?: IntentionKind
  initialParams?: IntentionParams
  blockIds?: string[]
  getSlotForDuration?: (durationMs: number) => SlotResult
  onConfirm: (kind: IntentionKind, params: IntentionParams, slot?: SlotResult) => void
  onCancel: () => void
}

export function IntentionPickerDialog({
  open,
  mode,
  trackType = 'pwm',
  projectDurationMs = 600000,
  intentionDurationMs: intentionDurationMsProp,
  initialKind = 'always_on',
  initialParams = {},
  blockIds = [],
  getSlotForDuration,
  onConfirm,
  onCancel,
}: IntentionPickerDialogProps) {
  const [selectedKind, setSelectedKind] = useState<IntentionKind>(initialKind)
  const ignoreNextClickRef = useRef(true)
  const [step, setStep] = useState<'pick' | 'params'>('pick')
  const [durationHours, setDurationHours] = useState(0)
  const [durationMinutes, setDurationMinutes] = useState(4)
  const [params, setParams] = useState<IntentionParams>(() => {
    const def = getIntentionDef(initialKind)
    const base: IntentionParams = {}
    def?.params?.forEach((p) => {
      base[p.key] = initialParams[p.key] ?? p.default
    })
    return base
  })
  const initialKindRef = useRef(initialKind)
  const initialParamsRef = useRef(initialParams)
  initialKindRef.current = initialKind
  initialParamsRef.current = initialParams

  useEffect(() => {
    if (open) {
      ignoreNextClickRef.current = true
      const kind = initialKindRef.current
      const ip = initialParamsRef.current
      setSelectedKind(kind)
      const def = getIntentionDef(kind)
      const base: IntentionParams = {}
      def?.params?.forEach((p) => {
        base[p.key] = ip[p.key] ?? p.default
      })
      setParams(base)
      const defForStep = getIntentionDef(kind)
      const hasParamsForStep = defForStep?.params && defForStep.params.length > 0
      setStep(mode === 'modify' ? 'params' : 'pick')
      if (mode === 'add') {
        setDurationHours(0)
        setDurationMinutes(4)
      } else if (intentionDurationMsProp != null && intentionDurationMsProp > 0) {
        const simM = msToSimulatedMinutes(intentionDurationMsProp, projectDurationMs)
        const h = Math.floor(simM / 60)
        const m = Math.round(simM % 60)
        setDurationHours(h)
        setDurationMinutes(m)
      }
    }
  }, [open, mode, intentionDurationMsProp, projectDurationMs])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { ignoreNextClickRef.current = false }, 0)
    return () => clearTimeout(t)
  }, [open])

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  const def = getIntentionDef(selectedKind)
  const hasParams = def?.params && def.params.length > 0

  const handleSelectKind = (kind: IntentionKind) => {
    setSelectedKind(kind)
    const newDef = getIntentionDef(kind)
    const newParams: IntentionParams = {}
    newDef?.params?.forEach((p) => {
      newParams[p.key] = params[p.key] ?? p.default
    })
    setParams(newParams)
    if (mode === 'modify' && newDef?.params && newDef.params.length > 0) setStep('params')
  }


  const currentDurationMinutes = Math.min(1440, Math.max(1, durationHours * 60 + durationMinutes))
  const simDurationMinutes = currentDurationMinutes
  const intentionDurationMsResolved =
    mode === 'modify' && intentionDurationMsProp != null
      ? intentionDurationMsProp
      : simulatedMinutesToMs(currentDurationMinutes, projectDurationMs)

  const slotResult = mode === 'add' && getSlotForDuration
    ? getSlotForDuration(intentionDurationMsResolved)
    : undefined
  const durationFits = !slotResult || slotResult.durationMs >= intentionDurationMsResolved * 0.999
  const actualDurationMs = slotResult?.durationMs ?? intentionDurationMsResolved
  const actualStartMs = slotResult?.startMs ?? 0

  const handleConfirm = () => {
    if (mode === 'add' && step === 'pick' && hasParams) {
      setStep('params')
      return
    }
    const cappedParams = { ...params }
    def?.params?.forEach((p) => {
      if (p.unit === 'dur') {
        const cap = Math.max(p.min, Math.min(p.max, intentionDurationMsResolved))
        const v = cappedParams[p.key] ?? p.default
        if (typeof v === 'number' && v > cap) cappedParams[p.key] = cap
      }
    })
    const slot = mode === 'add' && slotResult ? { startMs: actualStartMs, durationMs: actualDurationMs } : undefined
    onConfirm(selectedKind, cappedParams, slot)
    onCancel()
  }

  const handleBack = () => setStep('pick')
  const handleModifyEffect = () => setStep('pick')

  const showParamsStep = step === 'params' || mode === 'modify'
  const showParamsContent = (mode === 'modify' && step === 'params') || (mode === 'add' && step === 'params')
  const title =
    mode === 'add'
      ? step === 'params'
        ? 'Paramètres'
        : 'Choisir une intention'
      : step === 'params'
        ? 'Paramètres'
        : `Modifier ${blockIds.length} intention${blockIds.length > 1 ? 's' : ''}`

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (ignoreNextClickRef.current) return
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div className="intention-picker-overlay" onClick={handleOverlayClick} onMouseDown={(e) => e.stopPropagation()} data-state={state}>
      <div className="intention-picker-dialog" role="dialog" aria-labelledby="intention-picker-title" onClick={(e) => e.stopPropagation()} data-state={state}>
        <h3 id="intention-picker-title" className="intention-picker-title">
          {title}
        </h3>

        {step === 'pick' && (
          <div className="intention-picker-grid">
            <div className="intention-picker-category">
              <span className="intention-picker-category-label">Fixe</span>
              <div className="intention-picker-options">
                {INTENTION_DEFS.filter((d) => FIXES.includes(d.kind)).map((d) => {
                  const Icon = d.icon
                  const isSelected = selectedKind === d.kind
                  const isDisabled = trackType === 'onoff' && d.requiresPwm
                  return (
                    <button
                      key={d.kind}
                      type="button"
                      className={`intention-picker-option ${isSelected ? 'intention-picker-option-selected' : ''} ${isDisabled ? 'intention-picker-option-disabled' : ''}`}
                      onClick={() => !isDisabled && handleSelectKind(d.kind)}
                      disabled={isDisabled}
                      title={isDisabled ? 'Requiert une sortie PWM' : undefined}
                    >
                      <span className="intention-picker-option-icon"><Icon size={20} strokeWidth={2} /></span>
                      <div className="intention-picker-option-text">
                        <span className="intention-picker-option-label">{d.label}</span>
                        <span className="intention-picker-option-desc">{d.description}{isDisabled ? ' (PWM requis)' : ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="intention-picker-category">
              <span className="intention-picker-category-label">Dynamique</span>
              <div className="intention-picker-options">
                {INTENTION_DEFS.filter((d) => DYNAMIQUES.includes(d.kind)).map((d) => {
                  const Icon = d.icon
                  const isSelected = selectedKind === d.kind
                  const isDisabled = trackType === 'onoff' && d.requiresPwm
                  return (
                    <button
                      key={d.kind}
                      type="button"
                      className={`intention-picker-option ${isSelected ? 'intention-picker-option-selected' : ''} ${isDisabled ? 'intention-picker-option-disabled' : ''}`}
                      onClick={() => !isDisabled && handleSelectKind(d.kind)}
                      disabled={isDisabled}
                      title={isDisabled ? 'Requiert une sortie PWM' : undefined}
                    >
                      <span className="intention-picker-option-icon"><Icon size={20} strokeWidth={2} /></span>
                      <div className="intention-picker-option-text">
                        <span className="intention-picker-option-label">{d.label}</span>
                        <span className="intention-picker-option-desc">{d.description}{isDisabled ? ' (PWM requis)' : ''}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {showParamsContent && def && (
          <div className="intention-picker-params">
            <div className="intention-picker-params-selected">
              {(() => {
                const Icon = def.icon
                return (
                  <>
                    <Icon size={24} strokeWidth={2} />
                    <span>{def.label}</span>
                  </>
                )
              })()}
            </div>
            <div className="intention-picker-duration">
              <label className="intention-picker-duration-label">Durée simulée de l&apos;intention</label>
              <div className="intention-picker-duration-input-row">
                <div className="intention-picker-duration-field">
                  <span className="intention-picker-duration-unit">Heure</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    step={1}
                    readOnly={mode === 'modify'}
                    value={durationHours}
                    onChange={(e) => {
                      if (mode === 'modify') return
                      const n = Math.min(24, Math.max(0, parseInt(e.target.value, 10) || 0))
                      setDurationHours(n)
                      if (n === 24) setDurationMinutes(0)
                    }}
                    className="intention-picker-duration-input"
                  />
                </div>
                <div className="intention-picker-duration-field">
                  <span className="intention-picker-duration-unit">Minute</span>
                  <input
                    type="number"
                    min={0}
                    max={durationHours === 24 ? 0 : 59}
                    step={1}
                    readOnly={mode === 'modify' || durationHours === 24}
                    disabled={durationHours === 24}
                    value={durationHours === 24 ? 0 : durationMinutes}
                    onChange={(e) => {
                      if (mode === 'modify') return
                      const maxM = durationHours === 24 ? 0 : 59
                      const n = Math.min(maxM, Math.max(0, parseInt(e.target.value, 10) || 0))
                      setDurationMinutes(n)
                    }}
                    className="intention-picker-duration-input"
                  />
                </div>
                {mode === 'add' && !durationFits && (
                  <span className="intention-picker-duration-warning">
                    Ne rentre pas. Max: {Math.floor(msToSimulatedMinutes(actualDurationMs, projectDurationMs) / 60)}h{String(Math.round(msToSimulatedMinutes(actualDurationMs, projectDurationMs) % 60)).padStart(2, '0')} (simulé)
                  </span>
                )}
              </div>
            </div>
            {hasParams && def.params?.map((p) => {
              const val = params[p.key] ?? p.default
              const isDur = p.unit === 'dur'
              const effectiveMax = isDur ? Math.max(p.min, Math.min(p.max, intentionDurationMsResolved)) : p.max
              const clampedVal = isDur ? Math.min(val, effectiveMax) : val
              const displayVal = isDur ? formatDurationMsPrecise(clampedVal) : `${val} ${p.unit}`
              const displayMin = isDur ? formatDurationMsPrecise(p.min) : `${p.min} ${p.unit}`
              const displayMax = isDur ? formatDurationMsPrecise(effectiveMax) : `${p.max} ${p.unit}`
              return (
                <div key={p.key} className="intention-picker-param">
                  <label className="intention-picker-param-label">
                    {p.label}: {displayVal}
                  </label>
                  <input
                    type="range"
                    min={p.min}
                    max={effectiveMax}
                    step={p.step}
                    value={clampedVal}
                    onChange={(e) => {
                      const next = Number(e.target.value)
                      setParams((prev) => ({ ...prev, [p.key]: next }))
                    }}
                    className="intention-picker-param-slider"
                  />
                  <div className="intention-picker-param-range">
                    {displayMin} - {displayMax}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="intention-picker-actions">
          {mode === 'modify' && step === 'params' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleModifyEffect}>
              Modifier l&apos;effet
            </button>
          ) : step === 'params' && mode === 'add' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleBack}>
              Retour
            </button>
          ) : mode === 'modify' && step === 'pick' ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('params')}>
              Retour
            </button>
          ) : (
            <span />
          )}
          <div className="intention-picker-actions-right">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Annuler
            </button>
            {mode === 'add' && step === 'pick' && !hasParams && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm}>
                Ajouter
              </button>
            )}
            {mode === 'add' && step === 'pick' && hasParams && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm}>
                Paramètres
              </button>
            )}
            {mode === 'add' && step === 'params' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm}>
                Ajouter
              </button>
            )}
            {mode === 'modify' && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleConfirm}>
                Appliquer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
