import { useRef, useState, useEffect } from 'react'
import type { Bookmark } from '../data'
import { DURATION_MIN, DURATION_MAX } from '../data'
import {
  msToPx,
  computeTicks,
  clampZoomLevel,
  fitZoom,
  pxPerMsFromZoomLevel,
  ZOOM_LEVEL_MIN,
  ZOOM_LEVEL_MAX,
  ZOOM_STEP,
} from './timeline-viewport'

interface MainTimelineProps {
  bookmarks: Bookmark[]
  durationMinutes: number
  onAddBookmark?: (positionMs: number, label: string) => void
  onRemoveBookmark?: (bookmarkId: string) => void
}

export function MainTimeline({
  bookmarks,
  durationMinutes,
}: MainTimelineProps) {
  const durationMs = durationMinutes * 60 * 1000
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(800)
  const [zoomLevel, setZoomLevel] = useState(1)
  const isInitialFit = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 800)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (isInitialFit.current) {
      isInitialFit.current = false
      setZoomLevel(1)
    }
  }, [containerWidth, durationMs])

  const pxPerMs = pxPerMsFromZoomLevel(containerWidth, durationMs, zoomLevel)
  const totalWidthPx = Math.max(containerWidth, Math.ceil(durationMs * pxPerMs))
  const { labelTicks } = computeTicks(durationMs, pxPerMs, containerWidth)

  const zoomIn = () => setZoomLevel((z) => clampZoomLevel(z * ZOOM_STEP))
  const zoomOut = () => setZoomLevel((z) => clampZoomLevel(z / ZOOM_STEP))
  const fitToView = () => setZoomLevel(1)
  const zoomPercent = Math.round(zoomLevel * 100)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [isDragScrolling, setIsDragScrolling] = useState(false)

  const handleScrollMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    const start = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft }
    setIsDragScrolling(true)
    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = start.x - moveEvent.clientX
      el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, start.scrollLeft + dx))
    }
    const onMouseUp = () => {
      setIsDragScrolling(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      ref={containerRef}
      className="main-timeline main-timeline-with-zoom"
      role="region"
      aria-label={`Main timeline: ${durationMinutes} minutes, ${bookmarks.length} bookmarks`}
      tabIndex={0}
    >
      <div className="timeline-toolbar">
        <div className="timeline-zoom-controls">
          <button
            type="button"
            className="timeline-zoom-btn"
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_LEVEL_MIN}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="timeline-zoom-label">{zoomPercent}%</span>
          <button
            type="button"
            className="timeline-zoom-btn"
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_LEVEL_MAX}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
        <button type="button" className="timeline-fit-btn" onClick={fitToView}>
          Fit
        </button>
      </div>
      <div
        ref={scrollRef}
        className={`timeline-scroll main-timeline-scroll ${isDragScrolling ? 'main-timeline-scroll-dragging' : ''}`}
        tabIndex={0}
        onMouseDown={handleScrollMouseDown}
      >
        <div className="main-timeline-ruler main-timeline-ruler-px" style={{ width: totalWidthPx }}>
          {labelTicks.map((t) => (
            <div
              key={t.ms}
              className={`timeline-tick timeline-tick-major`}
              style={{ left: msToPx(t.ms, pxPerMs) }}
            >
              <span className="timeline-tick-label">{t.label}</span>
            </div>
          ))}
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="main-timeline-bookmark"
              style={{ left: msToPx(bm.positionMs, pxPerMs) }}
              title={bm.label}
            >
              <div className="main-timeline-bookmark-line" />
              <span className="main-timeline-bookmark-label">{bm.label}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="timeline-scale-note">
        {DURATION_MIN}-{DURATION_MAX} min = 24h. Bookmarks appear on all module timelines.
      </p>
    </div>
  )
}
