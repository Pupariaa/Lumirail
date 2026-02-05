import { useEffect, useRef, useState } from 'react'
import { useDialogPresence } from './useDialogPresence'

interface DeleteModuleConfirmDialogProps {
  open: boolean
  moduleName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteModuleConfirmDialog({
  open,
  moduleName,
  onConfirm,
  onCancel,
}: DeleteModuleConfirmDialogProps) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setValue('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

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
    if (value.trim() === moduleName) onConfirm()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
  }

  const handleCopy = (e: React.ClipboardEvent) => {
    e.preventDefault()
  }

  const handleCut = (e: React.ClipboardEvent) => {
    e.preventDefault()
  }

  const match = value.trim() === moduleName

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  return (
    <div
      className="delete-module-confirm-backdrop"
      onClick={onCancel}
      role="presentation"
      data-state={state}
    >
      <div
        className="delete-module-confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-module-confirm-title"
        data-state={state}
      >
        <h2 id="delete-module-confirm-title" className="delete-module-confirm-title">
          Confirmer la suppression du module
        </h2>
        <p className="delete-module-confirm-warning">
          Toute la scène de ce module sera perdue (blocs, bookmarks). Cette action est irréversible.
        </p>
        <p className="delete-module-confirm-hint">
          Pour confirmer, saisissez le nom du module ci-dessous (copier-coller désactivé).
        </p>
        <p className="delete-module-confirm-serial-label">Nom du module à saisir :</p>
        <p className="delete-module-confirm-serial-value" aria-hidden="true">{moduleName}</p>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="delete-module-confirm-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={handlePaste}
            onCopy={handleCopy}
            onCut={handleCut}
            autoComplete="off"
            aria-label="Saisir le nom du module"
            aria-describedby="delete-module-confirm-serial-value"
          />
          <div className="delete-module-confirm-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-danger"
              disabled={!match}
            >
              Supprimer le module
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
