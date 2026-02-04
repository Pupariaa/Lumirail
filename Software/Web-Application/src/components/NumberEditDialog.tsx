import { useEffect, useRef, useState } from 'react'
import { useDialogPresence } from './useDialogPresence'

interface NumberEditDialogProps {
  open: boolean
  title: string
  defaultValue: number
  min: number
  max: number
  unit?: string
  onConfirm: (value: number) => void
  onCancel: () => void
}

export function NumberEditDialog({
  open,
  title,
  defaultValue,
  min,
  max,
  unit = '',
  onConfirm,
  onCancel,
}: NumberEditDialogProps) {
  const [value, setValue] = useState(String(defaultValue))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(String(defaultValue))
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, defaultValue])

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
    const n = Math.max(min, Math.min(max, Math.round(parseFloat(value) || min)))
    onConfirm(n)
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
        aria-labelledby="number-edit-dialog-title"
        data-state={state}
      >
        <h2 id="number-edit-dialog-title" className="name-edit-dialog-title">
          {title}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="number-edit-input">
              Valeur ({min}–{max}{unit ? ` ${unit}` : ''})
            </label>
            <input
              ref={inputRef}
              id="number-edit-input"
              type="number"
              min={min}
              max={max}
              className="name-edit-dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={title}
            />
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
