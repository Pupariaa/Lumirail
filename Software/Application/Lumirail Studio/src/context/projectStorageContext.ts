import { createContext } from 'react'
import type { ProjectStorageOrigin } from '../lib/preferences'

export interface ProjectStorageContextValue {
  origin: ProjectStorageOrigin
  setOrigin: (origin: ProjectStorageOrigin) => void
  gatewayUsbPresent: boolean
}

export const ProjectStorageContext = createContext<ProjectStorageContextValue | null>(null)
