import { useState } from 'react'
import { useSerial } from '../context/useSerial'
import { estimateUploadTimeMs, LFP_BLOCK_SIZE } from '../serial'

interface UploadLfpDialogProps {
  open: boolean
  lfpBuffer: ArrayBuffer | null
  onSuccess: () => void
  onCancel: () => void
}

export function UploadLfpDialog({
  open,
  lfpBuffer,
  onSuccess,
  onCancel,
}: UploadLfpDialogProps) {
  const { state: serialState, uploadLfp } = useSerial()
  const [slot, setSlot] = useState<1 | 2>(1)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [phase, setPhase] = useState<1 | 2 | 3>(1)
  const [rateKbPerS, setRateKbPerS] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const digiKeyConnected = serialState === 'connected'
  const canUpload = digiKeyConnected && lfpBuffer && lfpBuffer.byteLength > 0 && !uploading
  const fileSize = lfpBuffer ? lfpBuffer.byteLength : 0
  const blockCount = lfpBuffer ? Math.ceil(fileSize / LFP_BLOCK_SIZE) : 0
  const estimatedMs = lfpBuffer ? estimateUploadTimeMs(fileSize) : 0
  const sizeKb = (fileSize / 1024).toFixed(2)

  const handleConfirmOk = async () => {
    if (!lfpBuffer || !canUpload) return
    setShowConfirm(false)
    setUploading(true)
    setError(null)
    setProgress(0)
    setPhase(1)
    setRateKbPerS(null)
    try {
      await uploadLfp(lfpBuffer, {
        slot,
        onProgress: (pct, ph, rate) => {
          setProgress(pct)
          if (ph !== undefined) setPhase(ph)
          if (ph === 3) setRateKbPerS(null)
          else if (rate !== undefined) setRateKbPerS(rate)
        },
      })
      setShowSuccess(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
      setProgress(0)
      setPhase(1)
      setRateKbPerS(null)
    }
  }

  const handleSuccessOk = () => {
    setShowSuccess(false)
    onSuccess()
  }

  if (!open) return null

  return (
    <div className="upload-scene-dialog-backdrop" onClick={onCancel} role="presentation">
      <div className="upload-scene-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upload-lfp-title">
        <h2 id="upload-lfp-title" className="upload-scene-dialog-title">Téléverser le binaire LFP</h2>

        <div className="upload-scene-grid">
          <section className="upload-scene-section">
            <h3 className="upload-scene-section-title">Fichier</h3>
            <dl className="upload-scene-dl">
              <dt>Taille</dt>
              <dd>{sizeKb} Ko</dd>
              <dt>Blocs (256 o)</dt>
              <dd>{blockCount}</dd>
              <dt>Durée estimée</dt>
              <dd>{estimatedMs >= 1000 ? `${Math.round(estimatedMs / 1000)} s` : `${estimatedMs} ms`}</dd>
            </dl>
          </section>
          <section className="upload-scene-section upload-scene-params">
            <h3 className="upload-scene-section-title">Paramètres</h3>
            <div className="upload-scene-param-list">
              <div className="upload-scene-param-row">
                <label className="upload-scene-param-label">Slot scène</label>
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

        {(canUpload || uploading) && (
          <div className="upload-scene-warning-box" style={{ marginTop: 0 }}>
            <strong>Pendant le téléversement :</strong>
            <ul>
              <li>Ne pas déconnecter le module</li>
              <li>Ne pas déconnecter le DigiKey</li>
              <li>Rester sur Lumirail Studio</li>
            </ul>
          </div>
        )}

        {showConfirm && (
          <div className="upload-scene-confirm-backdrop" onClick={() => setShowConfirm(false)} role="presentation">
            <div className="upload-scene-confirm-box" onClick={(e) => e.stopPropagation()} role="alertdialog" aria-labelledby="upload-lfp-confirm-title">
              <h3 id="upload-lfp-confirm-title" className="upload-scene-confirm-title">Avant de téléverser</h3>
              <p className="upload-scene-confirm-text">Pendant le téléversement :</p>
              <ul>
                <li>Ne pas déconnecter le module</li>
                <li>Ne pas déconnecter le DigiKey</li>
                <li>Rester sur Lumirail Studio</li>
              </ul>
              <div className="upload-scene-confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowConfirm(false)}>Annuler</button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmOk}>Ok</button>
              </div>
            </div>
          </div>
        )}

        {showSuccess && (
          <div className="upload-scene-confirm-backdrop" role="presentation">
            <div className="upload-scene-success-box" role="alertdialog" aria-labelledby="upload-lfp-success-title">
              <h3 id="upload-lfp-success-title" className="upload-scene-success-title">Téléversement réussi</h3>
              <p className="upload-scene-success-text">Le fichier LFP a bien été transféré vers le module.</p>
              <div className="upload-scene-confirm-actions">
                <button type="button" className="btn btn-primary" onClick={handleSuccessOk}>Ok</button>
              </div>
            </div>
          </div>
        )}

        {uploading && (
          <div className="upload-scene-progress">
            <div className="upload-scene-progress-header">
              <span className="upload-scene-progress-pct">{progress} %</span>
              <span className="upload-scene-progress-meta-row">
                {rateKbPerS != null && (
                  <span className="upload-scene-progress-rate">{rateKbPerS.toFixed(1)} Ko/s</span>
                )}
                <span className="upload-scene-progress-remaining">
                  {(() => {
                    const remainingMs = Math.round(((100 - progress) / 100) * estimatedMs)
                    return remainingMs >= 1000
                      ? `Environ ${Math.round(remainingMs / 1000)} s restantes`
                      : remainingMs > 0
                        ? 'Presque terminé'
                        : ''
                  })()}
                </span>
              </span>
            </div>
            <div className="upload-scene-progress-bar">
              <div className="upload-scene-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <ul className="upload-scene-progress-phases" aria-label="Phases du téléversement">
              <li className={phase >= 1 ? 'upload-scene-phase-active' : ''} aria-current={phase === 1 ? 'step' : undefined}>
                {phase > 1 ? '\u2713 ' : ''}Préparation de la scène
              </li>
              <li className={phase >= 2 ? 'upload-scene-phase-active' : ''} aria-current={phase === 2 ? 'step' : undefined}>
                {phase > 2 ? '\u2713 ' : ''}Téléversement de la scène
              </li>
              <li className={phase >= 3 ? 'upload-scene-phase-active' : ''} aria-current={phase === 3 ? 'step' : undefined}>
                {phase > 3 ? '\u2713 ' : ''}Vérification
              </li>
            </ul>
          </div>
        )}

        {error && <p className="upload-scene-error">{error}</p>}

        <div className="upload-scene-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={uploading}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => canUpload && setShowConfirm(true)}
            disabled={!canUpload}
          >
            Téléverser
          </button>
        </div>
      </div>
    </div>
  )
}
