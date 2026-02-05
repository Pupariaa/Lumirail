import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { serialConnection } from '../serial'
import { createElectronSerialAdapter } from '../serial/electronSerialAdapter'
import { playSuccess, playError } from '../lib/sounds'
import type { SerialConnectionState, ModuleInfo } from '../serial'
import { SerialContext } from './serialContext'

const isDesktop = typeof window !== 'undefined' && !!window.electronSerial

export function SerialProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SerialConnectionState>(serialConnection.getState())
  const [error, setError] = useState<string | null>(null)
  const [connectedModuleSn, setConnectedModuleSn] = useState<string | null>(null)
  const [connectedModuleInfo, setConnectedModuleInfo] = useState<ModuleInfo | null>(null)
  const [modulePresent, setModulePresent] = useState(serialConnection.getModulePresent())
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectedModuleInfoRef = useRef<ModuleInfo | null>(null)
  connectedModuleInfoRef.current = connectedModuleInfo

  useEffect(() => {
    return serialConnection.subscribe(setState)
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    const adapter = createElectronSerialAdapter()
    const unsubConnected = adapter.onConnected(() => {
      const p = adapter.getPort()
      if (p && serialConnection.getState() === 'disconnected') {
        serialConnection.connectWithAdapter(adapter).catch(() => {})
      }
    })
    const unsubDisconnected = adapter.onDisconnected(() => {
      serialConnection.disconnect()
    })
    adapter.isConnected().then((ok) => {
      if (ok && serialConnection.getState() === 'disconnected') {
        const p = adapter.getPort()
        if (p) serialConnection.connectWithAdapter(adapter).catch(() => {})
      }
    })
    return () => {
      adapter.unsubscribe()
      unsubConnected()
      unsubDisconnected()
    }
  }, [])

  useEffect(() => {
    if (state === 'connected') setError(null)
    if (state !== 'connected') {
      setConnectedModuleSn(null)
      setConnectedModuleInfo(null)
      setModulePresent(false)
      return
    }
    if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    fetchTimeoutRef.current = setTimeout(() => {
      fetchTimeoutRef.current = null
      serialConnection.getModuleInfo().then((info) => {
        const sn = (info.board['SN'] ?? '').trim()
        setConnectedModuleSn(sn || null)
        setConnectedModuleInfo(info)
      }).catch(() => {
        setConnectedModuleSn(null)
        setConnectedModuleInfo(null)
      })
    }, 600)
    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    }
  }, [state])

  useEffect(() => {
    return serialConnection.subscribeModulePresence((present) => {
      setModulePresent(present)
      if (!present) return
      if (connectedModuleInfoRef.current !== null) return
      serialConnection.getModuleInfo().then((info) => {
        const sn = (info.board['SN'] ?? '').trim()
        setConnectedModuleSn(sn || null)
        setConnectedModuleInfo(info)
      }).catch(() => { })
    })
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    if (isDesktop) return
    try {
      await serialConnection.connect()
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('No port selected by the user')) return
      setError(msg)
      throw err
    }
  }, [])

  const disconnect = useCallback(async () => {
    setError(null)
    await serialConnection.disconnect()
  }, [])

  const getBoardSerial = useCallback(async () => {
    setError(null)
    try {
      return await serialConnection.getBoardSerial()
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const getBoardInfo = useCallback(async () => {
    setError(null)
    try {
      return await serialConnection.getBoardInfo()
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const getModuleInfo = useCallback(async () => {
    setError(null)
    try {
      const info = await serialConnection.getModuleInfo()
      const sn = (info.board['SN'] ?? '').trim()
      setConnectedModuleSn(sn || null)
      setConnectedModuleInfo(info)
      return info
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const setConfig = useCallback(async (key: string, value: string | number) => {
    setError(null)
    try {
      return await serialConnection.setConfig(key, value)
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const uploadScene = useCallback(async (
    sceneText: string,
    options: Parameters<typeof serialConnection.uploadScene>[1]
  ) => {
    setError(null)
    try {
      await serialConnection.uploadScene(sceneText, options)
      playSuccess()
    } catch (err) {
      playError()
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const uploadLfp = useCallback(async (
    lfpBuffer: ArrayBuffer,
    options: Parameters<typeof serialConnection.uploadLfp>[1]
  ) => {
    setError(null)
    try {
      await serialConnection.uploadLfp(lfpBuffer, options)
      playSuccess()
    } catch (err) {
      playError()
      const msg = (err as Error).message
      setError(msg)
      throw err
    }
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = {
    state,
    connect,
    disconnect,
    getBoardSerial,
    getBoardInfo,
    getModuleInfo,
    setConfig,
    uploadScene,
    uploadLfp,
    isSupported: serialConnection.isSupported(),
    error,
    clearError,
    connectedModuleSn,
    connectedModuleInfo,
    modulePresent,
  }

  return <SerialContext.Provider value={value}>{children}</SerialContext.Provider>
}
