import { createContext } from 'react'
import type { SerialConnectionState, ModuleInfo, UploadSceneOptions } from '../serial'

export interface SerialContextValue {
  state: SerialConnectionState
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  getBoardSerial: () => Promise<string>
  getBoardInfo: () => Promise<Record<string, string>>
  getModuleInfo: () => Promise<ModuleInfo>
  setConfig: (key: string, value: string | number) => Promise<boolean>
  uploadScene: (sceneText: string, options: UploadSceneOptions) => Promise<void>
  isSupported: boolean
  error: string | null
  clearError: () => void
  connectedModuleSn: string | null
  connectedModuleInfo: ModuleInfo | null
  modulePresent: boolean
}

export const SerialContext = createContext<SerialContextValue | null>(null)
