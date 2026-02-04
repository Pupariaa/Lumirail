import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDialogPresence } from './useDialogPresence'

export function ViewportSizeGuard({
  enabled = true,
  minWidth = 1200,
  minHeight = 670,
}: {
  enabled?: boolean
  minWidth?: number
  minHeight?: number
}) {
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window === 'undefined' ? minWidth : window.innerWidth,
    h: typeof window === 'undefined' ? minHeight : window.innerHeight,
  }))

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setSize({ w: window.innerWidth, h: window.innerHeight })
      })
    }
    window.addEventListener('resize', onResize, { passive: true })
    onResize()
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [enabled])

  const tooSmall = enabled && (size.w < minWidth || size.h < minHeight)
  const message = useMemo(() => {
    const parts: string[] = []
    if (size.w < minWidth) parts.push(`Largeur min : ${minWidth}px`)
    if (size.h < minHeight) parts.push(`Hauteur min : ${minHeight}px`)
    return parts.join(' · ')
  }, [minHeight, minWidth, size.h, size.w])

  const { present, state } = useDialogPresence(tooSmall, 160)
  if (!present) return null

  return createPortal(
    <div className="viewport-guard-overlay" role="presentation" data-state={state}>
      <div className="viewport-guard-dialog" role="alertdialog" aria-modal="true" aria-labelledby="viewport-guard-title" data-state={state}>
        <h2 id="viewport-guard-title" className="viewport-guard-title">Agrandissez la page</h2>
        <p className="viewport-guard-text">Lumirail Studio nécessite une taille minimale de {minWidth}×{minHeight}.</p>
        <p className="viewport-guard-meta">{message}</p>
      </div>
    </div>,
    document.body
  )
}

