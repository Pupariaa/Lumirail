import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, MapPin, Lock, Plus, Clock, Timer, Palette, Undo2, Redo2, Ruler, Square, SunMoon, Copy } from 'lucide-react'
import { useContext } from 'react'
import { DataContext } from '../context/dataContext'
import { dispatchUndo, dispatchRedo } from '../lib/undoRedoEvents'
import { NameEditDialog } from './NameEditDialog'
import { DurationEditDialog } from './DurationEditDialog'
import { IntentionPickerDialog } from './IntentionPickerDialog'
import { blockToIntentionKind, intentionKindToType, getIntentionDef } from './intention-definitions'
import type { Project, Bookmark, Moment, MomentTrack, Module, TimelineBlock } from '../data'
import { DURATION_MIN, DURATION_MAX } from '../data'
import {
  msToPx,
  pxToMs,
  computeTicks,
  computeSimulatedTicks,
  clampZoomLevel,
  fitZoom,
  pxPerMsFromZoomLevel,
  snapToFinestGrid,
  projectMsToSimulatedH,
  formatSimulatedH,
  formatDurationMs,
  durationMsToSimulatedH,
  ZOOM_LEVEL_MIN,
  ZOOM_LEVEL_MAX,
  ZOOM_STEP,
} from './timeline-viewport'

interface SceneTimelineProps {
  project: Project
  projectId?: string
  module?: Module
  onCreateBookmark?: (positionMs: number, label: string) => void
  onUpdateBookmark?: (bookmarkId: string, updates: { positionMs?: number; label?: string }) => void
  onDeleteBookmark?: (bookmarkId: string) => void
  onCreateModuleBookmark?: (positionMs: number, label: string) => void
  onUpdateModuleBookmark?: (bookmarkId: string, updates: { positionMs?: number; label?: string; color?: string }) => void
  onDeleteModuleBookmark?: (bookmarkId: string) => void
  onCreateMomentTrack?: (name: string) => void
  onUpdateMomentTrack?: (trackId: string, updates: { name?: string }) => void
  onDeleteMomentTrack?: (trackId: string) => void
  onCreateMoment?: (trackId: string, moment: { label: string; startMs: number; endMs: number; color?: string }) => void
  onUpdateMoment?: (trackId: string, momentId: string, updates: { label?: string; startMs?: number; endMs?: number; color?: string }) => void
  onDeleteMoment?: (trackId: string, momentId: string) => void
  onUpdateDayNight?: (dawnSimulatedH: number, duskSimulatedH: number) => void
  onUpdateProject?: (updates: Partial<Pick<Project, 'dayNightDawnSimulatedH' | 'dayNightDuskSimulatedH' | 'dayNightNightColor' | 'dayNightDayColor' | 'dayNightLabels'>>) => void
  onAddBlock?: (block: Omit<TimelineBlock, 'id'>) => void
  onUpdateBlock?: (blockId: string, updates: Partial<Pick<TimelineBlock, 'startMs' | 'durationMs' | 'type' | 'color' | 'effectKind' | 'effectParams' | 'outputIndex'>>) => void
  onRemoveBlock?: (blockId: string) => void
  onUpdateTrackLabel?: (outputIndex: number, label: string) => void
}

const TRACK_HEADER_WIDTH = 200
const TRACK_HEIGHT = 64
const RULER_HEIGHT = 44
const TIMELINE_PADDING_X = 40
const SCROLLBAR_GUTTER = 8
const CYCLE_TRACK_ID = '__daynight__'

function buildCycleTrack(project: Project, durationMs: number): MomentTrack {
  let dawnH = project.dayNightDawnSimulatedH ?? 6
  let duskH = project.dayNightDuskSimulatedH ?? 20
  dawnH = Math.max(0.5, Math.min(23, dawnH))
  duskH = Math.max(dawnH + 0.5, Math.min(24, duskH))
  const dawnMs = (dawnH / 24) * durationMs
  const duskMs = (duskH / 24) * durationMs
  const labels = project.dayNightLabels ?? {}
  const nightColor = project.dayNightNightColor ?? '#2563eb'
  const dayColor = project.dayNightDayColor ?? '#eab308'
  return {
    id: CYCLE_TRACK_ID,
    name: 'Cycle Jour/Nuit',
    moments: [
      { id: 'dn-0', label: labels.night1 ?? 'Nuit', startMs: 0, endMs: dawnMs, color: nightColor },
      { id: 'dn-1', label: labels.day ?? 'Jour', startMs: dawnMs, endMs: duskMs, color: dayColor },
      { id: 'dn-2', label: labels.night2 ?? 'Nuit', startMs: duskMs, endMs: durationMs, color: nightColor },
    ],
  }
}

function buildOutputTracks(mod: Module): { outputIndex: number; type: 'onoff' | 'pwm' }[] {
  const board = mod.storedModuleInfo?.board ?? {}
  const chp = Math.max(0, parseInt(board['CHP'] ?? '0', 10))
  const chpwm = Math.max(0, parseInt(board['CHPWM'] ?? '0', 10))
  if (chp === 0 && chpwm === 0) {
    return [{ outputIndex: 0, type: 'onoff' }]
  }
  const tracks: { outputIndex: number; type: 'onoff' | 'pwm' }[] = []
  for (let i = 0; i < chp; i++) tracks.push({ outputIndex: i, type: 'onoff' })
  for (let i = 0; i < chpwm; i++) tracks.push({ outputIndex: chp + i, type: 'pwm' })
  return tracks
}

