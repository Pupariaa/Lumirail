/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_DESKTOP?: string
}

declare global {
  interface Window {
    electronSerial?: {
      listPorts: () => Promise<{ path: string; portId: string; displayName?: string; portName?: string }[]>
      connectTo: (path: string) => Promise<void>
      onConnected: (cb: () => void) => () => void
      onDisconnected: (cb: () => void) => () => void
      onData: (cb: (data: Uint8Array | Buffer) => void) => () => void
      write: (data: ArrayBuffer | Uint8Array) => Promise<void>
      disconnect: () => Promise<void>
      isConnected: () => Promise<boolean>
    }
  }
}
