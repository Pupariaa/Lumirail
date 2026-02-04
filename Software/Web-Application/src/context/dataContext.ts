import { createContext } from 'react'
import type {
  UserData,
  Workspace,
  Project,
  Module,
  Bookmark,
  TimelineBlock,
  Card,
  OutputAddress,
  Moment,
  MomentTrack,
} from '../data'

export interface DataContextValue {
  data: UserData
  createWorkspace: (name: string) => Workspace
  updateWorkspace: (workspaceId: string, updates: { name?: string }) => Workspace | null
  deleteWorkspace: (workspaceId: string) => boolean
  createProject: (
    workspaceId: string,
    name: string,
    durationMinutes?: number
  ) => Project | null
  updateProject: (
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
  ) => Project | null
  deleteProject: (projectId: string) => boolean
  createModule: (
    projectId: string,
    name: string,
    outputAddresses?: OutputAddress[],
    storedModuleInfo?: import('../data').StoredModuleInfo
  ) => Module | null
  updateModule: (
    moduleId: string,
    updates: {
      name?: string
      outputAddresses?: OutputAddress[]
      blocks?: TimelineBlock[]
      storedModuleInfo?: import('../data').StoredModuleInfo
      outputTrackLabels?: Record<number, string>
    }
  ) => Module | null
  deleteModule: (moduleId: string) => boolean
  createBookmark: (
    projectId: string,
    positionMs: number,
    label: string
  ) => Bookmark | null
  updateBookmark: (
    projectId: string,
    bookmarkId: string,
    updates: { positionMs?: number; label?: string; color?: string }
  ) => Bookmark | null
  deleteBookmark: (projectId: string, bookmarkId: string) => boolean
  createModuleBookmark: (moduleId: string, positionMs: number, label: string) => Bookmark | null
  updateModuleBookmark: (
    moduleId: string,
    bookmarkId: string,
    updates: { positionMs?: number; label?: string; color?: string }
  ) => Bookmark | null
  deleteModuleBookmark: (moduleId: string, bookmarkId: string) => boolean
  createMomentTrack: (projectId: string, name: string) => MomentTrack | null
  updateMomentTrack: (projectId: string, trackId: string, updates: { name?: string }) => MomentTrack | null
  deleteMomentTrack: (projectId: string, trackId: string) => boolean
  createMoment: (
    projectId: string,
    trackId: string,
    moment: { label: string; startMs: number; endMs: number; color?: string }
  ) => Moment | null
  updateMoment: (
    projectId: string,
    trackId: string,
    momentId: string,
    updates: { label?: string; startMs?: number; endMs?: number; color?: string }
  ) => Moment | null
  deleteMoment: (projectId: string, trackId: string, momentId: string) => boolean
  addBlockToModule: (
    moduleId: string,
    block: Omit<TimelineBlock, 'id'>
  ) => TimelineBlock | null
  updateModuleBlock: (
    moduleId: string,
    blockId: string,
    updates: Partial<Pick<TimelineBlock, 'startMs' | 'durationMs' | 'type' | 'color' | 'effectKind' | 'effectParams' | 'outputIndex'>>
  ) => TimelineBlock | null
  removeBlockFromModule: (moduleId: string, blockId: string) => boolean
  createCard: (projectId: string, uuid: string, name?: string) => Card | null
  deleteCard: (projectId: string, cardId: string) => boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export const DataContext = createContext<DataContextValue | null>(null)
