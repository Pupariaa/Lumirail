import { useEffect, useRef, useState } from 'react'
import type { PlateauUnit } from '../data'
import { useDialogPresence } from './useDialogPresence'

export function PlateauSettingsDialog({
  open,
  defaultWidth,
  defaultHeight,
  defaultUnit,
  onConfirm,
  onCancel,
}: {
  open: boolean
  defaultWidth: number
  defaultHeight: number
  defaultUnit: PlateauUnit
  onConfirm: (next: { width: number; height: number; unit: PlateauUnit }) => void
  onCancel: () => void
}) {
  const [width, setWidth] = useState(String(defaultWidth))
  const [height, setHeight] = useState(String(defaultHeight))
  const [unit, setUnit] = useState<PlateauUnit>(defaultUnit)
  const widthRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setWidth(String(defaultWidth))
    setHeight(String(defaultHeight))
    setUnit(defaultUnit)
    requestAnimationFrame(() => widthRef.current?.focus())
  }, [defaultHeight, defaultUnit, defaultWidth, open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel, open])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const w = Math.max(1, Math.round(parseFloat(width) || 1))
    const h = Math.max(1, Math.round(parseFloat(height) || 1))
    onConfirm({ width: w, height: h, unit })
  }

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  return (
    <div className="name-edit-dialog-backdrop" onClick={onCancel} role="presentation" data-state={state}>
      <div
        className="name-edit-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plateau-settings-dialog-title"
        data-state={state}
      >
        <h2 id="plateau-settings-dialog-title" className="name-edit-dialog-title">
          Réglages du plateau
        </h2>
        <form onSubmit={submit}>
          <div className="duration-edit-dialog-fields">
            <div className="form-group">
              <label htmlFor="plateau-width">Largeur</label>
              <input
                ref={widthRef}
                id="plateau-width"
                type="number"
                min={1}
                step={1}
                className="name-edit-dialog-input"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="plateau-height">Hauteur</label>
              <input
                id="plateau-height"
                type="number"
                min={1}
                step={1}
                className="name-edit-dialog-input"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="plateau-unit">Unité</label>
            <select
              id="plateau-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as PlateauUnit)}
              className="name-edit-dialog-input"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
          <div className="name-edit-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

