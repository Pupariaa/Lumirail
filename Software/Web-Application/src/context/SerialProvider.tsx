import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { serialConnection } from '../serial'
import type { SerialConnectionState, ModuleInfo } from '../serial'
import { SerialContext } from './serialContext'

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
    try {
      await serialConnection.connect()
    } catch (err) {
      setError((err as Error).message)
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
    } catch (err) {
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
    } catch (err) {
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
