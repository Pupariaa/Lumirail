import { useEffect, useRef, useState } from 'react'
import { useDialogPresence } from './useDialogPresence'

interface DurationEditDialogProps {
  open: boolean
  title: string
  defaultStartH: number
  defaultEndH: number
  onConfirm: (startH: number, endH: number) => void
  onCancel: () => void
}

export function DurationEditDialog({
  open,
  title,
  defaultStartH,
  defaultEndH,
  onConfirm,
  onCancel,
}: DurationEditDialogProps) {
  const [startH, setStartH] = useState(String(defaultStartH))
  const [endH, setEndH] = useState(String(defaultEndH))
  const startRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setStartH(String(defaultStartH))
      setEndH(String(defaultEndH))
      requestAnimationFrame(() => startRef.current?.focus())
    }
  }, [open, defaultStartH, defaultEndH])

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
  }, [open, onCancel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const s = Math.max(0, Math.min(24, parseFloat(startH) || 0))
    const eVal = Math.max(0, Math.min(24, parseFloat(endH) || 0))
    if (eVal > s && eVal - s >= 1 / 60) onConfirm(s, eVal)
  }

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  return (
    <div
      className="name-edit-dialog-backdrop"
      onClick={onCancel}
      role="presentation"
      data-state={state}
    >
      <div
        className="name-edit-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duration-edit-dialog-title"
        data-state={state}
      >
        <h2 id="duration-edit-dialog-title" className="name-edit-dialog-title">
          {title}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="duration-edit-dialog-fields">
            <div className="form-group">
              <label htmlFor="duration-start-h">Debut (h 0-24)</label>
              <input
                ref={startRef}
                id="duration-start-h"
                type="number"
                min={0}
                max={24}
                step={0.5}
                className="name-edit-dialog-input"
                value={startH}
                onChange={(e) => setStartH(e.target.value)}
                aria-label="Debut en heures"
              />
            </div>
            <div className="form-group">
              <label htmlFor="duration-end-h">Fin (h 0-24)</label>
              <input
                id="duration-end-h"
                type="number"
                min={0}
                max={24}
                step={0.5}
                className="name-edit-dialog-input"
                value={endH}
                onChange={(e) => setEndH(e.target.value)}
                aria-label="Fin en heures"
              />
            </div>
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