export function SceneTimeline({
  project,
  projectId,
  module,
  onCreateBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
  onCreateModuleBookmark,
  onUpdateModuleBookmark,
  onDeleteModuleBookmark,
  onCreateMomentTrack,
  onUpdateMomentTrack,
  onDeleteMomentTrack,
  onCreateMoment,
  onUpdateMoment,
  onDeleteMoment,
  onUpdateDayNight,
  onUpdateProject,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onUpdateTrackLabel,
}: SceneTimelineProps) {
  const { durationMinutes, dayNightDawnSimulatedH = 6, dayNightDuskSimulatedH = 20, dayNightNightColor, dayNightDayColor, dayNightLabels } = project
  const projectBookmarks = project.bookmarks ?? []
  const moduleBookmarks = module?.bookmarks ?? []
  const bookmarks = module
    ? [...projectBookmarks, ...moduleBookmarks].sort((a, b) => a.positionMs - b.positionMs)
    : projectBookmarks
  const isModuleMode = Boolean(module)
  const momentTracks = project.momentTracks ?? []
  const outputTracksOffsetY = RULER_HEIGHT + TRACK_HEIGHT + momentTracks.length * TRACK_HEIGHT
  const durationMs = durationMinutes * 60 * 1000
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const headersScrollRef = useRef<HTMLDivElement>(null)
  const isSyncingScroll = useRef(false)
  const dragScrollRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)
  const hasDragScrolledRef = useRef(false)
  const [isDragScrolling, setIsDragScrolling] = useState(false)
  const [containerWidth, setContainerWidth] = useState(800)
  const [contentClientWidth, setContentClientWidth] = useState<number | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [playheadMs, setPlayheadMs] = useState<number | null>(null)
  const [fixedPlayheadMs, setFixedPlayheadMs] = useState<number | null>(null)
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    type: 'bookmark'
    id: string
  } | { x: number; y: number; type: 'moment'; trackId: string; momentId: string } | { x: number; y: number; type: 'intention'; blockIds: string[] } | null>(null)
  const [headerAddMenu, setHeaderAddMenu] = useState<{ x: number; y: number } | null>(null)
  const [selectedMoment, setSelectedMoment] = useState<{ trackId: string; momentId: string } | null>(null)
  const [selectedIntentionIds, setSelectedIntentionIds] = useState<Set<string>>(new Set())
  const [trackAddMenu, setTrackAddMenu] = useState<{
    x: number
    y: number
    type: 'bookmark'
    positionMs: number
  } | { x: number; y: number; type: 'moment'; trackId: string; positionMs: number } | { x: number; y: number; type: 'output'; outputIndex: number; positionMs: number; trackType: 'pwm' | 'onoff' } | null>(null)
  const [durationDialog, setDurationDialog] = useState<{
    startH: number
    endH: number
    onSubmit: (startH: number, endH: number) => void
  } | null>(null)
  const [nameDialog, setNameDialog] = useState<{
    title: string
    defaultValue: string
    allowEmpty?: boolean
    onSubmit: (value: string) => void
  } | null>(null)
  const [intentionTypeDialog, setIntentionTypeDialog] = useState<{ blockIds: string[] } | null>(null)
  const [addIntentionContext, setAddIntentionContext] = useState<{ outputIndex: number; positionMs: number; trackType: 'pwm' | 'onoff' } | null>(null)
  const clipboardIntentionRef = useRef<{
    type: TimelineBlock['type']
    durationMs: number
    outputIndex: number
    color?: string
    effectKind?: import('../data/types').IntentionKind
    effectParams?: import('../data/types').IntentionParams
    trackType: 'pwm' | 'onoff'
  } | null>(null)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteGhost, setPasteGhost] = useState<{
    trackIndex: number
    outputIndex: number
    trackType: 'pwm' | 'onoff'
    ms: number
    valid: boolean
  } | null>(null)
  const [intentionDragGhost, setIntentionDragGhost] = useState<{
    block: TimelineBlock
    trackIndex: number
    outputIndex: number
    ms: number
    trackType: 'pwm' | 'onoff'
  } | null>(null)
  const [timeDivisionStep, setTimeDivisionStep] = useState<number | null>(null)
  const [timeDivisionMenuOpen, setTimeDivisionMenuOpen] = useState(false)
  const [timeDivisionMenuPos, setTimeDivisionMenuPos] = useState({ x: 0, y: 0 })
  const [showCycleBackground, setShowCycleBackground] = useState(true)
  const timeDivisionBtnRef = useRef<HTMLButtonElement>(null)
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
    const el = contentRef.current
    if (!el) return
    const updateWidth = () => setContentClientWidth(el.clientWidth)
    updateWidth()
    const ro = new ResizeObserver(updateWidth)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (isInitialFit.current) {
      isInitialFit.current = false
      setZoomLevel(1)
    }
  }, [containerWidth, durationMs])

  const fallbackContentWidth = Math.max(containerWidth - TRACK_HEADER_WIDTH - SCROLLBAR_GUTTER, 400)
  const contentWidth = contentClientWidth ?? fallbackContentWidth
  const innerWidth = Math.max(0, contentWidth - TIMELINE_PADDING_X * 2)
  const pxPerMs = pxPerMsFromZoomLevel(innerWidth, durationMs, zoomLevel)
  const totalWidthPx =
    zoomLevel === 1
      ? contentWidth
      : Math.max(innerWidth, Math.ceil(durationMs * pxPerMs)) + TIMELINE_PADDING_X * 2
  const { gridTicks, labelTicks } = computeTicks(durationMs, pxPerMs, innerWidth)
  const { gridTicks: simGridTicks, labelTicks: simLabelTicks } = computeSimulatedTicks(
    durationMs,
    pxPerMs,
    innerWidth,
    timeDivisionStep
  )

  const zoomIn = () => setZoomLevel((z) => clampZoomLevel(z * ZOOM_STEP))
  const zoomOut = () => setZoomLevel((z) => clampZoomLevel(z / ZOOM_STEP))
  const fitToView = () => setZoomLevel(1)
  const zoomPercent = Math.round(zoomLevel * 100)
  const dataContext = useContext(DataContext)
  const { undo, redo, canUndo, canRedo } = dataContext ?? { undo: () => {}, redo: () => {}, canUndo: false, canRedo: false }

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (e.deltaY > 0) setZoomLevel((z) => clampZoomLevel(z / ZOOM_STEP))
        else if (e.deltaY < 0) setZoomLevel((z) => clampZoomLevel(z * ZOOM_STEP))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const content = contentRef.current
    const headers = headersScrollRef.current
    if (!content || !headers) return
    const syncFromContent = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      headers.scrollTop = content.scrollTop
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }
    const syncFromHeaders = () => {
      if (isSyncingScroll.current) return
      isSyncingScroll.current = true
      content.scrollTop = headers.scrollTop
      requestAnimationFrame(() => { isSyncingScroll.current = false })
    }
    content.addEventListener('scroll', syncFromContent)
    headers.addEventListener('scroll', syncFromHeaders)
    return () => {
      content.removeEventListener('scroll', syncFromContent)
      headers.removeEventListener('scroll', syncFromHeaders)
    }
  }, [])

  const handleContentMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = contentRef.current
    if (!el || !pxPerMs) return
    const rect = el.getBoundingClientRect()
    const scrollLeft = el.scrollLeft
    const scrollTop = el.scrollTop
    const x = e.clientX - rect.left + scrollLeft
    const y = e.clientY - rect.top + scrollTop
    const pxFromStart = x - TIMELINE_PADDING_X
    const ms = Math.max(0, Math.min(durationMs, pxToMs(pxFromStart, pxPerMs)))
    if (pasteMode && clipboardIntentionRef.current && outputTracks.length > 0) {
      const trackIndex = Math.floor((y - outputTracksOffsetY) / TRACK_HEIGHT)
      if (trackIndex >= 0 && trackIndex < outputTracks.length) {
        const track = outputTracks[trackIndex]
        const clip = clipboardIntentionRef.current
        const effectDef = clip.effectKind ? getIntentionDef(clip.effectKind) : null
        const requiresPwm = effectDef?.requiresPwm ?? false
        const valid = track.type !== 'onoff' || !requiresPwm
        const clipDurationMs = clip.durationMs
        const centeredMs = Math.max(0, Math.min(durationMs - clipDurationMs, ms - clipDurationMs / 2))
        setPasteGhost({
          trackIndex,
          outputIndex: track.outputIndex,
          trackType: track.type,
          ms: snapToFinestGrid(centeredMs, durationMs),
          valid,
        })
      } else {
        setPasteGhost(null)
      }
    } else {
      setPlayheadMs(ms)
    }
  }

  const handleContentMouseLeave = () => {
    setPlayheadMs(null)
    if (pasteMode) setPasteGhost(null)
  }

  const handleContentMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    if (pasteMode) return
    const target = e.target as Element
    if (target.closest('.scene-timeline-block, .scene-timeline-marker, .scene-timeline-moment-resize, .scene-timeline-marker-line, .scene-timeline-marker-flag')) return
    const el = contentRef.current
    if (!el) return
    dragScrollRef.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    hasDragScrolledRef.current = false
    setIsDragScrolling(true)
    const onMouseMove = (moveEvent: MouseEvent) => {
      const d = dragScrollRef.current
      if (!d || !contentRef.current) return
      const dx = d.x - moveEvent.clientX
      const dy = d.y - moveEvent.clientY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragScrolledRef.current = true
      const el = contentRef.current
      el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, d.scrollLeft + dx))
      el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, d.scrollTop + dy))
    }
    const onMouseUp = () => {
      dragScrollRef.current = null
      setIsDragScrolling(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (hasDragScrolledRef.current) {
      hasDragScrolledRef.current = false
      return
    }
    if (pasteMode && pasteGhost && clipboardIntentionRef.current && onAddBlock && module) {
      if (!pasteGhost.valid) return
      const clip = clipboardIntentionRef.current
      const trackBlocks = module.blocks.filter((b) => (b.outputIndex ?? 0) === pasteGhost.outputIndex)
      const { startMs, durationMs: d } = findNonOverlappingSlot(
        trackBlocks,
        pasteGhost.ms,
        clip.durationMs,
        durationMs
      )
      onAddBlock({
        type: clip.type,
        startMs,
        durationMs: d,
        outputIndex: pasteGhost.outputIndex,
        color: clip.color,
        effectKind: clip.effectKind,
        effectParams: clip.effectParams,
      })
      setPasteMode(false)
      setPasteGhost(null)
      return
    }
    const ms = snapToFinestGrid(clientXToMs(e.clientX), durationMs)
    setSelectedBookmarkId(null)
    setSelectedMoment(null)
    setSelectedIntentionIds(new Set())
    setContextMenu(null)
    setTrackAddMenu(null)
    setHeaderAddMenu(null)
    setFixedPlayheadMs(ms)
  }

  const handleHeadersContextMenu = (e: React.MouseEvent) => {
    if (onCreateMomentTrack && !isModuleMode) {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu(null)
      setTrackAddMenu(null)
      setHeaderAddMenu({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMarkersTrackClick = (e: React.MouseEvent) => {
    const addBookmark = isModuleMode ? onCreateModuleBookmark : onCreateBookmark
    if (!addBookmark) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu(null)
    const ms = snapToFinestGrid(clientXToMs(e.clientX), durationMs)
    setTrackAddMenu({ x: e.clientX, y: e.clientY, type: 'bookmark', positionMs: ms })
  }

  const handleTrackAddBookmark = () => {
    if (trackAddMenu?.type === 'bookmark') {
      const positionMs = trackAddMenu.positionMs
      const addBookmark = isModuleMode ? onCreateModuleBookmark : onCreateBookmark
      if (addBookmark) {
        setTrackAddMenu(null)
        setNameDialog({
          title: 'Label du bookmark',
          defaultValue: 'Bookmark',
          onSubmit: (label) => {
            addBookmark(positionMs, label.trim() || 'Bookmark')
            setNameDialog(null)
          },
        })
      } else {
        setTrackAddMenu(null)
      }
    } else {
      setTrackAddMenu(null)
    }
  }

  const handleTrackAddMoment = () => {
    if (trackAddMenu?.type === 'moment' && onCreateMoment) {
      const { trackId, positionMs } = trackAddMenu
      setTrackAddMenu(null)
      const startMs = positionMs
      const endMs = Math.min(durationMs, positionMs + 3600000)
      setNameDialog({
        title: 'Label du moment',
        defaultValue: 'Moment',
        onSubmit: (label) => {
          onCreateMoment(trackId, { label: label.trim() || 'Moment', startMs, endMs })
          setNameDialog(null)
        },
      })
    } else {
      setTrackAddMenu(null)
    }
  }

  useEffect(() => {
    const onGlobalClick = () => {
      setContextMenu(null)
      setTrackAddMenu(null)
      setHeaderAddMenu(null)
      setTimeDivisionMenuOpen(false)
      setAddIntentionContext(null)
    }
    if (contextMenu || trackAddMenu || headerAddMenu || timeDivisionMenuOpen || addIntentionContext) {
      document.addEventListener('click', onGlobalClick)
      return () => document.removeEventListener('click', onGlobalClick)
    }
  }, [contextMenu, trackAddMenu, headerAddMenu, timeDivisionMenuOpen, addIntentionContext])

  const selectedBookmark = selectedBookmarkId ? bookmarks.find((b) => b.id === selectedBookmarkId) : null
  const selectedBookmarkIsModule = selectedBookmarkId && moduleBookmarks.some((b) => b.id === selectedBookmarkId)
  const cycleTrack = buildCycleTrack(project, durationMs)
  const allTracks = [cycleTrack, ...momentTracks]
  const selectedMomentData = selectedMoment
    ? (() => {
        const track = allTracks.find((t) => t.id === selectedMoment.trackId)
        return track?.moments.find((m) => m.id === selectedMoment.momentId)
      })()
    : null

  useEffect(() => {
    if (selectedBookmark) setFixedPlayheadMs(selectedBookmark.positionMs)
    else if (selectedMomentData) setFixedPlayheadMs(selectedMomentData.startMs)
    else if (isModuleMode && selectedIntentionIds.size > 0 && module?.blocks) {
      const blocks = module.blocks.filter((b) => selectedIntentionIds.has(b.id))
      const earliest = blocks.reduce((a, b) => (a.startMs < b.startMs ? a : b))
      setFixedPlayheadMs(earliest.startMs)
    }
  }, [selectedBookmark?.id, selectedMoment?.trackId, selectedMoment?.momentId, selectedIntentionIds, isModuleMode, module?.blocks])

  const clientXToMs = (clientX: number): number => {
    const el = contentRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left + el.scrollLeft - TIMELINE_PADDING_X
    return Math.max(0, Math.min(durationMs, pxToMs(x, pxPerMs)))
  }

  const snapPointsMs = [
    ...new Set([
      0,
      durationMs,
      ...gridTicks.map((t) => t.ms),
      ...simGridTicks.map((t) => t.ms),
    ]),
  ].sort((a, b) => a - b)

  const snapToGrid = (ms: number): number => {
    if (snapPointsMs.length === 0) return ms
    let nearest = snapPointsMs[0]
    let minDist = Math.abs(ms - nearest)
    for (const pt of snapPointsMs) {
      const d = Math.abs(ms - pt)
      if (d < minDist) {
        minDist = d
        nearest = pt
      }
    }
    return nearest
  }

  const outputTracks = module ? buildOutputTracks(module) : []

  const getOutputTrackAtClientY = useCallback(
    (clientY: number): { outputIndex: number; type: 'onoff' | 'pwm' } | null => {
      const el = contentRef.current
      if (!el || outputTracks.length === 0) return null
      const rect = el.getBoundingClientRect()
      const y = clientY - rect.top + el.scrollTop
      const trackIndex = Math.floor((y - outputTracksOffsetY) / TRACK_HEIGHT)
      if (trackIndex < 0 || trackIndex >= outputTracks.length) return null
      return outputTracks[trackIndex]
    },
    [outputTracks, outputTracksOffsetY]
  )

  const handleCopyIntention = () => {
    if (!isModuleMode || selectedIntentionIds.size !== 1 || !module) return
    const block = module.blocks.find((b) => selectedIntentionIds.has(b.id))
    if (!block) return
    const track = outputTracks.find((t) => t.outputIndex === (block.outputIndex ?? 0))
    if (!track) return
    clipboardIntentionRef.current = {
      type: block.type,
      durationMs: block.durationMs,
      outputIndex: block.outputIndex,
      color: block.color,
      effectKind: block.effectKind,
      effectParams: block.effectParams,
      trackType: track.type,
    }
  }

  const handlePasteIntention = () => {
    if (!clipboardIntentionRef.current || !isModuleMode) return
    setPasteMode(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (pasteMode) {
        e.preventDefault()
        setPasteMode(false)
        setPasteGhost(null)
      }
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isModuleMode && selectedIntentionIds.size > 0 && onRemoveBlock) {
        e.preventDefault()
        Array.from(selectedIntentionIds).forEach((id) => onRemoveBlock?.(id))
        setSelectedIntentionIds(new Set())
      }
      return
    }
    const ctrl = e.ctrlKey || e.metaKey
    if (!ctrl) return
    if (e.key === 'c') {
      if (isModuleMode && selectedIntentionIds.size === 1) {
        e.preventDefault()
        handleCopyIntention()
      }
    } else if (e.key === 'v') {
      if (isModuleMode && clipboardIntentionRef.current) {
        e.preventDefault()
        handlePasteIntention()
      }
    } else if (e.key === 'z') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) dispatchRedo()
      else dispatchUndo()
    } else if (e.key === 'y') {
      e.preventDefault()
      e.stopPropagation()
      dispatchRedo()
    } else if (e.key === 'a') {
      e.preventDefault()
      if (isModuleMode && module?.blocks && module.blocks.length > 0) {
        setSelectedBookmarkId(null)
        setSelectedMoment(null)
        setSelectedIntentionIds(new Set(module.blocks.map((b) => b.id)))
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="scene-timeline"
      role="region"
      aria-label={`Timeline de référence: ${durationMinutes} min = 24h, bookmarks, cycle jour/nuit`}
      tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      <div className="scene-timeline-toolbar">
        <div className="scene-timeline-zoom">
          <button
            type="button"
            className="scene-timeline-zoom-btn"
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_LEVEL_MIN}
            aria-label="Dézoomer"
          >
            −
          </button>
          <span className="scene-timeline-zoom-value">{zoomPercent}%</span>
          <button
            type="button"
            className="scene-timeline-zoom-btn"
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_LEVEL_MAX}
            aria-label="Zoomer"
          >
            +
          </button>
        </div>
        <button type="button" className="scene-timeline-fit-btn" onClick={fitToView}>
          Ajuster
        </button>
        {dataContext && (
          <>
            <button
              type="button"
              className="scene-timeline-header-btn"
              onClick={undo}
              disabled={!canUndo}
              title="Annuler (Ctrl+Z)"
              aria-label="Annuler"
            >
              <Undo2 size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="scene-timeline-header-btn"
              onClick={redo}
              disabled={!canRedo}
              title="Rétablir (Ctrl+Y)"
              aria-label="Rétablir"
            >
              <Redo2 size={16} strokeWidth={2} />
            </button>
          </>
        )}
        <div className="scene-timeline-time-division">
          <button
            ref={timeDivisionBtnRef}
            type="button"
            className={`scene-timeline-header-btn ${timeDivisionMenuOpen ? 'scene-timeline-header-btn-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              const rect = timeDivisionBtnRef.current?.getBoundingClientRect()
              if (rect) setTimeDivisionMenuPos({ x: rect.left, y: rect.bottom + 4 })
              setTimeDivisionMenuOpen((o) => !o)
            }}
            title="Divisions de temps"
            aria-label="Divisions de temps"
            aria-expanded={timeDivisionMenuOpen}
          >
            <Ruler size={16} strokeWidth={2} />
            <span className="scene-timeline-time-division-label">
              {timeDivisionStep === null
                ? 'Auto'
                : timeDivisionStep === 60
                  ? '1h'
                  : timeDivisionStep === 30
                    ? '30min'
                    : timeDivisionStep === 15
                      ? '15min'
                      : timeDivisionStep === 10
                        ? '10min'
                        : `${timeDivisionStep}min`}
            </span>
          </button>
          {timeDivisionMenuOpen &&
            createPortal(
              <div
                className="scene-timeline-context-menu scene-timeline-time-division-menu"
                style={{ left: timeDivisionMenuPos.x, top: timeDivisionMenuPos.y }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="scene-timeline-context-menu-item"
                  onClick={() => {
                    setTimeDivisionStep(null)
                    setTimeDivisionMenuOpen(false)
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className="scene-timeline-context-menu-item"
                  onClick={() => {
                    setTimeDivisionStep(60)
                    setTimeDivisionMenuOpen(false)
                  }}
                >
                  Toutes les heures
                </button>
                <button
                  type="button"
                  className="scene-timeline-context-menu-item"
                  onClick={() => {
                    setTimeDivisionStep(30)
                    setTimeDivisionMenuOpen(false)
                  }}
                >
                  Toutes les 30 min
                </button>
                <button
                  type="button"
                  className="scene-timeline-context-menu-item"
                  onClick={() => {
                    setTimeDivisionStep(15)
                    setTimeDivisionMenuOpen(false)
                  }}
                >
                  Toutes les 15 min
                </button>
                <button
                  type="button"
                  className="scene-timeline-context-menu-item"
                  onClick={() => {
                    setTimeDivisionStep(10)
                    setTimeDivisionMenuOpen(false)
                  }}
                >
                  Toutes les 10 min
                </button>
              </div>,
              document.body
            )}
        </div>
        {isModuleMode && (
          <button
            type="button"
            className={`scene-timeline-header-btn ${showCycleBackground ? 'scene-timeline-header-btn-active' : ''}`}
            onClick={() => setShowCycleBackground((v) => !v)}
            title={showCycleBackground ? 'Masquer le cycle jour/nuit' : 'Afficher le cycle jour/nuit'}
            aria-label={showCycleBackground ? 'Masquer le cycle jour/nuit' : 'Afficher le cycle jour/nuit'}
          >
            <SunMoon size={16} strokeWidth={2} />
            Cycle
          </button>
        )}
        {isModuleMode && module?.blocks && module.blocks.length > 0 && (
          <button
            type="button"
            className="scene-timeline-header-btn"
            onClick={() => {
              setSelectedBookmarkId(null)
              setSelectedMoment(null)
              setSelectedIntentionIds(new Set(module.blocks!.map((b) => b.id)))
            }}
            title="Tout sélectionner (Ctrl+A)"
            aria-label="Tout sélectionner"
          >
            <Square size={16} strokeWidth={2} />
            Tout sélectionner
          </button>
        )}
        {onCreateMomentTrack && !isModuleMode && (
          <button
            type="button"
            className="scene-timeline-header-btn"
            onClick={() => {
              setNameDialog({
                title: 'Nom de la piste Moments',
                defaultValue: 'Moments',
                onSubmit: (name) => {
                  if (name) onCreateMomentTrack(name)
                  setNameDialog(null)
                },
              })
            }}
            aria-label="Ajouter une piste Moments"
          >
            <Plus size={14} strokeWidth={2} aria-hidden />
            Piste Moments
          </button>
        )}
        <span className="scene-timeline-scale-hint" title="Maintenir Ctrl (ou Cmd) et utiliser la molette pour zoomer">
          {durationMinutes} min = 24h. Ctrl+molette.
        </span>
        {pasteMode && clipboardIntentionRef.current && (
          <span className="scene-timeline-paste-hint">
            Cliquez pour placer. Échap pour annuler.
            {pasteGhost && !pasteGhost.valid && (
              <span className="scene-timeline-paste-invalid">
                Cet effet nécessite une sortie PWM
              </span>
            )}
          </span>
        )}
        {fixedPlayheadMs !== null && (
          <span className="scene-timeline-fixed-playhead-label" title="Position de selection">
            {isModuleMode && selectedIntentionIds.size > 0 && module?.blocks ? (
              (() => {
                const blocks = module.blocks.filter((b) => selectedIntentionIds.has(b.id))
                const startMs = Math.min(...blocks.map((b) => b.startMs))
                const endMs = Math.max(...blocks.map((b) => b.startMs + b.durationMs))
                const durationMsSel = endMs - startMs
                const startSimH = projectMsToSimulatedH(startMs, durationMs)
                const durationSimH = durationMsToSimulatedH(durationMsSel, durationMs)
                return (
                  <>
                    Début: {formatDurationMs(startMs)} | {formatSimulatedH(startSimH)}
                    {' · '}
                    Durée réelle: {formatDurationMs(durationMsSel)}
                    {' · '}
                    Durée simulée: {formatSimulatedH(durationSimH)}
                  </>
                )
              })()
            ) : selectedMomentData ? (
              (() => {
                const m = selectedMomentData
                const dur = m.endMs - m.startMs
                const startSimH = projectMsToSimulatedH(m.startMs, durationMs)
                const durSimH = durationMsToSimulatedH(dur, durationMs)
                return (
                  <>
                    Début: {formatDurationMs(m.startMs)} | {formatSimulatedH(startSimH)}
                    {' · '}
                    Durée réelle: {formatDurationMs(dur)}
                    {' · '}
                    Durée simulée: {formatSimulatedH(durSimH)}
                  </>
                )
              })()
            ) : (
              <>
                {`${Math.floor(fixedPlayheadMs / 60000)}m ${Math.floor((fixedPlayheadMs % 60000) / 1000)}s | ${formatSimulatedH(projectMsToSimulatedH(fixedPlayheadMs, durationMs))}`}
              </>
            )}
          </span>
        )}
        {(selectedBookmark || selectedMomentData || (isModuleMode && selectedIntentionIds.size > 0)) && (
          <div className="scene-timeline-selection-actions">
            {selectedBookmark ? (
              (() => {
                const updateBm = selectedBookmarkIsModule ? onUpdateModuleBookmark : onUpdateBookmark
                const deleteBm = selectedBookmarkIsModule ? onDeleteModuleBookmark : onDeleteBookmark
                const bid = selectedBookmark.id
                return (
                  <>
                    <span className="scene-timeline-selection-label">Bookmark: {selectedBookmark.label}</span>
                    {updateBm && (
                      <button
                        type="button"
                        className="scene-timeline-action-btn-icon"
                        onClick={() => {
                          setNameDialog({
                            title: 'Renommer',
                            defaultValue: selectedBookmark.label,
                            onSubmit: (val) => {
                              if (bid) updateBm(bid, { label: val })
                              setNameDialog(null)
                            },
                          })
                        }}
                        title="Renommer"
                        aria-label="Renommer"
                      >
                        <Pencil size={16} strokeWidth={2} />
                      </button>
                    )}
                    {deleteBm && (
                      <button
                        type="button"
                        className="scene-timeline-action-btn-icon scene-timeline-action-btn-icon-danger"
                        onClick={() => {
                          if (selectedBookmarkId) {
                            deleteBm(selectedBookmarkId)
                            setSelectedBookmarkId(null)
                          }
                        }}
                        title="Supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={16} strokeWidth={2} />
                      </button>
                    )}
                  </>
                )
              })()
            ) : selectedMoment && selectedMomentData && !isModuleMode ? (() => {
              const m = selectedMomentData
              const projDurationMs = durationMinutes * 60 * 1000
              const startH = (m.startMs / projDurationMs) * 24
              const endH = (m.endMs / projDurationMs) * 24
              const isCycleTrack = selectedMoment.trackId === CYCLE_TRACK_ID
              return (
                <>
                  <span className="scene-timeline-selection-label">Moment: {m.label}</span>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon"
                    onClick={() => {
                      if (isCycleTrack && onUpdateProject) {
                        const labels = project.dayNightLabels ?? {}
                        const key = selectedMoment.momentId === 'dn-0' ? 'night1' : selectedMoment.momentId === 'dn-1' ? 'day' : 'night2'
                        setNameDialog({
                          title: 'Renommer',
                          defaultValue: m.label,
                          onSubmit: (val) => {
                            if (val.trim()) onUpdateProject({ dayNightLabels: { ...labels, [key]: val.trim() } })
                            setNameDialog(null)
                          },
                        })
                      } else if (!isCycleTrack && onUpdateMoment) {
                        setNameDialog({
                          title: 'Renommer',
                          defaultValue: m.label,
                          onSubmit: (val) => {
                            if (val.trim()) onUpdateMoment(selectedMoment.trackId, selectedMoment.momentId, { label: val.trim() })
                            setNameDialog(null)
                          },
                        })
                      }
                    }}
                    title="Renommer"
                    aria-label="Renommer"
                  >
                    <Pencil size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon"
                    onClick={() => {
                      if (isCycleTrack && onUpdateDayNight) {
                        setDurationDialog({
                          startH: dayNightDawnSimulatedH,
                          endH: dayNightDuskSimulatedH,
                          onSubmit: (dawnH, duskH) => {
                            onUpdateDayNight(dawnH, duskH)
                            setDurationDialog(null)
                          },
                        })
                      } else if (!isCycleTrack && onUpdateMoment) {
                        setDurationDialog({
                          startH,
                          endH,
                          onSubmit: (startHNum, endHNum) => {
                            const newStartMs = (startHNum / 24) * projDurationMs
                            const newEndMs = (endHNum / 24) * projDurationMs
                            if (endHNum > startHNum && newEndMs - newStartMs >= 60000) {
                              onUpdateMoment(selectedMoment.trackId, selectedMoment.momentId, { startMs: newStartMs, endMs: newEndMs })
                            }
                            setDurationDialog(null)
                          },
                        })
                      }
                    }}
                    title="Modifier la duree"
                    aria-label="Modifier la duree"
                  >
                    <Clock size={16} strokeWidth={2} />
                  </button>
                  {!isCycleTrack && onDeleteMoment && (
                    <button
                      type="button"
                      className="scene-timeline-action-btn-icon scene-timeline-action-btn-icon-danger"
                      onClick={() => {
                        onDeleteMoment(selectedMoment.trackId, selectedMoment.momentId)
                        setSelectedMoment(null)
                      }}
                      title="Supprimer"
                      aria-label="Supprimer"
                    >
                      <Trash2 size={16} strokeWidth={2} />
                    </button>
                    )}
                  </>
                )
              })(              ) : isModuleMode && selectedIntentionIds.size > 0 ? (
                <>
                  <span className="scene-timeline-selection-label">
                    {selectedIntentionIds.size} intention{selectedIntentionIds.size > 1 ? 's' : ''} sélectionnée{selectedIntentionIds.size > 1 ? 's' : ''}
                  </span>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon"
                    onClick={handleCopyIntention}
                    disabled={selectedIntentionIds.size !== 1}
                    title={selectedIntentionIds.size !== 1 ? 'Copier une seule intention' : 'Copier (Ctrl+C)'}
                    aria-label="Copier"
                  >
                    <Copy size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon"
                    onClick={() => setIntentionTypeDialog({ blockIds: [...selectedIntentionIds] })}
                    title="Modifier l'intention"
                    aria-label="Modifier l'intention"
                  >
                    <Pencil size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon"
                    onClick={() => {
                      const input = document.createElement('input')
                      input.type = 'color'
                      const block = module?.blocks.find((b) => selectedIntentionIds.has(b.id))
                      input.value = block?.color || '#5fd68a'
                      input.style.position = 'absolute'
                      input.style.opacity = '0'
                      input.style.pointerEvents = 'none'
                      document.body.appendChild(input)
                      input.onchange = () => {
                        selectedIntentionIds.forEach((id) => onUpdateBlock?.(id, { color: input.value }))
                        document.body.removeChild(input)
                      }
                      input.onblur = () => {
                        if (document.body.contains(input)) document.body.removeChild(input)
                      }
                      input.click()
                    }}
                    title="Changer la couleur"
                    aria-label="Changer la couleur"
                  >
                    <Palette size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="scene-timeline-action-btn-icon scene-timeline-action-btn-icon-danger"
                    onClick={() => {
                      [...selectedIntentionIds].forEach((id) => onRemoveBlock?.(id))
                      setSelectedIntentionIds(new Set())
                    }}
                    title="Supprimer"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                </>
              ) : null}
          </div>
        )}
      </div>

      <div className="scene-timeline-body">
        <div
          className="scene-timeline-headers"
          style={{ width: TRACK_HEADER_WIDTH }}
          onContextMenu={handleHeadersContextMenu}
        >
          <div className="scene-timeline-ruler-spacer" style={{ height: RULER_HEIGHT }} />
          <div
            ref={headersScrollRef}
            className="scene-timeline-headers-scroll"
          >
          <div
            className="scene-timeline-track-label scene-timeline-track-label-markers"
            style={{ height: TRACK_HEIGHT }}
          >
            <span className="scene-timeline-track-name">Markers</span>
            <div className="scene-timeline-track-actions">
              <span className="scene-timeline-track-action scene-timeline-track-action-locked" title="Non modifiable">
                <Lock size={12} strokeWidth={2} />
              </span>
            </div>
          </div>
          {!isModuleMode && (
            <div
              className="scene-timeline-track-label scene-timeline-track-label-cycle"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="scene-timeline-track-name">Cycle Jour/Nuit</span>
              <div className="scene-timeline-track-actions">
                <span className="scene-timeline-track-action scene-timeline-track-action-locked" title="Piste non supprimable ni renommable">
                  <Lock size={12} strokeWidth={2} />
                </span>
              </div>
            </div>
          )}
          {momentTracks.map((track) => (
            <div
              key={track.id}
              className="scene-timeline-track-label"
              style={{ height: TRACK_HEIGHT }}
            >
              <span className="scene-timeline-track-name">{track.name}</span>
              <div className="scene-timeline-track-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="scene-timeline-track-action scene-timeline-track-action-btn"
                  onClick={() => {
                    setNameDialog({
                      title: 'Nom de la piste',
                      defaultValue: track.name,
                      onSubmit: (name) => {
                        if (name) onUpdateMomentTrack?.(track.id, { name })
                        setNameDialog(null)
                      },
                    })
                  }}
                  title="Modifier"
                  aria-label="Modifier"
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className="scene-timeline-track-action scene-timeline-track-action-btn scene-timeline-track-action-danger"
                  onClick={() => {
                    if (confirm(`Supprimer la piste "${track.name}" ?`)) onDeleteMomentTrack?.(track.id)
                  }}
                  title="Supprimer"
                  aria-label="Supprimer"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
          {module && (() => {
            const outputTracks = buildOutputTracks(module)
            const labels = module.outputTrackLabels ?? {}
            return outputTracks.map((t) => {
              const typeLabel = t.type === 'onoff' ? 'On/Off' : 'PWM'
              const custom = labels[t.outputIndex]
              const displayName = custom || `Sortie ${t.outputIndex + 1}`
              const subline = `Sortie ${t.outputIndex + 1} | ${typeLabel}`
              return (
                <div key={t.outputIndex} className="scene-timeline-track-label scene-timeline-track-label-output" style={{ height: TRACK_HEIGHT }}>
                  <span className="scene-timeline-track-name">
                    <span className="scene-timeline-track-name-main">{displayName}</span>
                    <span className="scene-timeline-track-name-sub">{subline}</span>
                  </span>
                  {onUpdateTrackLabel && (
                    <button
                      type="button"
                      className="scene-timeline-track-action scene-timeline-track-action-btn"
                      onClick={() => {
                        setNameDialog({
                          title: 'Nom de la sortie',
                          defaultValue: labels[t.outputIndex] ?? '',
                          allowEmpty: true,
                          onSubmit: (value) => {
                            onUpdateTrackLabel(t.outputIndex, value.trim())
                            setNameDialog(null)
                          },
                        })
                      }}
                      title="Modifier"
                      aria-label={`Modifier le nom de la sortie ${t.outputIndex + 1}`}
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              )
            })
          })()}
          </div>
        </div>

        <div
          ref={contentRef}
          className={`scene-timeline-content ${isDragScrolling ? 'scene-timeline-content-dragging' : ''} ${pasteMode ? 'scene-timeline-content-paste' : ''}`}
          onMouseMove={handleContentMouseMove}
          onMouseLeave={handleContentMouseLeave}
          onMouseDown={handleContentMouseDown}
        >
          <div
            className="scene-timeline-canvas"
            style={{
              width: totalWidthPx,
              minHeight: RULER_HEIGHT + TRACK_HEIGHT * (1 + (isModuleMode ? 0 : 1) + momentTracks.length + (module ? buildOutputTracks(module).length : 0)),
            }}
            onClick={handleCanvasClick}
          >
            <div
              className="scene-timeline-ruler scene-timeline-ruler-sticky"
              style={{ width: totalWidthPx, height: RULER_HEIGHT }}
            >
              <div className="scene-timeline-ruler-project">
                {labelTicks.map((t) => (
                  <div
                    key={t.ms}
                    className={`scene-timeline-tick ${t.major ? 'scene-timeline-tick-major' : ''}`}
                    style={{ left: TIMELINE_PADDING_X + msToPx(t.ms, pxPerMs) }}
                  >
                    <span className="scene-timeline-tick-label">{t.label}</span>
                  </div>
                ))}
              </div>
              <div className="scene-timeline-ruler-simulated">
                {simLabelTicks.map((t) => (
                  <div
                    key={`${t.ms}-${t.label}`}
                    className={`scene-timeline-tick scene-timeline-tick-simulated ${t.major ? 'scene-timeline-tick-major' : ''}`}
                    style={{ left: TIMELINE_PADDING_X + msToPx(t.ms, pxPerMs) }}
                  >
                    <span className="scene-timeline-tick-label">{t.label}</span>
                  </div>
                ))}
              </div>
            </div>

          <div className="scene-timeline-grid scene-timeline-grid-simulated" aria-hidden="true">
            {simGridTicks.map((t) => (
              <div
                key={`sim-${t.ms}`}
                className={`scene-timeline-grid-line scene-timeline-grid-line-simulated ${t.major ? 'scene-timeline-grid-line-simulated-major' : ''}`}
                style={{ left: TIMELINE_PADDING_X + msToPx(t.ms, pxPerMs) }}
              />
            ))}
          </div>
          <div className="scene-timeline-bookmark-guides" aria-hidden="true">
            {bookmarks.map((bm) => (
              <div
                key={bm.id}
                className="scene-timeline-bookmark-guide"
                style={{
                  left: TIMELINE_PADDING_X + msToPx(bm.positionMs, pxPerMs),
                  borderLeftColor: bm.color || 'var(--accent-primary)',
                }}
              />
            ))}
          </div>
          {isModuleMode && showCycleBackground && (
            <div className="scene-timeline-cycle-background" aria-hidden="true">
              {cycleTrack.moments.map((m) => (
                <div
                  key={m.id}
                  className="scene-timeline-cycle-background-block"
                  style={{
                    left: TIMELINE_PADDING_X + msToPx(m.startMs, pxPerMs),
                    width: Math.max(2, msToPx(m.endMs - m.startMs, pxPerMs)),
                    backgroundColor: m.color ?? 'var(--bg-surface)',
                  }}
                />
              ))}
            </div>
          )}
          <div className="scene-timeline-tracks">
            <div
              className="scene-timeline-track scene-timeline-track-markers"
              style={{ width: totalWidthPx, height: TRACK_HEIGHT }}
              onContextMenu={handleMarkersTrackClick}
            >
              {(() => {
                const CLUSTER_PX = 28
                const sorted = [...bookmarks].sort((a, b) => a.positionMs - b.positionMs)
                const clusters: { bm: Bookmark; slotIndex: number; slotCount: number }[] = []
                let cluster: Bookmark[] = []
                let clusterStartPx = 0
                for (const bm of sorted) {
                  const px = msToPx(bm.positionMs, pxPerMs)
                  if (cluster.length === 0 || px - clusterStartPx < CLUSTER_PX) {
                    cluster.push(bm)
                    if (cluster.length === 1) clusterStartPx = px
                  } else {
                    const count = Math.min(cluster.length, 3)
                    cluster.forEach((c, i) =>
                      clusters.push({ bm: c, slotIndex: Math.min(i, count - 1), slotCount: count })
                    )
                    cluster = [bm]
                    clusterStartPx = px
                  }
                }
                if (cluster.length > 0) {
                  const count = Math.min(cluster.length, 3)
                  cluster.forEach((c, i) =>
                    clusters.push({ bm: c, slotIndex: Math.min(i, count - 1), slotCount: count })
                  )
                }
                const updateBookmark = isModuleMode
                  ? (id: string, updates: { positionMs?: number }) => onUpdateModuleBookmark?.(id, updates)
                  : (id: string, updates: { positionMs?: number }) => onUpdateBookmark?.(id, updates)
                const isEditable = (bm: Bookmark) =>
                  !isModuleMode || moduleBookmarks.some((mb) => mb.id === bm.id)
                return clusters.map(({ bm, slotIndex, slotCount }) => (
                  <BookmarkMarker
                    key={bm.id}
                    bookmark={bm}
                    slotIndex={slotIndex}
                    slotCount={slotCount}
                    staggerOffsetPx={slotCount > 1 ? slotIndex * 8 : 0}
                    trackHeight={TRACK_HEIGHT}
                    pxPerMs={pxPerMs}
                    paddingX={TIMELINE_PADDING_X}
                    durationMs={durationMs}
                    selected={selectedBookmarkId === bm.id}
                    editable={isEditable(bm)}
                    onSelect={(e) => {
                      e.stopPropagation()
                      setSelectedBookmarkId(bm.id)
                      setSelectedMoment(null)
                    }}
                    onUpdatePosition={isEditable(bm) ? (positionMs) => updateBookmark(bm.id, { positionMs }) : undefined}
                    onContextMenu={
                      isEditable(bm)
                        ? (e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'bookmark', id: bm.id })
                            setSelectedBookmarkId(bm.id)
                            setSelectedMoment(null)
                          }
                        : undefined
                    }
                    clientXToMs={clientXToMs}
                    snapToGrid={snapToGrid}
                  />
                ))
              })()}
            </div>
            {!isModuleMode && (
              <MomentTrackRow
                key={CYCLE_TRACK_ID}
                track={cycleTrack}
                pxPerMs={pxPerMs}
                paddingX={TIMELINE_PADDING_X}
                totalWidthPx={totalWidthPx}
                trackHeight={TRACK_HEIGHT}
                durationMs={durationMs}
                selectedMomentId={selectedMoment?.trackId === CYCLE_TRACK_ID ? selectedMoment.momentId : null}
                editable={true}
                onTrackClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedMoment(null); }}
                onSelect={(momentId, e) => {
                  e.stopPropagation()
                  setSelectedMoment({ trackId: CYCLE_TRACK_ID, momentId })
                  setSelectedBookmarkId(null)
                }}
                onUpdate={(momentId, updates) => {
                  if (!onUpdateDayNight) return
                  const dawnMs = (dayNightDawnSimulatedH / 24) * durationMs
                  const duskMs = (dayNightDuskSimulatedH / 24) * durationMs
                  let newDawn = dawnMs
                  let newDusk = duskMs
                  if (momentId === 'dn-0' && updates.endMs !== undefined) newDawn = updates.endMs
                  else if (momentId === 'dn-1') {
                    if (updates.startMs !== undefined) newDawn = updates.startMs
                    if (updates.endMs !== undefined) newDusk = updates.endMs
                  } else if (momentId === 'dn-2' && updates.startMs !== undefined) newDusk = updates.startMs
                  const minBlockMs = durationMs / 24
                  newDawn = Math.max(0, Math.min(newDusk - minBlockMs, newDawn))
                  newDusk = Math.max(newDawn + minBlockMs, Math.min(durationMs, newDusk))
                  onUpdateDayNight((newDawn / durationMs) * 24, (newDusk / durationMs) * 24)
                }}
                onContextMenu={(momentId, e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, type: 'moment', trackId: CYCLE_TRACK_ID, momentId })
                  setSelectedMoment({ trackId: CYCLE_TRACK_ID, momentId })
                  setSelectedBookmarkId(null)
                }}
                clientXToMs={clientXToMs}
                snapToGrid={snapToGrid}
              />
            )}
            {momentTracks.map((track) => (
              <MomentTrackRow
                key={track.id}
                track={track}
                pxPerMs={pxPerMs}
                paddingX={TIMELINE_PADDING_X}
                totalWidthPx={totalWidthPx}
                trackHeight={TRACK_HEIGHT}
                durationMs={durationMs}
                selectedMomentId={selectedMoment?.trackId === track.id ? selectedMoment.momentId : null}
                editable={!isModuleMode}
                onTrackClick={(e) => {
                  if (onCreateMoment && !isModuleMode && track.id) {
                    e.preventDefault()
                    e.stopPropagation()
                    const ms = snapToFinestGrid(clientXToMs(e.clientX), durationMs)
                    setTrackAddMenu({ x: e.clientX, y: e.clientY, type: 'moment', trackId: track.id, positionMs: ms })
                  }
                }}
                onSelect={(momentId, e) => {
                  e.stopPropagation()
                  setSelectedMoment({ trackId: track.id, momentId })
                  setSelectedBookmarkId(null)
                }}
                onUpdate={(momentId, updates) => onUpdateMoment?.(track.id, momentId, updates)}
                onContextMenu={(momentId, e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, type: 'moment', trackId: track.id, momentId })
                  setSelectedMoment({ trackId: track.id, momentId })
                  setSelectedBookmarkId(null)
                }}
                clientXToMs={clientXToMs}
                snapToGrid={snapToGrid}
              />
            ))}
            {module &&
              buildOutputTracks(module).map((t) => {
                const trackBlocks = module.blocks.filter((b) => (b.outputIndex ?? 0) === t.outputIndex)
                return (
                  <div
                    key={t.outputIndex}
                    className="scene-timeline-track scene-timeline-track-output"
                    style={{ width: totalWidthPx, height: TRACK_HEIGHT }}
                    onContextMenu={(e) => {
                      if (onAddBlock) {
                        e.preventDefault()
                        e.stopPropagation()
                        const ms = snapToFinestGrid(clientXToMs(e.clientX), durationMs)
                        setTrackAddMenu({ x: e.clientX, y: e.clientY, type: 'output', outputIndex: t.outputIndex, positionMs: ms, trackType: t.type })
                      }
                    }}
                  >
                    <div className="scene-timeline-track-blocks">
                      {trackBlocks.map((block) => (
                        <IntentionBlock
                          key={block.id}
                          block={block}
                          otherBlocksOnTrack={trackBlocks}
                          pxPerMs={pxPerMs}
                          paddingX={TIMELINE_PADDING_X}
                          durationMs={durationMs}
                          selected={selectedIntentionIds.has(block.id)}
                          onSelect={(addToSelection) => {
                            setSelectedIntentionIds((prev) => {
                              const next = new Set(prev)
                              if (addToSelection) {
                                if (next.has(block.id)) next.delete(block.id)
                                else next.add(block.id)
                              } else {
                                return next.has(block.id) && next.size === 1 ? new Set() : new Set([block.id])
                              }
                              return next
                            })
                          }}
                          onUpdate={(updates) => {
                            if (updates.outputIndex !== undefined && updates.outputIndex !== (block.outputIndex ?? 0)) {
                              const targetBlocks = module.blocks.filter((b) => (b.outputIndex ?? 0) === updates.outputIndex && b.id !== block.id)
                              const { startMs } = findNonOverlappingSlot(targetBlocks, updates.startMs ?? block.startMs, block.durationMs, durationMs)
                              onUpdateBlock?.(block.id, { startMs, outputIndex: updates.outputIndex })
                            } else {
                              onUpdateBlock?.(block.id, updates)
                            }
                          }}
                          currentOutputIndex={t.outputIndex}
                          currentTrackType={t.type}
                          outputTracks={outputTracks}
                          getOutputTrackAtClientY={getOutputTrackAtClientY}
                          onDragStart={(b) => setIntentionDragGhost({ block: b, trackIndex: outputTracks.findIndex((ot) => ot.outputIndex === t.outputIndex), outputIndex: t.outputIndex, ms: b.startMs, trackType: t.type })}
                          onDragMove={(clientX, clientY, ms) => {
                            const track = getOutputTrackAtClientY(clientY)
                            const newMs = snapToFinestGrid(ms, durationMs)
                            setIntentionDragGhost((prev) => {
                              if (!prev || prev.block.id !== block.id) return prev
                              if (track && track.type === t.type) {
                                const trackIndex = outputTracks.findIndex((ot) => ot.outputIndex === track.outputIndex)
                                return { ...prev, trackIndex, outputIndex: track.outputIndex, ms: newMs, trackType: track.type }
                              }
                              return { ...prev, ms: newMs }
                            })
                          }}
                          onDragEnd={() => setIntentionDragGhost(null)}
                          isDragging={intentionDragGhost?.block.id === block.id}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setSelectedIntentionIds((prev) => {
                              const next = new Set(prev)
                              if (!next.has(block.id)) next.add(block.id)
                              return next
                            })
                            setContextMenu({ x: e.clientX, y: e.clientY, type: 'intention', blockIds: selectedIntentionIds.has(block.id) ? [...selectedIntentionIds] : [...selectedIntentionIds, block.id] })
                          }}
                          clientXToMs={clientXToMs}
                          snapToGrid={snapToGrid}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
          </div>
            {pasteMode && pasteGhost && clipboardIntentionRef.current && (
              <div
                className={`scene-timeline-paste-ghost ${pasteGhost.valid ? '' : 'scene-timeline-paste-ghost-invalid'}`}
                style={{
                  top: outputTracksOffsetY + pasteGhost.trackIndex * TRACK_HEIGHT,
                  left: TIMELINE_PADDING_X + msToPx(pasteGhost.ms, pxPerMs),
                  width: Math.max(8, msToPx(clipboardIntentionRef.current.durationMs, pxPerMs)),
                  height: TRACK_HEIGHT,
                  ...(clipboardIntentionRef.current.color && { backgroundColor: clipboardIntentionRef.current.color }),
                }}
                aria-hidden
              />
            )}
            {intentionDragGhost && (
              <div
                className="scene-timeline-paste-ghost"
                style={{
                  top: outputTracksOffsetY + intentionDragGhost.trackIndex * TRACK_HEIGHT,
                  left: TIMELINE_PADDING_X + msToPx(intentionDragGhost.ms, pxPerMs),
                  width: Math.max(8, msToPx(intentionDragGhost.block.durationMs, pxPerMs)),
                  height: TRACK_HEIGHT,
                  ...(intentionDragGhost.block.color && { backgroundColor: intentionDragGhost.block.color }),
                }}
                aria-hidden
              />
            )}
            {playheadMs !== null && (
              <div
                className="scene-timeline-playhead"
                style={{ left: TIMELINE_PADDING_X + msToPx(playheadMs, pxPerMs) }}
                aria-hidden
              />
            )}
            {fixedPlayheadMs !== null && (
              <div
                className="scene-timeline-playhead scene-timeline-playhead-fixed"
                style={{ left: TIMELINE_PADDING_X + msToPx(fixedPlayheadMs, pxPerMs) }}
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>

      <p className="scene-timeline-legend">
        Temps projet (min) | Jour simulé (24h). {DURATION_MIN}-{DURATION_MAX} min = une journée.
      </p>

      {headerAddMenu && onCreateMomentTrack && createPortal(
        <div
          className="scene-timeline-context-menu scene-timeline-track-add-menu"
          style={{ left: headerAddMenu.x, top: headerAddMenu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          <button
            type="button"
            className="scene-timeline-context-menu-item"
            onClick={() => {
              setHeaderAddMenu(null)
              setNameDialog({
                title: 'Nom de la piste Moments',
                defaultValue: 'Moments',
                onSubmit: (name) => {
                  if (name) onCreateMomentTrack(name)
                  setNameDialog(null)
                },
              })
            }}
          >
            <Plus size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Ajouter piste Moments
          </button>
        </div>,
        document.body
      )}
      {trackAddMenu && createPortal(
        <div
          className="scene-timeline-context-menu scene-timeline-track-add-menu"
          style={{ left: trackAddMenu.x, top: trackAddMenu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {trackAddMenu.type === 'bookmark' && (
            <button
              type="button"
              className="scene-timeline-context-menu-item"
              onClick={handleTrackAddBookmark}
            >
              <MapPin size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Ajouter un bookmark
            </button>
          )}
          {trackAddMenu.type === 'moment' && (
            <button
              type="button"
              className="scene-timeline-context-menu-item"
              onClick={handleTrackAddMoment}
            >
              <Timer size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Ajouter un moment
            </button>
          )}
          {trackAddMenu.type === 'output' && onAddBlock && module && (
            <button
              type="button"
              className="scene-timeline-context-menu-item"
              onClick={() => {
                if (trackAddMenu.type === 'output') {
                  setAddIntentionContext({ outputIndex: trackAddMenu.outputIndex, positionMs: trackAddMenu.positionMs, trackType: trackAddMenu.trackType })
                }
                setTrackAddMenu(null)
              }}
            >
              <Plus size={14} strokeWidth={2} style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Ajouter une intention
            </button>
          )}
        </div>,
        document.body
      )}
      {contextMenu && createPortal(
        <ContextMenu
          contextMenu={contextMenu}
          project={project}
          onClose={() => setContextMenu(null)}
          onDeleteBookmark={(id) => {
            const isMod = moduleBookmarks.some((b) => b.id === id)
            ;(isMod ? onDeleteModuleBookmark : onDeleteBookmark)?.(id)
            setSelectedBookmarkId(null)
            setContextMenu(null)
          }}
          onDeleteMoment={(trackId, momentId) => {
            onDeleteMoment?.(trackId, momentId)
            setSelectedMoment(null)
            setContextMenu(null)
          }}
          onUpdateBookmark={(id, updates) => {
            const isMod = moduleBookmarks.some((b) => b.id === id)
            ;(isMod ? onUpdateModuleBookmark : onUpdateBookmark)?.(id, updates)
          }}
          onUpdateMoment={(trackId, momentId, updates) => onUpdateMoment?.(trackId, momentId, updates)}
          onRemoveBlock={onRemoveBlock}
          onRemoveIntentionBlocks={(blockIds) => {
            blockIds.forEach((id) => onRemoveBlock?.(id))
            setSelectedIntentionIds(new Set())
          }}
          onUpdateBlock={onUpdateBlock}
          onOpenIntentionTypeDialog={(blockIds) => setIntentionTypeDialog({ blockIds })}
          onUpdateProject={onUpdateProject}
          onOpenNameDialog={(config) => {
            setContextMenu(null)
            setNameDialog(config)
          }}
          onOpenDurationDialog={(config) => {
            setContextMenu(null)
            setDurationDialog(config)
          }}
        />,
        document.body
      )}
      {nameDialog && (
        <NameEditDialog
          open
          title={nameDialog.title}
          defaultValue={nameDialog.defaultValue}
          allowEmpty={nameDialog.allowEmpty}
          onConfirm={(v) => {
            nameDialog.onSubmit(v)
            setNameDialog(null)
          }}
          onCancel={() => setNameDialog(null)}
        />
      )}
      {addIntentionContext && onAddBlock && module && createPortal(
        <IntentionPickerDialog
          open
          mode="add"
          trackType={addIntentionContext.trackType}
          projectDurationMs={durationMs}
          getSlotForDuration={(d) => {
            const trackBlocks = module.blocks.filter((b) => (b.outputIndex ?? 0) === addIntentionContext.outputIndex)
            return findNonOverlappingSlot(trackBlocks, addIntentionContext.positionMs, d, durationMs)
          }}
          onConfirm={(kind, params, slot) => {
            const trackBlocks = module.blocks.filter((b) => (b.outputIndex ?? 0) === addIntentionContext.outputIndex)
            const { startMs, durationMs: d } = slot ?? findNonOverlappingSlot(trackBlocks, addIntentionContext.positionMs, 5000, durationMs)
            const type = intentionKindToType(kind)
            onAddBlock({
              type,
              startMs,
              durationMs: d,
              outputIndex: addIntentionContext.outputIndex,
              effectKind: kind,
              effectParams: Object.keys(params).length > 0 ? params : undefined,
            })
            setAddIntentionContext(null)
          }}
          onCancel={() => setAddIntentionContext(null)}
        />,
        document.body
      )}
      {intentionTypeDialog && (
        <IntentionPickerDialog
          open
          mode="modify"
          intentionDurationMs={(() => {
            const blocks = module?.blocks.filter((b) => intentionTypeDialog.blockIds.includes(b.id)) ?? []
            if (blocks.length === 0) return undefined
            return Math.min(...blocks.map((b) => b.durationMs))
          })()}
          trackType={(() => {
            const blocks = module?.blocks.filter((b) => intentionTypeDialog.blockIds.includes(b.id)) ?? []
            for (const block of blocks) {
              const track = outputTracks.find((t) => t.outputIndex === (block.outputIndex ?? 0))
              if (track?.type === 'onoff') return 'onoff'
            }
            return 'pwm'
          })()}
          projectDurationMs={durationMs}
          blockIds={intentionTypeDialog.blockIds}
          initialKind={(() => {
            const block = module?.blocks.find((b) => intentionTypeDialog.blockIds.includes(b.id))
            return block ? blockToIntentionKind(block) : undefined
          })()}
          initialParams={(() => {
            const block = module?.blocks.find((b) => intentionTypeDialog.blockIds.includes(b.id))
            return block?.effectParams ?? {}
          })()}
          onConfirm={(kind, params) => {
            const type = intentionKindToType(kind)
            intentionTypeDialog.blockIds.forEach((id) =>
              onUpdateBlock?.(id, {
                type,
                effectKind: kind,
                effectParams: Object.keys(params).length > 0 ? params : undefined,
              })
            )
            setIntentionTypeDialog(null)
          }}
          onCancel={() => setIntentionTypeDialog(null)}
        />
      )}
      {durationDialog && (
        <DurationEditDialog
          open
          title="Modifier la duree"
          defaultStartH={durationDialog.startH}
          defaultEndH={durationDialog.endH}
          onConfirm={(s, e) => {
            durationDialog.onSubmit(s, e)
            setDurationDialog(null)
          }}
          onCancel={() => setDurationDialog(null)}
        />
      )}
    </div>
  )
}

const PRESET_COLORS: { value: string; label: string }[] = [
  { value: '', label: 'Defaut' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
  { value: '#84cc16', label: 'Citron' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#a855f7', label: 'Pourpre' },
  { value: '#64748b', label: 'Gris' },
]
const COLORS_PER_ROW = 5

type ContextMenuState =
  | { x: number; y: number; type: 'bookmark'; id: string }
  | { x: number; y: number; type: 'moment'; trackId: string; momentId: string }
  | { x: number; y: number; type: 'intention'; blockIds: string[] }

type NameDialogConfig = {
  title: string
  defaultValue: string
  onSubmit: (value: string) => void
}

type DurationDialogConfig = {
  startH: number
  endH: number
  onSubmit: (startH: number, endH: number) => void
}

interface ContextMenuProps {
  contextMenu: ContextMenuState
  project: Project
  onClose: () => void
  onDeleteBookmark: (id: string) => void
  onDeleteMoment: (trackId: string, momentId: string) => void
  onRemoveBlock?: (blockId: string) => void
  onRemoveIntentionBlocks?: (blockIds: string[]) => void
  onUpdateBlock?: (blockId: string, updates: Partial<Pick<TimelineBlock, 'type' | 'color'>>) => void
  onUpdateBookmark: (id: string, updates: { label?: string; color?: string }) => void
  onUpdateMoment: (trackId: string, momentId: string, updates: { label?: string; startMs?: number; endMs?: number; color?: string }) => void
  onUpdateProject?: (updates: Partial<Pick<Project, 'dayNightDawnSimulatedH' | 'dayNightDuskSimulatedH' | 'dayNightNightColor' | 'dayNightDayColor' | 'dayNightLabels'>>) => void
  onOpenNameDialog: (config: NameDialogConfig) => void
  onOpenDurationDialog: (config: DurationDialogConfig) => void
  onOpenIntentionTypeDialog?: (blockIds: string[]) => void
}

function ContextMenu({
  contextMenu,
  project,
  onClose,
  onDeleteBookmark,
  onDeleteMoment,
  onRemoveBlock,
  onRemoveIntentionBlocks,
  onUpdateBlock,
  onUpdateBookmark,
  onUpdateMoment,
  onUpdateProject,
  onOpenNameDialog,
  onOpenDurationDialog,
  onOpenIntentionTypeDialog,
}: ContextMenuProps) {
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false)
  const [colorPalettePos, setColorPalettePos] = useState<{ x: number; y: number } | null>(null)
  const [paletteDisplayPos, setPaletteDisplayPos] = useState<{ x: number; y: number } | null>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const OFFSET = 16

  const scheduleClose = () => {
    closeTimeoutRef.current = setTimeout(() => setColorSubmenuOpen(false), 120)
  }
  const cancelClose = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  useEffect(() => () => cancelClose(), [])

  useLayoutEffect(() => {
    if (!colorSubmenuOpen || !colorPalettePos || !paletteRef.current) {
      if (!colorSubmenuOpen) setPaletteDisplayPos(null)
      return
    }
    const rect = paletteRef.current.getBoundingClientRect()
    let x = colorPalettePos.x + OFFSET
    let y = colorPalettePos.y + OFFSET
    if (x + rect.width > window.innerWidth - 8) x = Math.max(8, colorPalettePos.x - rect.width - OFFSET)
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    setPaletteDisplayPos({ x, y })
  }, [colorSubmenuOpen, colorPalettePos])
  const durationMs = project.durationMinutes * 60 * 1000
  const handleRenommer = () => {
    if (contextMenu.type === 'bookmark') {
      const bm = project.bookmarks.find((b) => b.id === contextMenu.id)
      const id = contextMenu.id
      onOpenNameDialog({
        title: 'Nouveau nom',
        defaultValue: bm?.label ?? '',
        onSubmit: (val) => {
          if (val.trim()) onUpdateBookmark(id, { label: val.trim() })
          onClose()
        },
      })
    } else if (contextMenu.type === 'moment') {
      const { trackId, momentId } = contextMenu
      if (trackId === CYCLE_TRACK_ID && onUpdateProject) {
        const labels = project.dayNightLabels ?? {}
        const key = momentId === 'dn-0' ? 'night1' : momentId === 'dn-1' ? 'day' : 'night2'
        const defaultLabels = { night1: 'Nuit', day: 'Jour', night2: 'Nuit' }
        onOpenNameDialog({
          title: 'Nouveau nom',
          defaultValue: labels[key] ?? defaultLabels[key],
          onSubmit: (val) => {
            if (val.trim()) onUpdateProject({ dayNightLabels: { ...labels, [key]: val.trim() } })
            onClose()
          },
        })
      } else {
        const track = (project.momentTracks ?? []).find((t) => t.id === trackId)
        const m = track?.moments.find((mo) => mo.id === momentId)
        onOpenNameDialog({
          title: 'Nouveau nom',
          defaultValue: m?.label ?? '',
          onSubmit: (val) => {
            if (val.trim()) onUpdateMoment(trackId, momentId, { label: val.trim() })
            onClose()
          },
        })
      }
    }
  }
  const handleModifierDuree = () => {
    if (contextMenu.type !== 'moment') return
    const { trackId, momentId } = contextMenu
    if (trackId === CYCLE_TRACK_ID && onUpdateProject) {
      const dawnH = project.dayNightDawnSimulatedH ?? 6
      const duskH = project.dayNightDuskSimulatedH ?? 20
      onOpenDurationDialog({
        startH: dawnH,
        endH: duskH,
        onSubmit: (startHNum, endHNum) => {
          onUpdateProject({ dayNightDawnSimulatedH: startHNum, dayNightDuskSimulatedH: endHNum })
          onClose()
        },
      })
    } else {
      const track = (project.momentTracks ?? []).find((t) => t.id === trackId)
      const m = track?.moments.find((mo) => mo.id === momentId)
      if (!m) return
      const startH = (m.startMs / durationMs) * 24
      const endH = (m.endMs / durationMs) * 24
      onOpenDurationDialog({
        startH,
        endH,
        onSubmit: (startHNum, endHNum) => {
          const newStartMs = (startHNum / 24) * durationMs
          const newEndMs = (endHNum / 24) * durationMs
          if (endHNum > startHNum && newEndMs - newStartMs >= 60000) {
            onUpdateMoment(trackId, momentId, { startMs: newStartMs, endMs: Math.min(durationMs, newEndMs) })
          }
          onClose()
        },
      })
    }
  }
  const applyColor = (value: string) => {
    if (contextMenu.type === 'bookmark') onUpdateBookmark(contextMenu.id, { color: value || '' })
    else if (contextMenu.type === 'moment') {
      if (contextMenu.trackId === CYCLE_TRACK_ID && onUpdateProject) {
        const isNight = contextMenu.momentId === 'dn-0' || contextMenu.momentId === 'dn-2'
        onUpdateProject(isNight ? { dayNightNightColor: value || undefined } : { dayNightDayColor: value || undefined })
      } else onUpdateMoment(contextMenu.trackId, contextMenu.momentId, { color: value || '' })
    } else if (contextMenu.type === 'intention' && onUpdateBlock) {
      contextMenu.blockIds.forEach((id) => onUpdateBlock?.(id, { color: value || undefined }))
    }
    onClose()
  }

  const handlePersonnaliser = () => {
    const input = document.createElement('input')
    input.type = 'color'
    let defaultColor = '#3b82f6'
    if (contextMenu.type === 'moment' && contextMenu.trackId === CYCLE_TRACK_ID) {
      const isNight = contextMenu.momentId === 'dn-0' || contextMenu.momentId === 'dn-2'
      defaultColor = (isNight ? project.dayNightNightColor : project.dayNightDayColor) || defaultColor
    } else if (contextMenu.type === 'intention' && project.modules) {
      const block = project.modules.flatMap((m) => m.blocks).find((b) => contextMenu.blockIds.includes(b.id))
      defaultColor = block?.color || defaultColor
    }
    input.value = defaultColor
    input.style.position = 'absolute'
    input.style.opacity = '0'
    input.style.pointerEvents = 'none'
    document.body.appendChild(input)
    input.onchange = () => {
      applyColor(input.value)
      document.body.removeChild(input)
    }
    input.onblur = () => {
      if (document.body.contains(input)) document.body.removeChild(input)
    }
    input.click()
  }

  const handleModifierIntention = () => {
    if (contextMenu.type !== 'intention') return
    onOpenIntentionTypeDialog?.(contextMenu.blockIds)
    onClose()
  }

  const handleSupprimer = () => {
    if (contextMenu.type === 'bookmark') onDeleteBookmark(contextMenu.id)
    else if (contextMenu.type === 'moment' && contextMenu.trackId !== CYCLE_TRACK_ID) onDeleteMoment(contextMenu.trackId, contextMenu.momentId)
    else if (contextMenu.type === 'intention') onRemoveIntentionBlocks?.(contextMenu.blockIds)
    onClose()
  }

  const isIntentionMenu = contextMenu.type === 'intention'

  const colorRows = PRESET_COLORS.reduce<{ value: string; label: string }[][]>((acc, c, i) => {
    const row = Math.floor(i / COLORS_PER_ROW)
    if (!acc[row]) acc[row] = []
    acc[row].push(c)
    return acc
  }, [])

  return (
    <div
      className="scene-timeline-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {!isIntentionMenu && (
        <button type="button" className="scene-timeline-context-menu-item" role="menuitem" onClick={handleRenommer}>
          Renommer
        </button>
      )}
      {isIntentionMenu && (
        <button type="button" className="scene-timeline-context-menu-item" role="menuitem" onClick={handleModifierIntention}>
          Modifier l'intention
        </button>
      )}
      <div
        className="scene-timeline-context-menu-submenu-trigger"
        onMouseEnter={(e) => {
          cancelClose()
          setColorPalettePos({ x: e.clientX, y: e.clientY })
          setColorSubmenuOpen(true)
        }}
        onMouseLeave={scheduleClose}
      >
        <button type="button" className="scene-timeline-context-menu-item scene-timeline-context-menu-item-has-submenu" role="menuitem">
          Changer la couleur
        </button>
      </div>
      {colorSubmenuOpen && colorPalettePos && createPortal(
        <div
          ref={paletteRef}
          className="scene-timeline-color-palette"
          onMouseEnter={cancelClose}
          onMouseLeave={() => setColorSubmenuOpen(false)}
          style={{
            left: (paletteDisplayPos ?? { x: colorPalettePos.x + OFFSET, y: colorPalettePos.y + OFFSET }).x,
            top: (paletteDisplayPos ?? { x: colorPalettePos.x + OFFSET, y: colorPalettePos.y + OFFSET }).y,
          }}
        >
          <div className="scene-timeline-color-palette-header">Couleur</div>
          <div className="scene-timeline-color-palette-grid">
            {colorRows.map((row, rowIdx) => (
              <div key={rowIdx} className="scene-timeline-color-palette-row">
                {row.map((c) => (
                  <button
                    key={c.value || 'default'}
                    type="button"
                    className="scene-timeline-color-palette-swatch"
                    style={c.value ? { backgroundColor: c.value } : { backgroundColor: 'var(--accent-primary)', opacity: 0.6 }}
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => applyColor(c.value || '')}
                  />
                ))}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="scene-timeline-color-palette-personnaliser"
            onClick={handlePersonnaliser}
          >
            Personnaliser
          </button>
        </div>,
        document.body
      )}
      {contextMenu.type === 'moment' && (
        <button type="button" className="scene-timeline-context-menu-item" role="menuitem" onClick={handleModifierDuree}>
          Modifier la duree
        </button>
      )}
      {(isIntentionMenu || (contextMenu.type === 'moment' && contextMenu.trackId !== CYCLE_TRACK_ID) || contextMenu.type === 'bookmark') && (
        <button
          type="button"
          className="scene-timeline-context-menu-item scene-timeline-context-menu-item-danger"
          role="menuitem"
          onClick={handleSupprimer}
        >
          Supprimer
        </button>
      )}
    </div>
  )
}

const MIN_MOMENT_MS = 60000
const MIN_INTENTION_MS = 500

function findNonOverlappingSlot(
  existingBlocks: TimelineBlock[],
  preferredStartMs: number,
  desiredDurationMs: number,
  totalDurationMs: number
): { startMs: number; durationMs: number } {
  const overlaps = (s: number, dur: number) => {
    const e = s + dur
    return existingBlocks.some((b) => {
      const be = b.startMs + b.durationMs
      return s < be && e > b.startMs
    })
  }
  const gaps: { start: number; end: number }[] = []
  let prevEnd = 0
  const sorted = [...existingBlocks].sort((a, b) => a.startMs - b.startMs)
  for (const b of sorted) {
    if (b.startMs > prevEnd) gaps.push({ start: prevEnd, end: b.startMs })
    prevEnd = Math.max(prevEnd, b.startMs + b.durationMs)
  }
  if (totalDurationMs > prevEnd) gaps.push({ start: prevEnd, end: totalDurationMs })
  let best = { startMs: Math.max(0, Math.min(totalDurationMs - desiredDurationMs, preferredStartMs)), durationMs: desiredDurationMs }
  if (!overlaps(best.startMs, best.durationMs)) return best
  let bestDist = Infinity
  for (const g of gaps) {
    const space = g.end - g.start
    const dur = Math.max(MIN_INTENTION_MS, Math.min(desiredDurationMs, space))
    const opt1 = g.start
    const opt2 = g.end - dur
    for (const opt of [opt1, opt2]) {
      const clamped = Math.max(g.start, Math.min(g.end - dur, opt))
      const dist = Math.abs(clamped - preferredStartMs)
      if (dist < bestDist && !overlaps(clamped, dur)) {
        bestDist = dist
        best = { startMs: clamped, durationMs: dur }
      }
    }
  }
  return best
}

function clampIntentionToNonOverlap(
  block: TimelineBlock,
  otherBlocks: TimelineBlock[],
  durationMs: number,
  updates: { startMs?: number; durationMs?: number }
): { startMs: number; durationMs: number } {
  let s = updates.startMs ?? block.startMs
  let dur = updates.durationMs ?? block.durationMs
  let e = s + dur
  const others = otherBlocks.filter((b) => b.id !== block.id).map((b) => ({ startMs: b.startMs, endMs: b.startMs + b.durationMs }))
  s = Math.max(0, s)
  e = Math.min(durationMs, Math.max(s + MIN_INTENTION_MS, e))
  dur = e - s
  for (let i = 0; i < 10; i++) {
    let changed = false
    for (const o of others) {
      if (s >= o.endMs || e <= o.startMs) continue
      const spaceBefore = o.startMs
      const spaceAfter = durationMs - o.endMs
      if (spaceBefore >= dur && (spaceAfter < dur || s + e <= o.startMs + o.endMs)) {
        e = o.startMs
        s = e - dur
        changed = true
        break
      } else {
        s = o.endMs
        e = s + dur
        changed = true
        break
      }
    }
    if (!changed) break
  }
  s = Math.max(0, s)
  e = Math.min(durationMs, Math.max(s + MIN_INTENTION_MS, e))
  dur = e - s
  return { startMs: s, durationMs: dur }
}

interface IntentionBlockProps {
  block: TimelineBlock
  otherBlocksOnTrack: TimelineBlock[]
  pxPerMs: number
  paddingX: number
  durationMs: number
  selected: boolean
  onSelect: (addToSelection: boolean) => void
  onUpdate: (updates: { startMs?: number; durationMs?: number; outputIndex?: number }) => void
  onContextMenu: (e: React.MouseEvent) => void
  clientXToMs: (clientX: number) => number
  snapToGrid: (ms: number) => number
  currentOutputIndex?: number
  currentTrackType?: 'pwm' | 'onoff'
  outputTracks?: { outputIndex: number; type: 'pwm' | 'onoff' }[]
  getOutputTrackAtClientY?: (clientY: number) => { outputIndex: number; type: 'pwm' | 'onoff' } | null
  onDragStart?: (block: TimelineBlock) => void
  onDragMove?: (clientX: number, clientY: number, ms: number) => void
  onDragEnd?: () => void
  isDragging?: boolean
}

function IntentionBlock({
  block,
  otherBlocksOnTrack,
  pxPerMs,
  paddingX,
  durationMs,
  selected,
  onSelect,
  onUpdate,
  onContextMenu,
  clientXToMs,
  snapToGrid,
  currentOutputIndex = 0,
  currentTrackType,
  outputTracks = [],
  getOutputTrackAtClientY,
  onDragStart,
  onDragMove,
  onDragEnd,
  isDragging = false,
}: IntentionBlockProps) {
  const width = Math.max(8, msToPx(block.durationMs, pxPerMs))
  const left = paddingX + msToPx(block.startMs, pxPerMs)
  const endMs = block.startMs + block.durationMs

  const handleResizeLeft = (e: React.MouseEvent) => {
    e.stopPropagation()
    const onMouseMove = (moveEvent: MouseEvent) => {
      const ms = snapToGrid(clientXToMs(moveEvent.clientX))
      const newStart = Math.max(0, Math.min(ms, endMs - MIN_INTENTION_MS))
      const newDuration = endMs - newStart
      const clamped = clampIntentionToNonOverlap(block, otherBlocksOnTrack, durationMs, { startMs: newStart, durationMs: newDuration })
      onUpdate(clamped)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const handleResizeRight = (e: React.MouseEvent) => {
    e.stopPropagation()
    const onMouseMove = (moveEvent: MouseEvent) => {
      const ms = snapToGrid(clientXToMs(moveEvent.clientX))
      const newEnd = Math.max(block.startMs + MIN_INTENTION_MS, Math.min(durationMs, ms))
      const newDuration = newEnd - block.startMs
      const clamped = clampIntentionToNonOverlap(block, otherBlocksOnTrack, durationMs, { durationMs: newDuration })
      onUpdate(clamped)
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const DRAG_THRESHOLD_PX = 5
  const handleBlockMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.scene-timeline-intention-resize')) return
    e.stopPropagation()
    onSelect(e.ctrlKey || e.metaKey)
    const blockDurationMs = block.durationMs
    const clickMs = clientXToMs(e.clientX)
    const offsetMs = clickMs - block.startMs
    let lastStartMs = block.startMs
    let lastTargetOutputIndex = currentOutputIndex
    let hasStartedDrag = false
    const startX = e.clientX
    const startY = e.clientY
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!hasStartedDrag) {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD_PX) return
        hasStartedDrag = true
        onDragStart?.(block)
      }
      if (hasStartedDrag) {
        const cursorMs = clientXToMs(moveEvent.clientX)
        const rawStart = cursorMs - offsetMs
        lastStartMs = snapToGrid(Math.max(0, Math.min(durationMs - blockDurationMs, rawStart)))
        if (getOutputTrackAtClientY) {
          const targetTrack = getOutputTrackAtClientY(moveEvent.clientY)
          if (targetTrack && targetTrack.type === currentTrackType) {
            lastTargetOutputIndex = targetTrack.outputIndex
          }
        }
        onDragMove?.(moveEvent.clientX, moveEvent.clientY, lastStartMs)
      }
    }
    const onMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      if (hasStartedDrag) {
        onDragEnd?.()
        const canCrossTrack = getOutputTrackAtClientY && outputTracks.length > 1 && currentTrackType
        if (canCrossTrack) {
          const targetTrack = getOutputTrackAtClientY(upEvent.clientY)
          if (targetTrack && targetTrack.type === currentTrackType) {
            lastTargetOutputIndex = targetTrack.outputIndex
          }
        }
        if (lastTargetOutputIndex !== currentOutputIndex) {
          onUpdate({ startMs: lastStartMs, outputIndex: lastTargetOutputIndex })
        } else {
          const clamped = clampIntentionToNonOverlap(block, otherBlocksOnTrack, durationMs, { startMs: lastStartMs })
          if (clamped.startMs !== block.startMs) onUpdate(clamped)
        }
      }
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const intentionDef = getIntentionDef(blockToIntentionKind(block))
  const intentionLabel = intentionDef?.label ?? (block.type === 'on' ? 'Toujours allumé' : block.type === 'off' ? 'Toujours éteint' : 'Effet')

  return (
    <div
      className={`scene-timeline-block scene-timeline-block-led scene-timeline-block-intention timeline-block timeline-block-${block.type} ${selected ? 'scene-timeline-block-intention-selected' : ''}`}
      style={{
        left,
        width,
        ...(block.color && { backgroundColor: block.color }),
        ...(isDragging && { visibility: 'hidden' }),
      }}
      title={`${intentionLabel}: ${Math.round(block.durationMs / 1000)}s`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={handleBlockMouseDown}
      onContextMenu={onContextMenu}
    >
      {selected && (
        <>
          <div className="scene-timeline-intention-resize scene-timeline-moment-resize scene-timeline-moment-resize-left" onMouseDown={handleResizeLeft} />
          <div className="scene-timeline-intention-resize scene-timeline-moment-resize scene-timeline-moment-resize-right" onMouseDown={handleResizeRight} />
        </>
      )}
      <span className="scene-timeline-moment-label">{intentionLabel}</span>
    </div>
  )
}

function clampMomentToNonOverlap(
  startMs: number,
  endMs: number,
  momentId: string,
  allMoments: Moment[],
  durationMs: number
): { startMs: number; endMs: number } {
  const others = allMoments.filter((m) => m.id !== momentId)
  let s = Math.max(0, startMs)
  let e = Math.min(durationMs, Math.max(s + MIN_MOMENT_MS, endMs))
  const dur = e - s
  for (let i = 0; i < 10; i++) {
    let changed = false
    for (const o of others) {
      if (s >= o.endMs || e <= o.startMs) continue
      const spaceBefore = o.startMs
      const spaceAfter = durationMs - o.endMs
      if (spaceBefore >= dur && (spaceAfter < dur || s + e <= o.startMs + o.endMs)) {
        e = o.startMs
        s = e - dur
        changed = true
        break
      } else {
        s = o.endMs
        e = s + dur
        changed = true
        break
      }
    }
    if (!changed) break
  }
  s = Math.max(0, s)
  e = Math.min(durationMs, Math.max(s + MIN_MOMENT_MS, e))
  return { startMs: s, endMs: e }
}

interface MomentTrackRowProps {
  track: MomentTrack
  pxPerMs: number
  paddingX: number
  totalWidthPx: number
  trackHeight: number
  durationMs: number
  selectedMomentId: string | null
  editable: boolean
  onTrackClick: (e: React.MouseEvent) => void
  onSelect: (momentId: string, e: React.MouseEvent) => void
  onUpdate?: (momentId: string, updates: { startMs?: number; endMs?: number }) => void
  onContextMenu?: (momentId: string, e: React.MouseEvent) => void
  clientXToMs: (clientX: number) => number
  snapToGrid: (ms: number) => number
}

function MomentTrackRow({
  track,
  pxPerMs,
  paddingX,
  totalWidthPx,
  trackHeight,
  durationMs,
  selectedMomentId,
  editable,
  onTrackClick,
  onSelect,
  onUpdate,
  onContextMenu,
  clientXToMs,
  snapToGrid,
}: MomentTrackRowProps) {
  return (
    <div
      className={`scene-timeline-track scene-timeline-track-moments ${track.id === CYCLE_TRACK_ID ? 'scene-timeline-track-cycle' : ''} ${!editable ? 'scene-timeline-track-readonly' : ''}`}
      style={{ width: totalWidthPx, height: trackHeight }}
      aria-label={`Piste: ${track.name}`}
    >
      <div className="scene-timeline-track-blocks" onContextMenu={editable ? onTrackClick : undefined}>
        {track.moments.map((moment) => (
          <MomentBlock
            key={moment.id}
            moment={moment}
            pxPerMs={pxPerMs}
            paddingX={paddingX}
            durationMs={durationMs}
            selected={editable && selectedMomentId === moment.id}
            editable={editable}
            onSelect={(e) => onSelect(moment.id, e)}
            onUpdate={editable && onUpdate ? (updates) => {
              const merged = {
                startMs: updates.startMs ?? moment.startMs,
                endMs: updates.endMs ?? moment.endMs,
              }
              const isCycleTrack = track.id === CYCLE_TRACK_ID
              const final = isCycleTrack
                ? merged
                : clampMomentToNonOverlap(merged.startMs, merged.endMs, moment.id, track.moments, durationMs)
              if (final.startMs !== moment.startMs || final.endMs !== moment.endMs) {
                onUpdate(moment.id, final)
              }
            } : undefined}
            onContextMenu={editable && onContextMenu ? (e) => onContextMenu(moment.id, e) : undefined}
            clientXToMs={clientXToMs}
            snapToGrid={snapToGrid}
          />
        ))}
      </div>
    </div>
  )
}

interface MomentBlockProps {
  moment: Moment
  pxPerMs: number
  paddingX: number
  durationMs: number
  selected: boolean
  editable: boolean
  onSelect: (e: React.MouseEvent) => void
  onUpdate?: (updates: { startMs?: number; endMs?: number }) => void
  onContextMenu?: (e: React.MouseEvent) => void
  clientXToMs: (clientX: number) => number
  snapToGrid: (ms: number) => number
}

function MomentBlock({
  moment,
  pxPerMs,
  paddingX,
  durationMs,
  selected,
  editable,
  onSelect,
  onUpdate,
  onContextMenu,
  clientXToMs,
  snapToGrid,
}: MomentBlockProps) {
  const width = Math.max(8, msToPx(moment.endMs - moment.startMs, pxPerMs))
  const left = paddingX + msToPx(moment.startMs, pxPerMs)

  const handleResizeLeft = onUpdate ? (e: React.MouseEvent) => {
    e.stopPropagation()
    const startEndMs = moment.endMs
    const onMouseMove = (moveEvent: MouseEvent) => {
      const ms = snapToGrid(clientXToMs(moveEvent.clientX))
      const newStart = Math.max(0, Math.min(ms, startEndMs - MIN_MOMENT_MS))
      onUpdate({ startMs: newStart })
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  } : undefined

  const handleResizeRight = onUpdate ? (e: React.MouseEvent) => {
    e.stopPropagation()
    const startStartMs = moment.startMs
    const onMouseMove = (moveEvent: MouseEvent) => {
      const ms = snapToGrid(clientXToMs(moveEvent.clientX))
      const newEnd = Math.max(startStartMs + MIN_MOMENT_MS, Math.min(durationMs, ms))
      onUpdate({ endMs: newEnd })
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  } : undefined

  const handleBlockMouseDown = (e: React.MouseEvent) => {
    if (!editable || !onUpdate) return
    if ((e.target as HTMLElement).closest('.scene-timeline-moment-resize')) return
    e.stopPropagation()
    onSelect(e)
    const blockDurationMs = moment.endMs - moment.startMs
    const startX = e.clientX
    const startMs = moment.startMs
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPx = moveEvent.clientX - startX
      const deltaMs = pxToMs(deltaPx, pxPerMs)
      const newStart = snapToGrid(Math.max(0, Math.min(durationMs - blockDurationMs, startMs + deltaMs)))
      const newEnd = newStart + blockDurationMs
      onUpdate({ startMs: newStart, endMs: newEnd })
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div
      className={`scene-timeline-block scene-timeline-block-moment ${selected ? 'scene-timeline-block-moment-selected' : ''} ${!editable ? 'scene-timeline-block-moment-readonly' : ''}`}
      style={{ left, width, ...(moment.color && { backgroundColor: moment.color }) }}
      title={`${moment.label}: ${Math.round((moment.endMs - moment.startMs) / 60000)}min`}
      onClick={(e) => { e.stopPropagation(); onSelect(e); }}
      onMouseDown={handleBlockMouseDown}
      onContextMenu={onContextMenu}
    >
      {editable && selected && (
        <>
          <div className="scene-timeline-moment-resize scene-timeline-moment-resize-left" onMouseDown={handleResizeLeft!} />
          <div className="scene-timeline-moment-resize scene-timeline-moment-resize-right" onMouseDown={handleResizeRight!} />
        </>
      )}
      <span className="scene-timeline-moment-label">{moment.label}</span>
    </div>
  )
}

interface BookmarkMarkerProps {
  bookmark: Bookmark
  slotIndex: number
  slotCount: number
  staggerOffsetPx: number
  trackHeight: number
  pxPerMs: number
  paddingX: number
  durationMs: number
  selected: boolean
  editable?: boolean
  onSelect: (e: React.MouseEvent) => void
  onUpdatePosition?: (positionMs: number) => void
  onContextMenu?: (e: React.MouseEvent) => void
  clientXToMs: (clientX: number) => number
  snapToGrid: (ms: number) => number
}

function BookmarkMarker({
  bookmark,
  slotIndex,
  slotCount,
  staggerOffsetPx,
  trackHeight,
  pxPerMs,
  paddingX,
  durationMs,
  selected,
  editable = true,
  onSelect,
  onUpdatePosition,
  onContextMenu,
  clientXToMs,
  snapToGrid,
}: BookmarkMarkerProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (e.button !== 0 || !onUpdatePosition) return
    onSelect(e)
    const onMouseMove = (moveEvent: MouseEvent) => {
      const ms = snapToGrid(clientXToMs(moveEvent.clientX))
      onUpdatePosition(Math.max(0, Math.min(durationMs, ms)))
    }
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const flagHeight = trackHeight / slotCount
  const flagTop = slotIndex * flagHeight

  return (
    <div
      className={`scene-timeline-marker ${selected ? 'scene-timeline-marker-selected' : ''} ${!editable ? 'scene-timeline-marker-readonly' : ''}`}
      style={{
        left: paddingX + msToPx(bookmark.positionMs, pxPerMs) + staggerOffsetPx,
        zIndex: slotCount > 1 ? slotIndex + 1 : 0,
      }}
      title={bookmark.label}
      onClick={(e) => { e.stopPropagation(); onSelect(e); }}
      onContextMenu={onContextMenu}
    >
      <div
        className="scene-timeline-marker-line"
        style={{ height: trackHeight, ...(bookmark.color ? { backgroundColor: bookmark.color } : {}) }}
        onMouseDown={handleMouseDown}
      />
      <div
        className="scene-timeline-marker-flag"
        style={{
          top: flagTop,
          height: flagHeight,
          backgroundColor: bookmark.color || 'var(--accent-primary)',
        }}
      />
      {flagHeight >= 14 && (
        <span
          className="scene-timeline-marker-flag-label"
          style={{ top: flagTop, height: flagHeight }}
        >
          {bookmark.label}
        </span>
      )}
    </div>
  )
}

