import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { UserData, Bookmark, TimelineBlock, OutputAddress } from '../data'
import {
  loadUserData,
  saveUserData,
  createEmptyData,
  parseUserDataFromJson,
  exportUserDataToJson,
  createWorkspace as persistCreateWorkspace,
  updateWorkspace as persistUpdateWorkspace,
  deleteWorkspace as persistDeleteWorkspace,
  createProject as persistCreateProject,
  updateProject as persistUpdateProject,
  deleteProject as persistDeleteProject,
  createModule as persistCreateModule,
  updateModule as persistUpdateModule,
  deleteModule as persistDeleteModule,
  createBookmark as persistCreateBookmark,
  updateBookmark as persistUpdateBookmark,
  deleteBookmark as persistDeleteBookmark,
  createModuleBookmark as persistCreateModuleBookmark,
  updateModuleBookmark as persistUpdateModuleBookmark,
  deleteModuleBookmark as persistDeleteModuleBookmark,
  createMomentTrack as persistCreateMomentTrack,
  updateMomentTrack as persistUpdateMomentTrack,
  deleteMomentTrack as persistDeleteMomentTrack,
  createMoment as persistCreateMoment,
  updateMoment as persistUpdateMoment,
  deleteMoment as persistDeleteMoment,
  addBlockToModule as persistAddBlockToModule,
  updateModuleBlock as persistUpdateModuleBlock,
  removeBlockFromModule as persistRemoveBlockFromModule,
  createCard as persistCreateCard,
  deleteCard as persistDeleteCard,
} from '../data'
import { createLocalStorageAdapter, createElectronStorageAdapter } from '../storage'
import type { StorageAdapter } from '../storage'
import { DataContext, type DataContextValue } from './dataContext'
import { UNDO_EVENT, REDO_EVENT } from '../lib/undoRedoEvents'

const isDesktop = import.meta.env.VITE_DESKTOP === '1'

