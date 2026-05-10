import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { serialConnection } from '../serial'
import { useSerial } from './useSerial'
import { getProjectStorageOrigin, setProjectStorageOrigin, type ProjectStorageOrigin } from '../lib/preferences'
import { ProjectStorageContext } from './projectStorageContext'
import { GatewayUsbSwitchDialog } from '../components/GatewayUsbSwitchDialog'

export function ProjectStorageProvider({ children }: { children: ReactNode }) {
  const { state: serialState, deviceKind } = useSerial()
  const [origin, setOriginState] = useState<ProjectStorageOrigin>(() => getProjectStorageOrigin())
  const [usbDialogOpen, setUsbDialogOpen] = useState(false)
  const [gatewayUsbPresent, setGatewayUsbPresent] = useState(() => serialConnection.getGatewayUsbPresent())

  const setOrigin = useCallback((next: ProjectStorageOrigin) => {
    setProjectStorageOrigin(next)
    setOriginState(next)
  }, [])

  useEffect(() => {
    return serialConnection.subscribeGatewayUsb((present) => {
      setGatewayUsbPresent(present)
    })
  }, [])

  useEffect(() => {
    if (!gatewayUsbPresent) return
    if (serialState !== 'connected' || deviceKind !== 'gateway') return
    if (getProjectStorageOrigin() !== 'studio') return
    setUsbDialogOpen(true)
  }, [gatewayUsbPresent, serialState, deviceKind])

  const handleUseGateway = useCallback(() => {
    setOrigin('gateway_usb')
    setUsbDialogOpen(false)
  }, [setOrigin])

  const handleStayStudio = useCallback(() => {
    setUsbDialogOpen(false)
  }, [])

  return (
    <ProjectStorageContext.Provider value={{ origin, setOrigin, gatewayUsbPresent }}>
      <GatewayUsbSwitchDialog
        open={usbDialogOpen}
        onUseGatewayUsb={handleUseGateway}
        onStayStudio={handleStayStudio}
      />
      {children}
    </ProjectStorageContext.Provider>
  )
}
