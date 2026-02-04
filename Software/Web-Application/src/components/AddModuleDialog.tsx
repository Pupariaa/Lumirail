import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Project, Module, StoredModuleInfo } from '../data'
import { isValidModuleSerial } from '../serial'

const MODULE_SERIAL_PLACEHOLDER = 'LMS-XX-XX-XX-XX-XX'
const BOARD_RECAP_KEYS = ['MODEL', 'SN', 'REV']

export interface AddModuleDialogProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  defaultProjectId: string
  modules: Module[]
  createModule: (projectId: string, name: string, outputAddresses?: import('../data').OutputAddress[], storedModuleInfo?: StoredModuleInfo) => unknown
  updateModule: (moduleId: string, updates: { name?: string; storedModuleInfo?: StoredModuleInfo }) => unknown
  getModuleInfo: () => Promise<{ board: Record<string, string>; config: Record<string, string>; s1Meta: Record<string, string>; s2Meta: Record<string, string> }>
  canScanDigiKey: boolean
  isSupported: boolean
  initialScannedInfo?: StoredModuleInfo
}

export function AddModuleDialog({
  open,
  onClose,
  projects,
  defaultProjectId,
  modules,
  createModule,
  updateModule,
  getModuleInfo,
  canScanDigiKey,
  isSupported,
  initialScannedInfo,
}: AddModuleDialogProps) {
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [serial, setSerial] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scannedInfo, setScannedInfo] = useState<StoredModuleInfo | null>(null)
  const [associateModuleId, setAssociateModuleId] = useState('')

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId || (projects[0]?.id ?? ''))
      setSerial('')
      setError(null)
      setScannedInfo(initialScannedInfo ?? null)
      setAssociateModuleId('')
    }
  }, [open, defaultProjectId, projects, initialScannedInfo])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const targetProjectId = (projectId || projects[0]?.id) ?? ''
  const scannedSn = scannedInfo?.board?.['SN']?.trim() ?? ''

  const handleAddBySerial = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = serial.trim()
    if (!targetProjectId || !trimmed) return
    if (!isValidModuleSerial(trimmed)) {
      setError('Format attendu : ' + MODULE_SERIAL_PLACEHOLDER)
      return
    }
    createModule(targetProjectId, trimmed)
    setSerial('')
    onClose()
  }

  const handleScanDigiKey = async () => {
    if (!targetProjectId || !canScanDigiKey) return
    setError(null)
    setScannedInfo(null)
    setScanning(true)
    try {
      const info = await getModuleInfo()
      setScannedInfo({ board: info.board, config: info.config, s1Meta: info.s1Meta, s2Meta: info.s2Meta })
    } catch {
      setError('Échec du scan. Connectez le module au DigiKey.')
    } finally {
      setScanning(false)
    }
  }

  const handleAddScanned = () => {
    if (!targetProjectId || !scannedSn || !scannedInfo) return
    createModule(targetProjectId, scannedSn, [], scannedInfo)
    setScannedInfo(null)
    onClose()
  }

  const handleAssociateScanned = () => {
    if (!associateModuleId || !scannedSn || !scannedInfo) return
    updateModule(associateModuleId, { name: scannedSn, storedModuleInfo: scannedInfo })
    setScannedInfo(null)
    setAssociateModuleId('')
    onClose()
  }

  const handleClearScanned = () => {
    setScannedInfo(null)
    setAssociateModuleId('')
  }

  if (!open) return null

  return createPortal(
    <div
      className="add-module-dialog-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="add-module-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-module-dialog-title"
      >
        <h2 id="add-module-dialog-title" className="add-module-dialog-title">
          Ajouter un module
        </h2>
        {projects.length >= 1 && (
          <div className="add-module-dialog-field">
            <label htmlFor="add-module-project">Projet</label>
            <select
              id="add-module-project"
              className="add-module-dialog-select"
              value={targetProjectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {projects.length === 0 && (
          <p className="add-module-dialog-hint">Créez un espace de travail et un projet pour ajouter des modules.</p>
        )}
        {projects.length >= 1 && !scannedInfo && (
          <>
            <form onSubmit={handleAddBySerial} className="add-module-dialog-form">
              <div className="add-module-dialog-field">
                <label htmlFor="add-module-serial">Numéro de série</label>
                <input
                  id="add-module-serial"
                  type="text"
                  value={serial}
                  onChange={(e) => {
                    setSerial(e.target.value)
                    setError(null)
                  }}
                  placeholder={MODULE_SERIAL_PLACEHOLDER}
                  maxLength={24}
                  autoComplete="off"
                  className="add-module-dialog-input"
                  aria-invalid={!!error}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!serial.trim()}
              >
                Ajouter par numéro
              </button>
            </form>
            <p className="add-module-dialog-or">ou</p>
            <button
              type="button"
              className="btn btn-secondary add-module-dialog-scan"
              onClick={handleScanDigiKey}
              disabled={!canScanDigiKey || scanning}
            >
              {scanning ? 'Scan…' : 'Scanner avec le DigiKey'}
            </button>
            {!canScanDigiKey && isSupported && (
              <p className="add-module-dialog-hint">
                Connectez le DigiKey en haut à gauche, puis connectez le module au DigiKey.
              </p>
            )}
            {!isSupported && (
              <p className="add-module-dialog-hint">DigiKey non disponible dans ce navigateur.</p>
            )}
          </>
        )}
        {scannedInfo && (
          <div className="add-module-dialog-scanned">
            <p className="add-module-dialog-recap-title">Détecté</p>
            <dl className="add-module-dialog-recap">
              {BOARD_RECAP_KEYS.filter((k) => scannedInfo.board[k]).map((k) => (
                <div key={k} className="add-module-dialog-recap-row">
                  <dt>{k}</dt>
                  <dd>{scannedInfo.board[k]}</dd>
                </div>
              ))}
            </dl>
            <div className="add-module-dialog-recap-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleAddScanned}
                disabled={!scannedSn}
              >
                Ajouter
              </button>
              {modules.length >= 1 ? (
                <>
                  <select
                    className="add-module-dialog-select add-module-dialog-associate-select"
                    value={associateModuleId}
                    onChange={(e) => setAssociateModuleId(e.target.value)}
                  >
                    <option value="">Associer à…</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleAssociateScanned}
                    disabled={!associateModuleId}
                  >
                    Associer
                  </button>
                </>
              ) : null}
            </div>
            <button type="button" className="btn btn-ghost btn-sm add-module-dialog-rescan" onClick={handleClearScanned}>
              Nouveau scan
            </button>
          </div>
        )}
        {error && (
          <p className="add-module-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="add-module-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