export function DataProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const [adapter, setAdapter] = useState<StorageAdapter | null>(null)
  const [data, setDataState] = useState<UserData>({ workspaces: [], projects: [] })

  useEffect(() => {
    if (isDesktop && typeof window !== 'undefined' && window.electronStorage) {
      createElectronStorageAdapter(userId).then((a) => {
        setAdapter(a)
        setDataState(loadUserData(a, userId))
      })
    } else {
      const a = createLocalStorageAdapter()
      setAdapter(a)
      setDataState(loadUserData(a, userId))
    }
  }, [userId])
  const historyRef = useRef<UserData[]>([])
  const futureRef = useRef<UserData[]>([])
  const isUndoRedoRef = useRef(false)
  const pendingPushRef = useRef<UserData | null>(null)
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const GESTURE_DEBOUNCE_MS = 150
  const MAX_HISTORY = 50

  const flushPendingPush = useCallback(() => {
    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
    }
    const state = pendingPushRef.current
    pendingPushRef.current = null
    if (state) {
      historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), state]
      futureRef.current = []
    }
  }, [])

  const setData = useCallback(
    (updater: UserData | ((prev: UserData) => UserData)) => {
      setDataState((prev) => {
        if (isUndoRedoRef.current) {
          return typeof updater === 'function' ? (updater as (p: UserData) => UserData)(prev) : updater
        }
        const next = typeof updater === 'function' ? (updater as (p: UserData) => UserData)(prev) : updater
        if (!pendingPushRef.current) {
          pendingPushRef.current = JSON.parse(JSON.stringify(prev))
        }
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
        pushTimerRef.current = setTimeout(flushPendingPush, GESTURE_DEBOUNCE_MS)
        return next
      })
    },
    [flushPendingPush]
  )

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    isUndoRedoRef.current = true
    const prev = historyRef.current.pop()!
    setDataState((current) => {
      futureRef.current = [JSON.parse(JSON.stringify(current)), ...futureRef.current]
      return prev
    })
    saveUserData(adapter, userId, prev)
    isUndoRedoRef.current = false
  }, [adapter, userId])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    isUndoRedoRef.current = true
    const next = futureRef.current.shift()!
    setDataState((current) => {
      historyRef.current = [...historyRef.current, JSON.parse(JSON.stringify(current))]
      return next
    })
    saveUserData(adapter, userId, next)
    isUndoRedoRef.current = false
  }, [adapter, userId])

  useEffect(() => {
    const onUndo = () => undo()
    const onRedo = () => redo()
    window.addEventListener(UNDO_EVENT, onUndo)
    window.addEventListener(REDO_EVENT, onRedo)
    return () => {
      window.removeEventListener(UNDO_EVENT, onUndo)
      window.removeEventListener(REDO_EVENT, onRedo)
    }
  }, [undo, redo])

  const canUndo = historyRef.current.length > 0
  const canRedo = futureRef.current.length > 0

  const createWorkspace = useCallback(
    (name: string) => {
      const ws = persistCreateWorkspace(adapter, userId, name)
      setData((prev) => ({ ...prev, workspaces: [...prev.workspaces, ws] }))
      return ws
    },
    [adapter, userId]
  )

  const updateWorkspace = useCallback(
    (workspaceId: string, updates: { name?: string }) => {
      const updated = persistUpdateWorkspace(adapter, userId, workspaceId, updates)
      if (updated) {
        setData((prev) => ({
          ...prev,
          workspaces: prev.workspaces.map((w) => (w.id === workspaceId ? updated : w)),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteWorkspace = useCallback(
    (workspaceId: string) => {
      const deleted = persistDeleteWorkspace(adapter, userId, workspaceId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          workspaces: prev.workspaces.filter((w) => w.id !== workspaceId),
          projects: prev.projects.filter((p) => p.workspaceId !== workspaceId),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createProject = useCallback(
    (workspaceId: string, name: string, durationMinutes = 10) => {
      const proj = persistCreateProject(adapter, userId, workspaceId, name, durationMinutes)
      if (!proj) return null
      setData((prev) => ({ ...prev, projects: [...prev.projects, proj] }))
      return proj
    },
    [adapter, userId]
  )

  const updateProject = useCallback(
    (
      projectId: string,
      updates: {
        name?: string
        workspaceId?: string
        durationMinutes?: number
        bookmarks?: Bookmark[]
        dayNightDawnSimulatedH?: number
        dayNightDuskSimulatedH?: number
        dayNightNightColor?: string
        dayNightDayColor?: string
        dayNightLabels?: { night1?: string; day?: string; night2?: string }
        plateau?: import('../data').PlateauState
      }
    ) => {
      const updated = persistUpdateProject(adapter, userId, projectId, updates)
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => (p.id === projectId ? updated : p)),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteProject = useCallback(
    (projectId: string) => {
      const deleted = persistDeleteProject(adapter, userId, projectId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.filter((p) => p.id !== projectId),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createModule = useCallback(
    (
      projectId: string,
      name: string,
      outputAddresses: OutputAddress[] = [],
      storedModuleInfo?: import('../data').StoredModuleInfo
    ) => {
      const mod = persistCreateModule(adapter, userId, projectId, name, outputAddresses, storedModuleInfo)
      if (!mod) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, modules: [...p.modules, mod] } : p
        ),
      }))
      return mod
    },
    [adapter, userId]
  )

  const updateModule = useCallback(
    (
      moduleId: string,
      updates: {
        name?: string
        outputAddresses?: OutputAddress[]
        blocks?: TimelineBlock[]
        storedModuleInfo?: import('../data').StoredModuleInfo
        outputTrackLabels?: Record<number, string>
      }
    ) => {
      const updated = persistUpdateModule(adapter, userId, moduleId, updates)
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.map((m) => (m.id === moduleId ? updated : m)),
          })),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteModule = useCallback(
    (moduleId: string) => {
      const deleted = persistDeleteModule(adapter, userId, moduleId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.filter((m) => m.id !== moduleId),
          })),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createBookmark = useCallback(
    (projectId: string, positionMs: number, label: string) => {
      const bm = persistCreateBookmark(adapter, userId, projectId, positionMs, label)
      if (!bm) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, bookmarks: [...p.bookmarks, bm].sort((a, b) => a.positionMs - b.positionMs) } : p
        ),
      }))
      return bm
    },
    [adapter, userId]
  )

  const updateBookmark = useCallback(
    (
      projectId: string,
      bookmarkId: string,
      updates: { positionMs?: number; label?: string; color?: string }
    ) => {
      const updated = persistUpdateBookmark(
        adapter,
        userId,
        projectId,
        bookmarkId,
        updates
      )
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  bookmarks: p.bookmarks
                    .map((b) => (b.id === bookmarkId ? updated : b))
                    .sort((a, b) => a.positionMs - b.positionMs),
                }
              : p
          ),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteBookmark = useCallback(
    (projectId: string, bookmarkId: string) => {
      const deleted = persistDeleteBookmark(adapter, userId, projectId, bookmarkId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? { ...p, bookmarks: p.bookmarks.filter((b) => b.id !== bookmarkId) }
              : p
          ),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createModuleBookmark = useCallback(
    (moduleId: string, positionMs: number, label: string) => {
      const bm = persistCreateModuleBookmark(adapter, userId, moduleId, positionMs, label)
      if (!bm) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => ({
          ...p,
          modules: p.modules.map((m) =>
            m.id === moduleId
              ? { ...m, bookmarks: [...(m.bookmarks ?? []), bm].sort((a, b) => a.positionMs - b.positionMs) }
              : m
          ),
        })),
      }))
      return bm
    },
    [adapter, userId]
  )

  const updateModuleBookmark = useCallback(
    (
      moduleId: string,
      bookmarkId: string,
      updates: { positionMs?: number; label?: string; color?: string }
    ) => {
      const updated = persistUpdateModuleBookmark(
        adapter,
        userId,
        moduleId,
        bookmarkId,
        updates
      )
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.map((m) =>
              m.id === moduleId
                ? {
                    ...m,
                    bookmarks: (m.bookmarks ?? [])
                      .map((b) => (b.id === bookmarkId ? updated : b))
                      .sort((a, b) => a.positionMs - b.positionMs),
                  }
                : m
            ),
          })),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteModuleBookmark = useCallback(
    (moduleId: string, bookmarkId: string) => {
      const deleted = persistDeleteModuleBookmark(adapter, userId, moduleId, bookmarkId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.map((m) =>
              m.id === moduleId ? { ...m, bookmarks: (m.bookmarks ?? []).filter((b) => b.id !== bookmarkId) } : m
            ),
          })),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createMomentTrack = useCallback(
    (projectId: string, name: string) => {
      const track = persistCreateMomentTrack(adapter, userId, projectId, name)
      if (!track) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, momentTracks: [...p.momentTracks, track] } : p
        ),
      }))
      return track
    },
    [adapter, userId]
  )

  const updateMomentTrack = useCallback(
    (projectId: string, trackId: string, updates: { name?: string }) => {
      const updated = persistUpdateMomentTrack(adapter, userId, projectId, trackId, updates)
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  momentTracks: p.momentTracks.map((t) => (t.id === trackId ? updated : t)),
                }
              : p
          ),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteMomentTrack = useCallback(
    (projectId: string, trackId: string) => {
      const deleted = persistDeleteMomentTrack(adapter, userId, projectId, trackId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId ? { ...p, momentTracks: p.momentTracks.filter((t) => t.id !== trackId) } : p
          ),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createMoment = useCallback(
    (
      projectId: string,
      trackId: string,
      moment: { label: string; startMs: number; endMs: number; color?: string }
    ) => {
      const created = persistCreateMoment(adapter, userId, projectId, trackId, moment)
      if (!created) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
                ...p,
                momentTracks: p.momentTracks.map((t) =>
                  t.id === trackId ? { ...t, moments: [...t.moments, created].sort((a, b) => a.startMs - b.startMs) } : t
                ),
              }
            : p
        ),
      }))
      return created
    },
    [adapter, userId]
  )

  const updateMoment = useCallback(
    (
      projectId: string,
      trackId: string,
      momentId: string,
      updates: { label?: string; startMs?: number; endMs?: number; color?: string }
    ) => {
      const updated = persistUpdateMoment(adapter, userId, projectId, trackId, momentId, updates)
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  momentTracks: p.momentTracks.map((t) =>
                    t.id === trackId
                      ? {
                          ...t,
                          moments: t.moments.map((m) => (m.id === momentId ? updated : m)).sort((a, b) => a.startMs - b.startMs),
                        }
                      : t
                  ),
                }
              : p
          ),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const deleteMoment = useCallback(
    (projectId: string, trackId: string, momentId: string) => {
      const deleted = persistDeleteMoment(adapter, userId, projectId, trackId, momentId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? {
                  ...p,
                  momentTracks: p.momentTracks.map((t) =>
                    t.id === trackId ? { ...t, moments: t.moments.filter((m) => m.id !== momentId) } : t
                  ),
                }
              : p
          ),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const addBlockToModule = useCallback(
    (moduleId: string, block: Omit<TimelineBlock, 'id'>) => {
      const newBlock = persistAddBlockToModule(adapter, userId, moduleId, block)
      if (!newBlock) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => ({
          ...p,
          modules: p.modules.map((m) =>
            m.id === moduleId ? { ...m, blocks: [...m.blocks, newBlock] } : m
          ),
        })),
      }))
      return newBlock
    },
    [adapter, userId]
  )

  const updateModuleBlock = useCallback(
    (
      moduleId: string,
      blockId: string,
      updates: Partial<Pick<TimelineBlock, 'startMs' | 'durationMs' | 'type' | 'color' | 'effectKind' | 'effectParams' | 'outputIndex'>>
    ) => {
      const updated = persistUpdateModuleBlock(
        adapter,
        userId,
        moduleId,
        blockId,
        updates
      )
      if (updated) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.map((m) =>
              m.id === moduleId
                ? {
                    ...m,
                    blocks: m.blocks.map((b) =>
                      b.id === blockId ? updated : b
                    ),
                  }
                : m
            ),
          })),
        }))
      }
      return updated
    },
    [adapter, userId]
  )

  const removeBlockFromModule = useCallback(
    (moduleId: string, blockId: string) => {
      const deleted = persistRemoveBlockFromModule(
        adapter,
        userId,
        moduleId,
        blockId
      )
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) => ({
            ...p,
            modules: p.modules.map((m) =>
              m.id === moduleId
                ? { ...m, blocks: m.blocks.filter((b) => b.id !== blockId) }
                : m
            ),
          })),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const createCard = useCallback(
    (projectId: string, uuid: string, name?: string) => {
      const card = persistCreateCard(adapter, userId, projectId, uuid, name)
      if (!card) return null
      setData((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, cards: [...p.cards, card] } : p
        ),
      }))
      return card
    },
    [adapter, userId]
  )

  const deleteCard = useCallback(
    (projectId: string, cardId: string) => {
      const deleted = persistDeleteCard(adapter, userId, projectId, cardId)
      if (deleted) {
        setData((prev) => ({
          ...prev,
          projects: prev.projects.map((p) =>
            p.id === projectId
              ? { ...p, cards: p.cards.filter((c) => c.id !== cardId) }
              : p
          ),
        }))
      }
      return deleted
    },
    [adapter, userId]
  )

  const exportData = useCallback(() => exportUserDataToJson(data), [data])

  const importData = useCallback(
    (json: string) => {
      const imported = parseUserDataFromJson(json)
      saveUserData(adapter, userId, imported)
      historyRef.current = []
      futureRef.current = []
      setDataState(imported)
    },
    [adapter, userId]
  )

  const clearAllData = useCallback(() => {
    const empty = createEmptyData()
    saveUserData(adapter, userId, empty)
    historyRef.current = []
    futureRef.current = []
    setDataState(empty)
  }, [adapter, userId])

  useEffect(() => {
    if (!adapter) return
    historyRef.current = []
    futureRef.current = []
    setDataState(loadUserData(adapter, userId))
  }, [userId, adapter])

  const contextValue = useMemo<DataContextValue | null>(
    () => {
      if (!adapter) return null
      return {
      data,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      createProject,
      updateProject,
      deleteProject,
      createModule,
      updateModule,
      deleteModule,
      createBookmark,
      updateBookmark,
      deleteBookmark,
      createModuleBookmark,
      updateModuleBookmark,
      deleteModuleBookmark,
      createMomentTrack,
      updateMomentTrack,
      deleteMomentTrack,
      createMoment,
      updateMoment,
      deleteMoment,
      addBlockToModule,
      updateModuleBlock,
      removeBlockFromModule,
      createCard,
      deleteCard,
      undo,
      redo,
      canUndo,
      canRedo,
      exportData,
      importData,
      clearAllData,
    }
    },
    [
      adapter,
      data,
      createWorkspace,
      updateWorkspace,
      deleteWorkspace,
      createProject,
      updateProject,
      deleteProject,
      createModule,
      updateModule,
      deleteModule,
      createBookmark,
      updateBookmark,
      deleteBookmark,
      createModuleBookmark,
      updateModuleBookmark,
      deleteModuleBookmark,
      createMomentTrack,
      updateMomentTrack,
      deleteMomentTrack,
      createMoment,
      updateMoment,
      deleteMoment,
      addBlockToModule,
      updateModuleBlock,
      removeBlockFromModule,
      createCard,
      deleteCard,
      undo,
      redo,
      canUndo,
      canRedo,
      exportData,
      importData,
      clearAllData,
    ]
  )

  if (!contextValue) {
    return (
      <div className="app-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Chargement...
      </div>
    )
  }

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  )
}
