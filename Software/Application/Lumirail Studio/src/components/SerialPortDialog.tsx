import { useEffect } from 'react'
import { useDialogPresence } from './useDialogPresence'
import { Cpu, Loader2, Plug } from 'lucide-react'

export interface SerialPortOption {
  path: string
  portId: string
  portName?: string
  displayName?: string
}

interface SerialPortDialogProps {
  open: boolean
  portList: SerialPortOption[]
  loading?: boolean
  onSelect: (path: string) => void
  onCancel: () => void
}

export function SerialPortDialog({ open, portList, loading = false, onSelect, onCancel }: SerialPortDialogProps) {
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

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  return (
    <div
      className="serial-port-dialog-backdrop"
      onClick={onCancel}
      role="presentation"
      data-state={state}
    >
      <div
        className="serial-port-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="serial-port-dialog-title"
        data-state={state}
      >
        <h2 id="serial-port-dialog-title" className="serial-port-dialog-title">
          Connecter le DigiKey
        </h2>
        <p className="serial-port-dialog-message">
          {loading ? 'Recherche des périphériques…' : portList.length === 0 ? 'Branchez le DigiKey à votre ordinateur.' : 'Choisir le port série'}
        </p>
        {loading ? (
          <div className="serial-port-dialog-loading" aria-busy="true">
            <Loader2 className="serial-port-dialog-spinner" aria-hidden />
            <span>Chargement…</span>
          </div>
        ) : portList.length === 0 ? (
          <div className="serial-port-dialog-empty">
            <Plug className="serial-port-dialog-empty-icon" aria-hidden />
            <span>Aucun DigiKey détecté</span>
          </div>
        ) : (
          <ul className="serial-port-dialog-list" aria-label="Ports DigiKey">
            {portList.map((port) => (
              <li key={port.path}>
                <button
                  type="button"
                  className="serial-port-dialog-item"
                  onClick={() => onSelect(port.path)}
                >
                  <Cpu className="serial-port-dialog-icon" aria-hidden />
                  <span>{port.displayName || port.portName || port.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="serial-port-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}
