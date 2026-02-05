export type SerialConnectionState = 'disconnected' | 'connecting' | 'connected'

export interface SerialPortOpenOptions {
  baudRate: number
}

export interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialOptions {
  filters?: SerialPortFilter[]
}

export interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialSignals {
  dataTerminalReady?: boolean
  requestToSend?: boolean
}

export interface Serial extends EventTarget {
  requestPort(options?: SerialOptions): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

export interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array>
  readonly writable: WritableStream<Uint8Array>
  open(options: SerialPortOpenOptions): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
  setSignals?(signals: SerialSignals): Promise<void>
}

declare global {
  interface Navigator {
    serial?: Serial
  }
}

export {}
