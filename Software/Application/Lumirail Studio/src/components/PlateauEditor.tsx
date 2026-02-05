import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, Circle, Ellipse, Line, Point, Polyline, Rect, util } from 'fabric'
import type { Project, PlateauState, PlateauUnit } from '../data'
import { PlateauSettingsDialog } from './PlateauSettingsDialog'
import { Settings } from 'lucide-react'

const DEFAULT_UNIT: PlateauUnit = 'cm'
const DEFAULT_WIDTH = 120
const DEFAULT_HEIGHT = 60

type Tool = 'select' | 'pan' | 'rect' | 'ellipse' | 'polyline'

export function PlateauEditor({
  project,
  projectId,
  onUpdateProject,
}: {
  project: Project
  projectId?: string
  onUpdateProject: (updates: { plateau?: PlateauState }) => void
}) {
  const initialCanvasJsonRef = useRef<unknown | undefined>(undefined)
  if (initialCanvasJsonRef.current === undefined) {
    initialCanvasJsonRef.current = project.plateau?.canvasJson
  }

  const initialPlateau = useMemo<PlateauState>(() => {
    return project.plateau ?? {
      board: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, unit: DEFAULT_UNIT },
      canvasJson: undefined,
    }
  }, [project.plateau])

  const [width, setWidth] = useState<number>(initialPlateau.board.width)
  const [height, setHeight] = useState<number>(initialPlateau.board.height)
  const [unit, setUnit] = useState<PlateauUnit>(initialPlateau.board.unit)
  const [isConfigured, setIsConfigured] = useState<boolean>(Boolean(project.plateau))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  const [canEditPoints, setCanEditPoints] = useState(false)
  const [editingPoints, setEditingPoints] = useState(false)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const boardRef = useRef<Rect | null>(null)
  const gridRef = useRef<Line[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentToolRef = useRef<Tool>('select')
  const panRef = useRef<{ active: boolean; last?: { x: number; y: number } }>({ active: false })
  const didInitialFitRef = useRef(false)
  const drawingRef = useRef<{
    shape: Rect | Ellipse | null
    kind: 'rect' | 'ellipse' | null
    start?: { x: number; y: number }
  }>({ shape: null, kind: null })
  const polylineRef = useRef<{
    active: boolean
    points: Array<{ x: number; y: number }>
    previewPoint?: { x: number; y: number }
    shape: Polyline | null
  }>({ active: false, points: [], shape: null })
  const editPointsRef = useRef<{
    polyline: Polyline | null
    handles: Circle[]
  }>({ polyline: null, handles: [] })
  const boardCfgRef = useRef({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, unit: DEFAULT_UNIT as PlateauUnit })
  const onUpdateProjectRef = useRef(onUpdateProject)

  useEffect(() => {
    setWidth(initialPlateau.board.width)
    setHeight(initialPlateau.board.height)
    setUnit(initialPlateau.board.unit)
    setIsConfigured(Boolean(project.plateau))
  }, [initialPlateau.board.height, initialPlateau.board.unit, initialPlateau.board.width])

  useEffect(() => {
    boardCfgRef.current = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)), unit }
  }, [height, unit, width])

  useEffect(() => {
    onUpdateProjectRef.current = onUpdateProject
  }, [onUpdateProject])

  const pxPerUnit = (u: PlateauUnit) => (u === 'mm' ? 1 : u === 'cm' ? 10 : 1000)

  const fitBoardToView = useCallback(() => {
    const canvas = fabricRef.current
    const board = boardRef.current
    if (!canvas || !board) return
    const cw = canvas.getWidth()
    const ch = canvas.getHeight()
    const bounds = board.getBoundingRect(true, true)
    const bw = bounds.width || 1
    const bh = bounds.height || 1
    const padding = 32
    const zx = (cw - padding * 2) / bw
    const zy = (ch - padding * 2) / bh
    const zoom = Math.max(0.2, Math.min(2, Math.min(zx, zy)))
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
    vpt[0] = zoom
    vpt[3] = zoom
    vpt[4] = (cw - bw * zoom) / 2 - bounds.left * zoom
    vpt[5] = (ch - bh * zoom) / 2 - bounds.top * zoom
    canvas.setViewportTransform(vpt)
    canvas.requestRenderAll()
  }, [])

  const scheduleSave = useCallback(() => {
    if (!projectId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const canvas = fabricRef.current
      if (!canvas) return
      const boardCfg = boardCfgRef.current
      const canvasJson = canvas.toJSON()
      onUpdateProjectRef.current({ plateau: { board: boardCfg, canvasJson } })
    }, 350)
  }, [projectId])

  useEffect(() => {
    if (!canvasWrapRef.current || !canvasElRef.current) return
    if (!isConfigured) return
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
    canvasElRef.current.removeAttribute('data-fabric')
    canvasElRef.current.classList.remove('lower-canvas')
    if (fabricRef.current) {
      try {
        fabricRef.current.dispose()
      } catch {
      } finally {
        fabricRef.current = null
      }
    }
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvasElRef.current.getContext('2d')
    } catch {
      return
    }
    if (!ctx) return
    const canvas = new Canvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
    })
    fabricRef.current = canvas
    currentToolRef.current = 'select'
    didInitialFitRef.current = false
    canvas.perPixelTargetFind = true
    canvas.targetFindTolerance = 8

    const board = new Rect({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: 100,
      height: 100,
      fill: '#1c2238',
      stroke: '#4c5a86',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
    })
    ;(board as unknown as { excludeFromExport?: boolean }).excludeFromExport = true
    boardRef.current = board
    canvas.add(board)
    canvas.sendObjectToBack(board)

    const resize = () => {
      const host = canvasWrapRef.current
      if (!host) return
      const w = Math.max(200, Math.floor(host.clientWidth))
      const h = Math.max(200, Math.floor(host.clientHeight))
      canvas.setDimensions({ width: w, height: h })
      canvas.requestRenderAll()
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvasWrapRef.current)
    resize()

    const initialJson = initialCanvasJsonRef.current
    if (initialJson) {
      canvas.loadFromJSON(initialJson, () => {
        canvas.requestRenderAll()
      })
    }

    const onWheel = (opt: { e: WheelEvent }) => {
      const e = opt.e
      e.preventDefault()
      e.stopPropagation()
      const delta = e.deltaY
      let zoom = canvas.getZoom()
      zoom *= Math.pow(0.999, delta)
      zoom = Math.max(0.2, Math.min(4, zoom))
      const anyCanvas = canvas as unknown as { getViewportPoint?: (e: WheelEvent) => { x: number; y: number } }
      const p = anyCanvas.getViewportPoint ? anyCanvas.getViewportPoint(e) : { x: e.offsetX, y: e.offsetY }
      canvas.zoomToPoint(new Point(p.x, p.y), zoom)
    }

    const onSelectionChanged = () => {
      const obj = canvas.getActiveObject()
      const isPolyline = !!obj && obj.type === 'polyline'
      setCanEditPoints(isPolyline)
      if (!isPolyline) setEditingPoints(false)
    }

    const onObjectChanged = (e: { target?: unknown }) => {
      const t = e.target as { excludeFromExport?: boolean } | undefined
      if (t?.excludeFromExport) return
      scheduleSave()
    }

    canvas.on('mouse:wheel', onWheel)
    canvas.on('selection:created', onSelectionChanged)
    canvas.on('selection:updated', onSelectionChanged)
    canvas.on('selection:cleared', onSelectionChanged)
    canvas.on('object:modified', onObjectChanged)
    canvas.on('object:added', onObjectChanged)
    canvas.on('object:removed', onObjectChanged)

    return () => {
      ro?.disconnect()
      canvas.off('mouse:wheel', onWheel)
      canvas.off('selection:created', onSelectionChanged)
      canvas.off('selection:updated', onSelectionChanged)
      canvas.off('selection:cleared', onSelectionChanged)
      canvas.off('object:modified', onObjectChanged)
      canvas.off('object:added', onObjectChanged)
      canvas.off('object:removed', onObjectChanged)
      canvas.dispose()
      fabricRef.current = null
      boardRef.current = null
      gridRef.current = []
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [isConfigured, projectId])

  useEffect(() => {
    const canvas = fabricRef.current
    const board = boardRef.current
    if (!canvas || !board) return

    for (const l of gridRef.current) canvas.remove(l)
    gridRef.current = []

    const unitPx = pxPerUnit(unit)
    const boardW = Math.max(1, Math.round(width)) * unitPx
    const boardH = Math.max(1, Math.round(height)) * unitPx

    board.set({ width: boardW, height: boardH })
    board.setCoords()

    const step = unitPx
    const maxLines = 400
    const verticalCount = Math.min(maxLines, Math.floor(boardW / step))
    const horizontalCount = Math.min(maxLines, Math.floor(boardH / step))
    for (let i = 0; i <= verticalCount; i++) {
      const x = i * step
      const major = i % 10 === 0
      const line = new Line([x, 0, x, boardH], {
        stroke: major ? '#3a4f8a' : '#2a355a',
        strokeWidth: major ? 2 : 1,
        selectable: false,
        evented: false,
        strokeUniform: true,
      })
      ;(line as unknown as { excludeFromExport?: boolean }).excludeFromExport = true
      gridRef.current.push(line)
      canvas.add(line)
    }
    for (let i = 0; i <= horizontalCount; i++) {
      const y = i * step
      const major = i % 10 === 0
      const line = new Line([0, y, boardW, y], {
        stroke: major ? '#3a4f8a' : '#2a355a',
        strokeWidth: major ? 2 : 1,
        selectable: false,
        evented: false,
        strokeUniform: true,
      })
      ;(line as unknown as { excludeFromExport?: boolean }).excludeFromExport = true
      gridRef.current.push(line)
      canvas.add(line)
    }
    canvas.sendObjectToBack(board)
    for (const l of gridRef.current) canvas.bringObjectToFront(l)
    if (!didInitialFitRef.current) {
      didInitialFitRef.current = true
      fitBoardToView()
    }
    canvas.requestRenderAll()
  }, [fitBoardToView, height, unit, width])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    currentToolRef.current = tool

    const resetModes = () => {
      panRef.current = { active: false }
      drawingRef.current = { shape: null, kind: null }
      polylineRef.current = { active: false, points: [], shape: null }
      setEditingPoints(false)
    }

    resetModes()

    if (tool === 'select') {
      canvas.selection = true
      canvas.defaultCursor = 'default'
      canvas.forEachObject((o) => {
        if (o === boardRef.current) return
        if (gridRef.current.includes(o as unknown as Line)) return
        o.selectable = true
        o.evented = true
      })
    } else if (tool === 'pan') {
      canvas.discardActiveObject()
      canvas.selection = false
      canvas.defaultCursor = 'grab'
      canvas.forEachObject((o) => {
        if (o === boardRef.current) return
        if (gridRef.current.includes(o as unknown as Line)) return
        o.selectable = false
      })
    } else {
      canvas.discardActiveObject()
      canvas.selection = false
      canvas.defaultCursor = 'crosshair'
      canvas.forEachObject((o) => {
        if (o === boardRef.current) return
        if (gridRef.current.includes(o as unknown as Line)) return
        o.selectable = false
      })
    }

    canvas.requestRenderAll()
  }, [tool])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const removeEditHandles = () => {
      const handles = editPointsRef.current.handles
      if (handles.length === 0) return
      for (const h of handles) canvas.remove(h)
      editPointsRef.current = { polyline: null, handles: [] }
      canvas.requestRenderAll()
    }

    const buildEditHandles = (poly: Polyline) => {
      removeEditHandles()
      const matrix = poly.calcTransformMatrix()
      const offset = poly.pathOffset ?? { x: 0, y: 0 }
      const handles: Circle[] = []
      for (let i = 0; i < (poly.points?.length ?? 0); i++) {
        const pt = poly.points![i]
        const local = new Point(pt.x - offset.x, pt.y - offset.y)
        const pos = util.transformPoint(local, matrix)
        const handle = new Circle({
          left: pos.x,
          top: pos.y,
          originX: 'center',
          originY: 'center',
          radius: 6,
          fill: '#7c9cf7',
          stroke: '#ffffff',
          strokeWidth: 1,
          hasControls: false,
          hasBorders: false,
        })
        ;(handle as unknown as { excludeFromExport?: boolean }).excludeFromExport = true
        ;(handle as unknown as { _plateauPointIndex?: number })._plateauPointIndex = i
        handles.push(handle)
        canvas.add(handle)
      }
      editPointsRef.current = { polyline: poly, handles }
    }

    const syncHandles = () => {
      const poly = editPointsRef.current.polyline
      const handles = editPointsRef.current.handles
      if (!poly || handles.length === 0) return
      const matrix = poly.calcTransformMatrix()
      const offset = poly.pathOffset ?? { x: 0, y: 0 }
      for (const h of handles) {
        const idx = (h as unknown as { _plateauPointIndex?: number })._plateauPointIndex ?? 0
        const pt = poly.points?.[idx]
        if (!pt) continue
        const local = new Point(pt.x - offset.x, pt.y - offset.y)
        const pos = util.transformPoint(local, matrix)
        h.set({ left: pos.x, top: pos.y })
        h.setCoords()
      }
      canvas.requestRenderAll()
    }

    const onHandleMoving = (e: { target?: unknown }) => {
      const poly = editPointsRef.current.polyline
      const target = e.target as Circle | undefined
      if (!poly || !target) return
      if (!editPointsRef.current.handles.includes(target)) return
      const idx = (target as unknown as { _plateauPointIndex?: number })._plateauPointIndex ?? 0
      const pt = poly.points?.[idx]
      if (!pt) return
      const matrix = poly.calcTransformMatrix()
      const inv = util.invertTransform(matrix)
      const offset = poly.pathOffset ?? { x: 0, y: 0 }
      const left = target.left ?? 0
      const top = target.top ?? 0
      const local = util.transformPoint(new Point(left, top), inv)
      pt.x = local.x + offset.x
      pt.y = local.y + offset.y
      poly.set({ dirty: true })
      poly.setCoords()
      syncHandles()
      scheduleSave()
    }

    const onSelectionChanged = () => {
      if (!editingPoints) {
        removeEditHandles()
        return
      }
      const obj = canvas.getActiveObject()
      if (!obj || obj.type !== 'polyline') {
        removeEditHandles()
        return
      }
      buildEditHandles(obj as Polyline)
    }

    const onPolyTransform = () => syncHandles()

    const onMouseDown = (opt: { e: MouseEvent; target?: unknown }) => {
      const e = opt.e

      const getScenePoint = (evt: MouseEvent) => {
        const anyCanvas = canvas as unknown as {
          getScenePoint?: (e: MouseEvent) => { x: number; y: number }
          getViewportPoint?: (e: MouseEvent) => { x: number; y: number }
        }
        if (anyCanvas.getScenePoint) return anyCanvas.getScenePoint(evt)
        if (anyCanvas.getViewportPoint) return anyCanvas.getViewportPoint(evt)
        return { x: 0, y: 0 }
      }

      if (currentToolRef.current === 'pan') {
        panRef.current = { active: true, last: { x: e.clientX, y: e.clientY } }
        canvas.defaultCursor = 'grabbing'
        return
      }

      if (currentToolRef.current === 'rect' || currentToolRef.current === 'ellipse') {
        const p = getScenePoint(e)
        if (currentToolRef.current === 'rect') {
          const r = new Rect({ left: p.x, top: p.y, width: 1, height: 1, fill: 'rgba(124, 156, 247, 0.15)', stroke: '#7c9cf7', strokeWidth: 2 })
          canvas.add(r)
          drawingRef.current = { shape: r, kind: 'rect', start: { x: p.x, y: p.y } }
        } else {
          const el = new Ellipse({ left: p.x, top: p.y, rx: 1, ry: 1, originX: 'left', originY: 'top', fill: 'rgba(124, 156, 247, 0.15)', stroke: '#7c9cf7', strokeWidth: 2 })
          canvas.add(el)
          drawingRef.current = { shape: el, kind: 'ellipse', start: { x: p.x, y: p.y } }
        }
        return
      }

      if (currentToolRef.current === 'polyline') {
        const p = getScenePoint(e)
        const state = polylineRef.current
        if (!state.active) {
          const pts = [{ x: p.x, y: p.y }, { x: p.x, y: p.y }]
          const poly = new Polyline(pts, {
            fill: 'rgba(0,0,0,0)',
            stroke: '#7c9cf7',
            strokeWidth: 3,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            objectCaching: false,
            selectable: false,
            evented: false,
            strokeUniform: true,
          })
          canvas.add(poly)
          polylineRef.current = { active: true, points: [{ x: p.x, y: p.y }], previewPoint: { x: p.x, y: p.y }, shape: poly }
        } else {
          state.points.push({ x: p.x, y: p.y })
          state.previewPoint = { x: p.x, y: p.y }
        }
        return
      }
    }

    const onMouseMove = (opt: { e: MouseEvent }) => {
      const e = opt.e

      const getScenePoint = (evt: MouseEvent) => {
        const anyCanvas = canvas as unknown as {
          getScenePoint?: (e: MouseEvent) => { x: number; y: number }
          getViewportPoint?: (e: MouseEvent) => { x: number; y: number }
        }
        if (anyCanvas.getScenePoint) return anyCanvas.getScenePoint(evt)
        if (anyCanvas.getViewportPoint) return anyCanvas.getViewportPoint(evt)
        return { x: 0, y: 0 }
      }

      if (currentToolRef.current === 'pan') {
        if (!panRef.current.active || !panRef.current.last) return
        const vpt = canvas.viewportTransform
        if (!vpt) return
        const dx = e.clientX - panRef.current.last.x
        const dy = e.clientY - panRef.current.last.y
        vpt[4] += dx
        vpt[5] += dy
        canvas.requestRenderAll()
        panRef.current.last = { x: e.clientX, y: e.clientY }
        return
      }

      const draw = drawingRef.current
      if (draw.shape && draw.start && (draw.kind === 'rect' || draw.kind === 'ellipse')) {
        const p = getScenePoint(e)
        const left = Math.min(draw.start.x, p.x)
        const top = Math.min(draw.start.y, p.y)
        const w = Math.abs(p.x - draw.start.x)
        const h = Math.abs(p.y - draw.start.y)
        if (draw.kind === 'rect') {
          ;(draw.shape as Rect).set({ left, top, width: Math.max(1, w), height: Math.max(1, h) })
        } else {
          ;(draw.shape as Ellipse).set({ left, top, rx: Math.max(1, w / 2), ry: Math.max(1, h / 2), originX: 'left', originY: 'top' })
        }
        draw.shape.setCoords()
        canvas.requestRenderAll()
        return
      }

      if (currentToolRef.current === 'polyline') {
        const state = polylineRef.current
        if (!state.active || !state.shape) return
        const p = getScenePoint(e)
        state.previewPoint = { x: p.x, y: p.y }
        const pts = [...state.points, state.previewPoint]
        state.shape.set({ points: pts })
        state.shape.setCoords()
        canvas.requestRenderAll()
      }
    }

    const onMouseUp = () => {
      if (currentToolRef.current === 'pan') {
        panRef.current.active = false
        canvas.defaultCursor = 'grab'
      }
      const draw = drawingRef.current
      if (draw.shape) {
        draw.shape.setCoords()
        drawingRef.current = { shape: null, kind: null }
        canvas.requestRenderAll()
        setTool('select')
      }
    }

    const finishPolyline = () => {
      const state = polylineRef.current
      if (!state.active || !state.shape) return
      if (state.points.length < 2) {
        canvas.remove(state.shape)
      } else {
        state.shape.set({
          points: [...state.points],
          selectable: true,
          evented: true,
        })
        state.shape.setCoords()
        canvas.setActiveObject(state.shape)
      }
      polylineRef.current = { active: false, points: [], shape: null }
      canvas.requestRenderAll()
      setTool('select')
    }

    const onDblClick = () => {
      if (currentToolRef.current !== 'polyline') return
      finishPolyline()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (currentToolRef.current === 'polyline') finishPolyline()
        setEditingPoints(false)
        return
      }
      if ((e.key === 'Enter' || e.key === 'NumpadEnter') && currentToolRef.current === 'polyline') {
        finishPolyline()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = canvas.getActiveObjects()
        if (active.length === 0) return
        for (const o of active) {
          if (o === boardRef.current) continue
          if (gridRef.current.includes(o as unknown as Line)) continue
          canvas.remove(o)
        }
        canvas.discardActiveObject()
        canvas.requestRenderAll()
        scheduleSave()
      }
    }

    canvas.on('mouse:down', onMouseDown)
    canvas.on('mouse:move', onMouseMove)
    canvas.on('mouse:up', onMouseUp)
    canvas.on('object:moving', onPolyTransform)
    canvas.on('object:scaling', onPolyTransform)
    canvas.on('object:rotating', onPolyTransform)
    canvas.on('selection:created', onSelectionChanged)
    canvas.on('selection:updated', onSelectionChanged)
    canvas.on('selection:cleared', onSelectionChanged)
    canvas.on('object:moving', onHandleMoving)
    canvas.upperCanvasEl?.addEventListener('dblclick', onDblClick)
    window.addEventListener('keydown', onKeyDown)

    if (editingPoints) onSelectionChanged()
    else removeEditHandles()

    return () => {
      canvas.off('mouse:down', onMouseDown)
      canvas.off('mouse:move', onMouseMove)
      canvas.off('mouse:up', onMouseUp)
      canvas.off('object:moving', onPolyTransform)
      canvas.off('object:scaling', onPolyTransform)
      canvas.off('object:rotating', onPolyTransform)
      canvas.off('selection:created', onSelectionChanged)
      canvas.off('selection:updated', onSelectionChanged)
      canvas.off('selection:cleared', onSelectionChanged)
      canvas.off('object:moving', onHandleMoving)
      canvas.upperCanvasEl?.removeEventListener('dblclick', onDblClick)
      window.removeEventListener('keydown', onKeyDown)
      removeEditHandles()
    }
  }, [editingPoints, scheduleSave])

  const applyBoard = () => {
    if (!projectId) return
    const nextWidth = Math.max(1, Math.round(width))
    const nextHeight = Math.max(1, Math.round(height))
    didInitialFitRef.current = false
    onUpdateProject({
      plateau: {
        ...(project.plateau ?? {}),
        board: { width: nextWidth, height: nextHeight, unit },
      },
    })
    setIsConfigured(true)
  }

  return (
    <div className="plateau-editor">
      <div className="plateau-editor-header">
        {!isConfigured ? (
          <div className="plateau-editor-board-form" role="group" aria-label="Configuration du plateau">
            <label className="plateau-editor-label">
              Largeur
              <input
                type="number"
                min={1}
                step={1}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="plateau-editor-input"
              />
            </label>
            <label className="plateau-editor-label">
              Hauteur
              <input
                type="number"
                min={1}
                step={1}
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="plateau-editor-input"
              />
            </label>
            <label className="plateau-editor-label">
              Unité
              <select value={unit} onChange={(e) => setUnit(e.target.value as PlateauUnit)} className="plateau-editor-input">
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
              </select>
            </label>
            <button type="button" className="btn btn-primary btn-sm" onClick={applyBoard}>
              Créer le plateau
            </button>
          </div>
        ) : (
          <div className="plateau-editor-topbar" role="group" aria-label="Barre plateau">
            <div className="plateau-editor-topbar-title">Plateau</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSettingsOpen(true)} aria-label="Réglages du plateau">
              <Settings size={16} strokeWidth={2} aria-hidden />
              Réglages
            </button>
          </div>
        )}
        {!isConfigured ? (
          <p className="plateau-editor-hint">
            Définissez d’abord la taille du plateau, puis vous pourrez dessiner.
          </p>
        ) : (
          <>
            <div className="plateau-editor-tools" role="group" aria-label="Outils plateau">
              <button type="button" className={`btn btn-sm ${tool === 'select' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('select')}>
                Sélection
              </button>
              <button type="button" className={`btn btn-sm ${tool === 'pan' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('pan')}>
                Déplacer
              </button>
              <button type="button" className={`btn btn-sm ${tool === 'rect' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('rect')}>
                Rectangle
              </button>
              <button type="button" className={`btn btn-sm ${tool === 'ellipse' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('ellipse')}>
                Cercle
              </button>
              <button type="button" className={`btn btn-sm ${tool === 'polyline' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTool('polyline')}>
                Courbe
              </button>
              {canEditPoints && (
                <button type="button" className={`btn btn-sm ${editingPoints ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditingPoints((v) => !v)}>
                  Éditer les points
                </button>
              )}
            </div>
            <p className="plateau-editor-hint">
              Sélection: déplacer/resize/rotate. Déplacer: cliquer-glisser pour pan, molette pour zoom. Courbe: clics pour points, double-clic ou Entrée pour terminer.
            </p>
          </>
        )}
      </div>
      {isConfigured ? (
        <div className="plateau-editor-canvas" ref={canvasWrapRef}>
          <canvas ref={canvasElRef} />
        </div>
      ) : (
        <div className="plateau-editor-empty">
          <div className="plateau-editor-empty-card">
            <p className="plateau-editor-empty-title">Plateau non configuré</p>
            <p className="plateau-editor-empty-desc">Renseignez largeur/hauteur/unité puis cliquez sur “Créer le plateau”.</p>
          </div>
        </div>
      )}

      <PlateauSettingsDialog
        open={settingsOpen}
        defaultWidth={width}
        defaultHeight={height}
        defaultUnit={unit}
        onCancel={() => setSettingsOpen(false)}
        onConfirm={(next) => {
          setSettingsOpen(false)
          setWidth(next.width)
          setHeight(next.height)
          setUnit(next.unit)
          didInitialFitRef.current = false
          if (!projectId) return
          onUpdateProject({
            plateau: {
              ...(project.plateau ?? {}),
              board: { width: next.width, height: next.height, unit: next.unit },
            },
          })
        }}
      />
    </div>
  )
}

