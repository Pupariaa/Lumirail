import type { StorageAdapter } from '../storage'
import type {
  UserData,
  Workspace,
  Project,
  Module,
  StoredModuleInfo,
  Bookmark,
  TimelineBlock,
  IntentionKind,
  IntentionParams,
  Card,
  OutputAddress,
  Moment,
  MomentTrack,
} from './types'

const STORAGE_PREFIX = 'lumirail_userdata_'
const DATA_VERSION = 5
const MAX_NAME_LENGTH = 100
export const DURATION_MIN = 2
export const DURATION_MAX = 30

interface VersionedUserData extends UserData {
  _version?: number
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`
}

export function createEmptyData(): UserData {
  return {
    workspaces: [],
    projects: [],
  }
}

function getEmptyData(): UserData {
  return createEmptyData()
}

function repairOverlappingMoments(moments: Moment[], durationMs: number): Moment[] {
  const MIN = 60000
  const sorted = [...moments].sort((a, b) => a.startMs - b.startMs)
  const result: Moment[] = []
  let lastEnd = 0
  for (const m of sorted) {
    let start = Math.max(lastEnd, Math.max(0, m.startMs))
    let end = Math.min(durationMs, Math.max(start + MIN, m.endMs))
    if (end - start < MIN) end = Math.min(durationMs, start + MIN)
    result.push({ ...m, startMs: start, endMs: end })
    lastEnd = end
  }
  return result
}

function migrateData(data: VersionedUserData): UserData {
  const version = data._version ?? 0
  if (version < 2) return getEmptyData()
  const projects = (data.projects ?? []).map((p: Project & { momentTracks?: MomentTrack[]; dayNightDawnSimulatedH?: number; dayNightDuskSimulatedH?: number; modules?: Array<Module & { blocks?: Array<TimelineBlock & { outputIndex?: number }> }> }) => {
    const proj = p as Project
    let dawnH = proj.dayNightDawnSimulatedH ?? 6
    let duskH = proj.dayNightDuskSimulatedH ?? 20
    dawnH = Math.max(0.5, Math.min(23, dawnH))
    duskH = Math.max(dawnH + 0.5, Math.min(24, duskH))
    const durationMs = (proj.durationMinutes ?? 10) * 60 * 1000
    const repairedTracks = (proj.momentTracks ?? []).map((track) => ({
      ...track,
      moments: repairOverlappingMoments(track.moments, durationMs),
    }))
    const modules = (proj.modules ?? []).map((m: Module & { blocks?: Array<TimelineBlock & { outputIndex?: number }>; bookmarks?: Bookmark[] }) => ({
      ...m,
      outputTrackLabels: (m as Module).outputTrackLabels ?? {},
      bookmarks: m.bookmarks ?? [],
      blocks: (m.blocks ?? []).map((b) => ({
        ...b,
        outputIndex: (b.outputIndex ?? 0),
      })),
    }))
    return {
      ...proj,
      momentTracks: repairedTracks,
      dayNightDawnSimulatedH: dawnH,
      dayNightDuskSimulatedH: duskH,
      modules,
    }
  })
  return {
    workspaces: data.workspaces ?? [],
    projects,
  }
}

export function validateName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length > MAX_NAME_LENGTH) {
    return trimmed.slice(0, MAX_NAME_LENGTH)
  }
  return trimmed
}

export function clampDuration(minutes: number): number {
  return Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(minutes)))
}

export function loadUserData(adapter: StorageAdapter, userId: string): UserData {
  const raw = adapter.getItem(storageKey(userId))
  if (!raw) return getEmptyData()
  try {
    const parsed = JSON.parse(raw) as VersionedUserData
    return migrateData(parsed)
  } catch {
    return getEmptyData()
  }
}

export function parseUserDataFromJson(json: string): UserData {
  try {
    const parsed = JSON.parse(json) as VersionedUserData
    return migrateData(parsed)
  } catch {
    throw new Error('Invalid backup file')
  }
}

export function exportUserDataToJson(data: UserData): string {
  const versioned: VersionedUserData = { ...data, _version: DATA_VERSION }
  return JSON.stringify(versioned, null, 2)
}

export class StorageQuotaError extends Error {
  constructor(message = 'Storage quota exceeded') {
    super(message)
    this.name = 'StorageQuotaError'
  }
}

export function saveUserData(
  adapter: StorageAdapter,
  userId: string,
  data: UserData
): void {
  const versionedData: VersionedUserData = { ...data, _version: DATA_VERSION }
  try {
    adapter.setItem(storageKey(userId), JSON.stringify(versionedData))
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      throw new StorageQuotaError()
    }
    throw error
  }
}

export function createWorkspace(
  adapter: StorageAdapter,
  userId: string,
  name: string
): Workspace {
  const data = loadUserData(adapter, userId)
  const workspace: Workspace = {
    id: crypto.randomUUID(),
    name: validateName(name) || 'Untitled Workspace',
    ownerId: userId,
    createdAt: new Date().toISOString(),
  }
  data.workspaces.push(workspace)
  saveUserData(adapter, userId, data)
  return workspace
}

export function updateWorkspace(
  adapter: StorageAdapter,
  userId: string,
  workspaceId: string,
  updates: Partial<Pick<Workspace, 'name'>>
): Workspace | null {
  const data = loadUserData(adapter, userId)
  const index = data.workspaces.findIndex((w) => w.id === workspaceId)
  if (index === -1) return null
  const workspace = data.workspaces[index]
  if (updates.name !== undefined) {
    workspace.name = validateName(updates.name) || workspace.name
  }
  data.workspaces[index] = workspace
  saveUserData(adapter, userId, data)
  return workspace
}

export function deleteWorkspace(
  adapter: StorageAdapter,
  userId: string,
  workspaceId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const index = data.workspaces.findIndex((w) => w.id === workspaceId)
  if (index === -1) return false
  data.workspaces.splice(index, 1)
  data.projects = data.projects.filter((p) => p.workspaceId !== workspaceId)
  saveUserData(adapter, userId, data)
  return true
}

function createEmptyProject(workspaceId: string, name: string, durationMinutes: number): Project {
  const id = crypto.randomUUID()
  return {
    id,
    workspaceId,
    name: validateName(name) || 'Untitled Project',
    durationMinutes: clampDuration(durationMinutes),
    bookmarks: [],
    momentTracks: [],
    dayNightDawnSimulatedH: 6,
    dayNightDuskSimulatedH: 20,
    modules: [],
    cards: [],
    createdAt: new Date().toISOString(),
  }
}

export function createProject(
  adapter: StorageAdapter,
  userId: string,
  workspaceId: string,
  name: string,
  durationMinutes = 10
): Project | null {
  const data = loadUserData(adapter, userId)
  if (!data.workspaces.some((w) => w.id === workspaceId)) return null
  const project = createEmptyProject(workspaceId, name, durationMinutes)
  data.projects.push(project)
  saveUserData(adapter, userId, data)
  return project
}

export function updateProject(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'workspaceId' | 'durationMinutes' | 'bookmarks' | 'momentTracks' | 'dayNightDawnSimulatedH' | 'dayNightDuskSimulatedH' | 'dayNightNightColor' | 'dayNightDayColor' | 'dayNightLabels' | 'plateau'>>
): Project | null {
  const data = loadUserData(adapter, userId)
  const index = data.projects.findIndex((p) => p.id === projectId)
  if (index === -1) return null
  const project = data.projects[index]
  if (updates.name !== undefined) {
    project.name = validateName(updates.name) || project.name
  }
  if (updates.workspaceId !== undefined) {
    project.workspaceId = updates.workspaceId
  }
  if (updates.durationMinutes !== undefined) {
    project.durationMinutes = clampDuration(updates.durationMinutes)
  }
  if (updates.bookmarks !== undefined) {
    project.bookmarks = updates.bookmarks
  }
  if (updates.momentTracks !== undefined) {
    project.momentTracks = updates.momentTracks
  }
  if (updates.dayNightDawnSimulatedH !== undefined) {
    const dawn = Math.max(0, Math.min(24, updates.dayNightDawnSimulatedH))
    project.dayNightDawnSimulatedH = dawn
    if (project.dayNightDuskSimulatedH !== undefined && project.dayNightDuskSimulatedH <= dawn) {
      project.dayNightDuskSimulatedH = Math.min(24, dawn + 1)
    }
  }
  if (updates.dayNightDuskSimulatedH !== undefined) {
    const dusk = Math.max(0, Math.min(24, updates.dayNightDuskSimulatedH))
    project.dayNightDuskSimulatedH = dusk
    if (project.dayNightDawnSimulatedH !== undefined && project.dayNightDawnSimulatedH >= dusk) {
      project.dayNightDawnSimulatedH = Math.max(0, dusk - 1)
    }
  }
  if (updates.dayNightNightColor !== undefined) {
    project.dayNightNightColor = updates.dayNightNightColor || undefined
  }
  if (updates.dayNightDayColor !== undefined) {
    project.dayNightDayColor = updates.dayNightDayColor || undefined
  }
  if (updates.dayNightLabels !== undefined) {
    project.dayNightLabels = updates.dayNightLabels
  }
  if (updates.plateau !== undefined) {
    project.plateau = updates.plateau
  }
  data.projects[index] = project
  saveUserData(adapter, userId, data)
  return project
}

export function deleteProject(
  adapter: StorageAdapter,
  userId: string,
  projectId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const index = data.projects.findIndex((p) => p.id === projectId)
  if (index === -1) return false
  data.projects.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function createModule(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  name: string,
  outputAddresses: OutputAddress[] = [],
  storedModuleInfo?: StoredModuleInfo
): Module | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const module: Module = {
    id: crypto.randomUUID(),
    projectId,
    name: validateName(name) || 'Untitled Module',
    outputAddresses: [...outputAddresses],
    blocks: [],
    bookmarks: [],
    storedModuleInfo,
    createdAt: new Date().toISOString(),
  }
  project.modules.push(module)
  saveUserData(adapter, userId, data)
  return module
}

export function updateModule(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  updates: Partial<Pick<Module, 'name' | 'outputAddresses' | 'blocks' | 'storedModuleInfo' | 'outputTrackLabels'>>
): Module | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return null
  const index = project.modules.findIndex((m) => m.id === moduleId)
  if (index === -1) return null
  const mod = project.modules[index]
  if (updates.name !== undefined) mod.name = validateName(updates.name) || mod.name
  if (updates.outputAddresses !== undefined) mod.outputAddresses = updates.outputAddresses
  if (updates.blocks !== undefined) mod.blocks = updates.blocks
  if (updates.storedModuleInfo !== undefined) mod.storedModuleInfo = updates.storedModuleInfo
  if (updates.outputTrackLabels !== undefined) mod.outputTrackLabels = updates.outputTrackLabels
  saveUserData(adapter, userId, data)
  return mod
}

export function deleteModule(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return false
  const index = project.modules.findIndex((m) => m.id === moduleId)
  if (index === -1) return false
  project.modules.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function createBookmark(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  positionMs: number,
  label: string
): Bookmark | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const durationMs = project.durationMinutes * 60 * 1000
  const clampedPos = Math.max(0, Math.min(durationMs, Math.round(positionMs)))
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    positionMs: clampedPos,
    label: validateName(label) || 'Bookmark',
  }
  project.bookmarks.push(bookmark)
  project.bookmarks.sort((a, b) => a.positionMs - b.positionMs)
  saveUserData(adapter, userId, data)
  return bookmark
}

export function updateBookmark(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  bookmarkId: string,
  updates: Partial<Pick<Bookmark, 'positionMs' | 'label' | 'color'>>
): Bookmark | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const index = project.bookmarks.findIndex((b) => b.id === bookmarkId)
  if (index === -1) return null
  const bm = project.bookmarks[index]
  if (updates.positionMs !== undefined) {
    const durationMs = project.durationMinutes * 60 * 1000
    bm.positionMs = Math.max(0, Math.min(durationMs, Math.round(updates.positionMs)))
  }
  if (updates.label !== undefined) bm.label = validateName(updates.label) || bm.label
  if ('color' in updates) bm.color = updates.color || undefined
  project.bookmarks.sort((a, b) => a.positionMs - b.positionMs)
  saveUserData(adapter, userId, data)
  return bm
}

export function deleteBookmark(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  bookmarkId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return false
  const index = project.bookmarks.findIndex((b) => b.id === bookmarkId)
  if (index === -1) return false
  project.bookmarks.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function createModuleBookmark(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  positionMs: number,
  label: string
): Bookmark | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return null
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return null
  const durationMs = project.durationMinutes * 60 * 1000
  const clampedPos = Math.max(0, Math.min(durationMs, Math.round(positionMs)))
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    positionMs: clampedPos,
    label: validateName(label) || 'Bookmark',
  }
  const bookmarks = mod.bookmarks ?? []
  bookmarks.push(bookmark)
  bookmarks.sort((a, b) => a.positionMs - b.positionMs)
  mod.bookmarks = bookmarks
  saveUserData(adapter, userId, data)
  return bookmark
}

export function updateModuleBookmark(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  bookmarkId: string,
  updates: Partial<Pick<Bookmark, 'positionMs' | 'label' | 'color'>>
): Bookmark | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return null
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return null
  const bookmarks = mod.bookmarks ?? []
  const index = bookmarks.findIndex((b) => b.id === bookmarkId)
  if (index === -1) return null
  const bm = bookmarks[index]
  const durationMs = project.durationMinutes * 60 * 1000
  if (updates.positionMs !== undefined) {
    bm.positionMs = Math.max(0, Math.min(durationMs, Math.round(updates.positionMs)))
  }
  if (updates.label !== undefined) bm.label = validateName(updates.label) || bm.label
  if ('color' in updates) bm.color = updates.color || undefined
  bookmarks.sort((a, b) => a.positionMs - b.positionMs)
  saveUserData(adapter, userId, data)
  return bm
}

export function deleteModuleBookmark(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  bookmarkId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return false
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return false
  const bookmarks = mod.bookmarks ?? []
  const index = bookmarks.findIndex((b) => b.id === bookmarkId)
  if (index === -1) return false
  bookmarks.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

const MIN_MOMENT_MS = 60000

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

export function createMomentTrack(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  name: string
): MomentTrack | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const track: MomentTrack = {
    id: crypto.randomUUID(),
    name: validateName(name) || 'Moments',
    moments: [],
  }
  project.momentTracks.push(track)
  saveUserData(adapter, userId, data)
  return track
}

export function updateMomentTrack(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  trackId: string,
  updates: Partial<Pick<MomentTrack, 'name'>>
): MomentTrack | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const track = project.momentTracks.find((t) => t.id === trackId)
  if (!track) return null
  if (updates.name !== undefined) track.name = validateName(updates.name) || track.name
  saveUserData(adapter, userId, data)
  return track
}

export function deleteMomentTrack(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  trackId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return false
  const index = project.momentTracks.findIndex((t) => t.id === trackId)
  if (index === -1) return false
  project.momentTracks.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function createMoment(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  trackId: string,
  moment: Omit<Moment, 'id'>
): Moment | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const track = project.momentTracks.find((t) => t.id === trackId)
  if (!track) return null
  const durationMs = project.durationMinutes * 60 * 1000
  let startMs = Math.max(0, Math.min(durationMs - MIN_MOMENT_MS, Math.round(moment.startMs)))
  let endMs = Math.max(startMs + MIN_MOMENT_MS, Math.min(durationMs, Math.round(moment.endMs)))
  const tempId = 'new'
  const clamped = clampMomentToNonOverlap(startMs, endMs, tempId, track.moments, durationMs)
  startMs = clamped.startMs
  endMs = clamped.endMs
  const newMoment: Moment = {
    id: crypto.randomUUID(),
    label: validateName(moment.label) || 'Moment',
    startMs,
    endMs,
    color: moment.color,
  }
  track.moments.push(newMoment)
  track.moments.sort((a, b) => a.startMs - b.startMs)
  saveUserData(adapter, userId, data)
  return newMoment
}

export function updateMoment(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  trackId: string,
  momentId: string,
  updates: Partial<Pick<Moment, 'label' | 'startMs' | 'endMs' | 'color'>>
): Moment | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const track = project.momentTracks.find((t) => t.id === trackId)
  if (!track) return null
  const m = track.moments.find((mo) => mo.id === momentId)
  if (!m) return null
  const durationMs = project.durationMinutes * 60 * 1000
  if (updates.label !== undefined) m.label = validateName(updates.label) || m.label
  let newStart = updates.startMs !== undefined ? Math.max(0, Math.min(durationMs - MIN_MOMENT_MS, Math.round(updates.startMs))) : m.startMs
  let newEnd = updates.endMs !== undefined ? Math.max(newStart + MIN_MOMENT_MS, Math.min(durationMs, Math.round(updates.endMs))) : m.endMs
  if (updates.startMs !== undefined || updates.endMs !== undefined) {
    const clamped = clampMomentToNonOverlap(newStart, newEnd, m.id, track.moments, durationMs)
    m.startMs = clamped.startMs
    m.endMs = clamped.endMs
  }
  if ('color' in updates) m.color = updates.color
  track.moments.sort((a, b) => a.startMs - b.startMs)
  saveUserData(adapter, userId, data)
  return m
}

export function deleteMoment(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  trackId: string,
  momentId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return false
  const track = project.momentTracks.find((t) => t.id === trackId)
  if (!track) return false
  const index = track.moments.findIndex((m) => m.id === momentId)
  if (index === -1) return false
  track.moments.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function addBlockToModule(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  block: Omit<TimelineBlock, 'id'> & { effectKind?: IntentionKind; effectParams?: IntentionParams }
): TimelineBlock | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return null
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return null
  const durationMs = project.durationMinutes * 60 * 1000
  const outputIndex = block.outputIndex ?? 0
  const newBlock: TimelineBlock = {
    ...block,
    id: crypto.randomUUID(),
    outputIndex,
    startMs: Math.max(0, Math.min(durationMs - block.durationMs, Math.round(block.startMs))),
    durationMs: Math.max(500, Math.round(block.durationMs)),
    effectKind: block.effectKind,
    effectParams: block.effectParams,
  }
  mod.blocks.push(newBlock)
  saveUserData(adapter, userId, data)
  return newBlock
}

export function updateModuleBlock(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  blockId: string,
  updates: Partial<Pick<TimelineBlock, 'startMs' | 'durationMs' | 'type' | 'color' | 'effectKind' | 'effectParams' | 'outputIndex'>>
): TimelineBlock | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return null
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return null
  const block = mod.blocks.find((b) => b.id === blockId)
  if (!block) return null
  const durationMs = project.durationMinutes * 60 * 1000
  if (updates.outputIndex !== undefined) {
    block.outputIndex = Math.max(0, Math.round(updates.outputIndex))
  }
  if (updates.startMs !== undefined) {
    block.startMs = Math.max(0, Math.min(durationMs - block.durationMs, Math.round(updates.startMs)))
  }
  if (updates.durationMs !== undefined) {
    block.durationMs = Math.max(500, Math.round(updates.durationMs))
    block.startMs = Math.max(0, Math.min(durationMs - block.durationMs, block.startMs))
  }
  if (updates.type !== undefined) block.type = updates.type
  if (updates.color !== undefined) block.color = updates.color
  if (updates.effectKind !== undefined) block.effectKind = updates.effectKind
  if (updates.effectParams !== undefined) block.effectParams = updates.effectParams
  saveUserData(adapter, userId, data)
  return block
}

export function removeBlockFromModule(
  adapter: StorageAdapter,
  userId: string,
  moduleId: string,
  blockId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.modules.some((m) => m.id === moduleId))
  if (!project) return false
  const mod = project.modules.find((m) => m.id === moduleId)
  if (!mod) return false
  const index = mod.blocks.findIndex((b) => b.id === blockId)
  if (index === -1) return false
  mod.blocks.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}

export function createCard(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  uuid: string,
  name?: string
): Card | null {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return null
  const card: Card = {
    id: crypto.randomUUID(),
    projectId,
    uuid: uuid.trim(),
    name: name ? validateName(name) : undefined,
    createdAt: new Date().toISOString(),
  }
  project.cards.push(card)
  saveUserData(adapter, userId, data)
  return card
}

export function deleteCard(
  adapter: StorageAdapter,
  userId: string,
  projectId: string,
  cardId: string
): boolean {
  const data = loadUserData(adapter, userId)
  const project = data.projects.find((p) => p.id === projectId)
  if (!project) return false
  const index = project.cards.findIndex((c) => c.id === cardId)
  if (index === -1) return false
  project.cards.splice(index, 1)
  saveUserData(adapter, userId, data)
  return true
}
