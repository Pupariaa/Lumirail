import { useEffect, useRef, useState } from 'react'
import { useDialogPresence } from './useDialogPresence'

interface NameEditDialogProps {
  open: boolean
  title: string
  defaultValue: string
  placeholder?: string
  allowEmpty?: boolean
  onConfirm: (value: string) => void
  onCancel: () => void
}

export function NameEditDialog({
  open,
  title,
  defaultValue,
  placeholder = '',
  allowEmpty = false,
  onConfirm,
  onCancel,
}: NameEditDialogProps) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue(defaultValue)
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
    const trimmed = value.trim()
    if (trimmed || allowEmpty) onConfirm(trimmed)
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
        aria-labelledby="name-edit-dialog-title"
        data-state={state}
      >
        <h2 id="name-edit-dialog-title" className="name-edit-dialog-title">
          {title}
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="name-edit-dialog-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            maxLength={100}
            autoComplete="off"
            aria-label={title}
          />
          <div className="name-edit-dialog-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!allowEmpty && !value.trim()}
            >
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
