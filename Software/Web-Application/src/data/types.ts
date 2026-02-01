export interface Workspace {
  id: string
  name: string
  ownerId: string
  createdAt: string
}

export interface OutputAddress {
  cardId: string
  outputIndex: number
}

export interface Card {
  id: string
  projectId: string
  uuid: string
  name?: string
  createdAt: string
}

export interface Bookmark {
  id: string
  positionMs: number
  label: string
  color?: string
}

export interface Moment {
  id: string
  label: string
  startMs: number
  endMs: number
  color?: string
}

export interface MomentTrack {
  id: string
  name: string
  moments: Moment[]
}

export type IntentionKind =
  | 'always_on'
  | 'always_off'
  | 'random_off'
  | 'random_on'
  | 'blink'
  | 'breathe'
  | 'flicker'
  | 'fade_in'
  | 'fade_out'
  | 'fade_in_out'

export interface IntentionParams {
  rateMs?: number
  periodMs?: number
  intensity?: number
  chance?: number
}

export interface TimelineBlock {
  id: string
  type: 'on' | 'off' | 'effect'
  startMs: number
  durationMs: number
  outputIndex: number
  color?: string
  effectKind?: IntentionKind
  effectParams?: IntentionParams
}

export interface StoredModuleInfo {
  board: Record<string, string>
  config: Record<string, string>
  s1Meta: Record<string, string>
  s2Meta: Record<string, string>
}

export interface Module {
  id: string
  projectId: string
  name: string
  outputAddresses: OutputAddress[]
  blocks: TimelineBlock[]
  bookmarks: Bookmark[]
  storedModuleInfo?: StoredModuleInfo
  outputTrackLabels?: Record<number, string>
  createdAt: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  durationMinutes: number
  bookmarks: Bookmark[]
  momentTracks: MomentTrack[]
  dayNightDawnSimulatedH?: number
  dayNightDuskSimulatedH?: number
  dayNightNightColor?: string
  dayNightDayColor?: string
  dayNightLabels?: { night1?: string; day?: string; night2?: string }
  modules: Module[]
  cards: Card[]
  createdAt: string
}

export interface UserData {
  workspaces: Workspace[]
  projects: Project[]
}
