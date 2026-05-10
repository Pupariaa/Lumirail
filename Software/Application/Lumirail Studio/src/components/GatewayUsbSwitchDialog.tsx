import { useEffect } from 'react'
import { useDialogPresence } from './useDialogPresence'

interface GatewayUsbSwitchDialogProps {
  open: boolean
  onUseGatewayUsb: () => void
  onStayStudio: () => void
}

export function GatewayUsbSwitchDialog({ open, onUseGatewayUsb, onStayStudio }: GatewayUsbSwitchDialogProps) {
  const { present, state } = useDialogPresence(open, 160)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onStayStudio()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onStayStudio])

  if (!present) return null

  return (
    <div
      className="dialog-overlay gateway-usb-dialog-overlay"
      onClick={onStayStudio}
      role="presentation"
      data-state={state}
    >
      <div
        className="dialog-surface gateway-usb-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gateway-usb-dialog-title"
        data-state={state}
      >
        <h2 id="gateway-usb-dialog-title" className="gateway-usb-dialog-title">
          Clé USB sur la passerelle
        </h2>
        <p className="gateway-usb-dialog-body">
          Une clé USB est détectée sur le port hôte de la passerelle. Les scènes brutes, la configuration et l&apos;archive
          projet peuvent y être enregistrées pour être relues par un autre outil. Souhaitez-vous traiter la passerelle
          (clé USB) comme référence du projet au lieu du stockage local de Lumirail Studio sur cet ordinateur ?
        </p>
        <p className="gateway-usb-dialog-note">
          Vous pourrez changer ce choix depuis la page Passerelle. La synchronisation détaillée avec la clé sera branchée
          côté firmware.
        </p>
        <div className="gateway-usb-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onStayStudio}>
            Rester sur ce poste
          </button>
          <button type="button" className="btn btn-primary" onClick={onUseGatewayUsb}>
            Utiliser la passerelle et la clé
          </button>
        </div>
      </div>
    </div>
  )
}
