import { useState, useEffect } from 'react'
import { useSerial } from '../context/useSerial'
import { estimateUploadTimeMs } from '../serial'
import { generateSceneText } from '../sceneGenerator'
import { formatDurationMs } from './timeline-viewport'
import { useDialogPresence } from './useDialogPresence'

interface UploadSceneDialogProps {
  open: boolean
  sceneText: string
  frameMs: number
  onOffCount: number
  pwmCount: number
  boardModel: string
  boardSn: string
  durationMs: number
  projectDurationMinutes: number
  expectedModuleSn: string
  onSuccess: () => void
  onCancel: () => void
}

function formatSimulatedDuration(projectDurationMinutes: number): string {
  return `24h (${projectDurationMinutes} min)`
}

export function UploadSceneDialog({
  open,
  sceneText,
  frameMs,
  onOffCount,
  pwmCount,
  boardModel,
  boardSn,
  durationMs,
  projectDurationMinutes,
  expectedModuleSn,
  onSuccess,
  onCancel,
}: UploadSceneDialogProps) {
  const { state: serialState, uploadScene, connectedModuleSn, connectedModuleInfo, modulePresent } = useSerial()
  const [sop, setSop] = useState(true)
  const [loop, setLoop] = useState(true)
  const [slot, setSlot] = useState<1 | 2>(1)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const digiKeyConnected = serialState === 'connected'
  const connectedBoard = connectedModuleInfo?.board ?? {}
  const connectedOnOff = Math.max(0, parseInt(connectedBoard['CHP'] ?? '0', 10))
  const connectedPwm = Math.max(0, parseInt(connectedBoard['CHPWM'] ?? '0', 10))
  const normalizeSn = (s: string) => (s ?? '').trim().replace(/\s+/g, '')
  const storedSn = normalizeSn(expectedModuleSn)
  const connectedSn = normalizeSn(connectedModuleSn ?? '')
  const canVerifySn = storedSn.length > 0
  const isRightModule = !canVerifySn ? true : (connectedSn === storedSn && modulePresent)
  const isCompatible = connectedOnOff >= onOffCount && connectedPwm >= pwmCount
  const canUpload = digiKeyConnected && isCompatible && !uploading

  const dataBytes = new TextEncoder().encode(sceneText).length
  const sizeKb = (dataBytes / 1024).toFixed(2)
  const numFrames = Math.ceil(durationMs / frameMs)
  const [hash, setHash] = useState<string>('')
  useEffect(() => {
    if (open && sceneText) {
      crypto.subtle.digest('SHA-256', new TextEncoder().encode(sceneText)).then((buf) => {
        setHash(Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase())
      })
    } else if (!open) setHash('')
  }, [open, sceneText])

  useEffect(() => {
    if (!open) {
      setShowConfirm(false)
      setShowSuccess(false)
      setUploading(false)
      setProgress(0)
      setError(null)
    }
  }, [open])

  const handleTéléverserClick = () => {
    if (!canUpload) return
    setShowConfirm(true)
  }

  const handleConfirmOk = async () => {
    setShowConfirm(false)
    setUploading(true)
    setError(null)
    setProgress(0)
    try {
      await uploadScene(sceneText, { slot, sop, loop, onProgress: setProgress })
      setShowSuccess(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleSuccessOk = () => {
    setShowSuccess(false)
    onSuccess()
  }

  const { present, state } = useDialogPresence(open, 160)
  if (!present) return null

  const confirmPresence = useDialogPresence(showConfirm, 140)
  const successPresence = useDialogPresence(showSuccess, 140)

  return (
    <div className="upload-scene-dialog-backdrop" onClick={onCancel} role="presentation" data-state={state}>
      <div className="upload-scene-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-scene-title" data-state={state}>
        <h2 id="upload-scene-title" className="upload-scene-dialog-title">Téléverser la scène</h2>

        <div className="upload-scene-grid">
          <section className="upload-scene-section upload-scene-recap">
            <h3 className="upload-scene-section-title">Récapitulatif</h3>
            <dl className="upload-scene-dl">
              <dt>Nombre de frames</dt>
              <dd>{numFrames}</dd>
              <dt>Précision</dt>
              <dd>{frameMs} ms</dd>
              <dt>Channels On/Off</dt>
              <dd>{onOffCount}</dd>
              <dt>Channels PWM</dt>
              <dd>{pwmCount}</dd>
              <dt>Modèle</dt>
              <dd>{boardModel || '-'}</dd>
              <dt>Numéro de série</dt>
              <dd>{boardSn || '-'}</dd>
              <dt>Durée réelle</dt>
              <dd>{formatDurationMs(durationMs)}</dd>
              <dt>Durée simulée</dt>
              <dd>{formatSimulatedDuration(projectDurationMinutes)}</dd>
              <dt>Taille</dt>
              <dd>{sizeKb} Ko</dd>
              <dt>Hash</dt>
              <dd className="upload-scene-hash">{hash || '…'}</dd>
            </dl>
          </section>

          <section className="upload-scene-section upload-scene-params">
            <h3 className="upload-scene-section-title">Paramètres</h3>
            <div className="upload-scene-param-list">
              <label className="upload-scene-param-row">
                <input type="checkbox" checked={sop} onChange={(e) => setSop(e.target.checked)} disabled={uploading} />
                <span>Démarrer dès l&apos;alimentation</span>
              </label>
              <label className="upload-scene-param-row upload-scene-param-disabled">
                <input type="checkbox" disabled />
                <span>Démarrer sur trigger (désactivé)</span>
              </label>
              <label className="upload-scene-param-row">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} disabled={uploading} />
                <span>Jouer en boucle</span>
              </label>
              <div className="upload-scene-param-row">
                <label className="upload-scene-param-label">Scène cible</label>
                <select value={slot} onChange={(e) => setSlot(Number(e.target.value) as 1 | 2)} disabled={uploading}>
                  <option value={1}>Scène 1</option>
                  <option value={2}>Scène 2</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {!digiKeyConnected && (
          <p className="upload-scene-warning">DigiKey non connecté. Connectez le DigiKey pour téléverser.</p>
        )}
        {digiKeyConnected && !isCompatible && (
          <p className="upload-scene-warning">
            Module incompatible. La composition requiert {onOffCount} On/Off et {pwmCount} PWM. Le module connecté a {connectedOnOff} On/Off et {connectedPwm} PWM.
          </p>
        )}
        {digiKeyConnected && isCompatible && canVerifySn && !isRightModule && (
          <p className="upload-scene-info">Module différent du spécifié ({storedSn}) mais compatible. Le téléversement est autorisé.</p>
        )}

        {successPresence.present && (
          <div className="upload-scene-confirm-backdrop" role="presentation" data-state={successPresence.state}>
            <div className="upload-scene-success-box" role="alertdialog" aria-labelledby="upload-scene-success-title">
              <h3 id="upload-scene-success-title" className="upload-scene-success-title">Téléversement réussi</h3>
              <p className="upload-scene-success-text">La scène a bien été transférée vers le module.</p>
              <div className="upload-scene-confirm-actions">
                <button type="button" className="btn btn-primary" onClick={handleSuccessOk}>
                  Ok
                </button>
              </div>
            </div>
          </div>
        )}

        {confirmPresence.present && (
          <div className="upload-scene-confirm-backdrop" onClick={() => setShowConfirm(false)} role="presentation" data-state={confirmPresence.state}>
            <div className="upload-scene-confirm-box" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="upload-scene-confirm-title">
              <h3 id="upload-scene-confirm-title" className="upload-scene-confirm-title">Avant de téléverser</h3>
              <p className="upload-scene-confirm-text">Pendant le téléversement :</p>
              <ul>
                <li>Ne pas déconnecter le module</li>
                <li>Ne pas déconnecter le DigiKey</li>
                <li>Rester sur Lumirail Studio</li>
              </ul>
              <div className="upload-scene-confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>
                  Annuler
                </button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmOk}>
                  Ok
                </button>
              </div>
            </div>
          </div>
        )}

        {uploading && (
          <div className="upload-scene-progress">
            <div className="upload-scene-progress-bar">
              <div className="upload-scene-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="upload-scene-progress-meta">
              {(() => {
                const totalMs = estimateUploadTimeMs(dataBytes)
                const remainingMs = Math.round(((100 - progress) / 100) * totalMs)
                return remainingMs >= 1000
                  ? `Environ ${Math.round(remainingMs / 1000)} s restantes`
                  : remainingMs > 0
                    ? 'Presque terminé'
                    : ''
              })()}
            </div>
          </div>
        )}

        {error && <p className="upload-scene-error">{error}</p>}

        <div className="upload-scene-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={uploading}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleTéléverserClick}
            disabled={!canUpload}
          >
            Téléverser
          </button>
        </div>
      </div>
    </div>
  )
}
