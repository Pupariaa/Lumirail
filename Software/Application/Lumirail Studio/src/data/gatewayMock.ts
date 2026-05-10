export type GatewayVariantId = 'standard' | 'plus' | 'pro'

export interface GatewayIdentityMock {
  variant: GatewayVariantId
  variantLabel: string
  modelCode: string
  serialNumber: string
  firmwareVersion: string
  uptimeLabel: string
}

export interface PowerRailMock {
  id: string
  label: string
  voltageV: number
  currentA: number
  nominalV: number
  ok: boolean
}

export interface ThermalZoneMock {
  id: string
  label: string
  tempC: number
  limitC: number
}

export interface InterfaceMock {
  id: string
  label: string
  role: string
  state: 'ok' | 'idle' | 'absent' | 'warn'
  detail: string
}

export interface CanNodeMock {
  id: string
  physicalLine: number
  logicalBus: 'A' | 'B'
  nodeId: number
  serialHint: string
  moduleType: string
  sceneState: string
  lastSeenMs: number
  rssiOrQuality?: string
}

export interface GatewaySnapshotMock {
  identity: GatewayIdentityMock
  powerRails: PowerRailMock[]
  thermal: ThermalZoneMock[]
  fanPercent: number
  interfaces: InterfaceMock[]
  canNodes: CanNodeMock[]
}

export interface GatewayProcessorSpec {
  id: string
  name: string
  context: string
}

export interface GatewayCommonSpecs {
  mainSocProcessors: GatewayProcessorSpec[]
  radioCoprocessors: GatewayProcessorSpec[]
  flashMegabytes: number
}

export const GATEWAY_COMMON_SPECS: GatewayCommonSpecs = {
  mainSocProcessors: [
    { id: 'soc_hp_1', name: 'HP RISC-V CPU', context: 'SoC principal' },
    { id: 'soc_hp_2', name: 'HP RISC-V CPU', context: 'SoC principal' },
    { id: 'soc_lp', name: 'LP 32-bit RISC-V CPU', context: 'SoC principal' },
  ],
  radioCoprocessors: [
    { id: 'radio_hp', name: 'HP ESP-RISC-V CPU', context: 'Radio · co-processeur' },
    { id: 'radio_lp', name: 'LP 32-bit RISC-V CPU', context: 'Radio · co-processeur' },
  ],
  flashMegabytes: 32,
}

export const MOCK_GATEWAY_SNAPSHOT: GatewaySnapshotMock = {
  identity: {
    variant: 'plus',
    variantLabel: 'Passerelle Plus',
    modelCode: 'GW-P4-PLUS',
    serialNumber: 'LR-GW-2026-0042',
    firmwareVersion: '0.4.0-mock',
    uptimeLabel: '2 j 14 h',
  },
  powerRails: [
    { id: 'rail_3v3', label: '3V3 rail', voltageV: 3.31, currentA: 0.42, nominalV: 3.3, ok: true },
    { id: 'rail_5v', label: '5V rail', voltageV: 5.04, currentA: 0.18, nominalV: 5.0, ok: true },
    { id: 'rail_12v', label: '12V entrée', voltageV: 12.1, currentA: 1.35, nominalV: 12.0, ok: true },
    { id: 'rail_vbus', label: 'USB VBUS', voltageV: 5.02, currentA: 0.09, nominalV: 5.0, ok: true },
  ],
  thermal: [
    { id: 'th_p4', label: 'ESP32-P4', tempC: 48, limitC: 85 },
    { id: 'th_board', label: 'Carte', tempC: 39, limitC: 70 },
    { id: 'th_can', label: 'Drivers CAN', tempC: 41, limitC: 85 },
  ],
  fanPercent: 28,
  interfaces: [
    {
      id: 'usb_c',
      label: 'USB-C',
      role: 'Studio (CDC ACM)',
      state: 'ok',
      detail: '115200 baud · lien actif',
    },
    {
      id: 'usb_a',
      label: 'USB-A',
      role: 'Hôte (rôle TBD)',
      state: 'idle',
      detail: 'Aucun périphérique',
    },
    {
      id: 'eth',
      label: 'RJ45',
      role: 'Ethernet',
      state: 'absent',
      detail: 'Non équipé sur carte nue',
    },
    {
      id: 'can_l1',
      label: 'CAN ligne 1',
      role: 'Duplex · TWAI #1 / #2',
      state: 'ok',
      detail: '500 kbit/s nominal · 2 bus logiques',
    },
    {
      id: 'can_l2',
      label: 'CAN ligne 2',
      role: 'SPI-CAN (mock)',
      state: 'idle',
      detail: 'Réservé variante Plus',
    },
    {
      id: 'dcc',
      label: 'Sortie DCC',
      role: '12 V voie',
      state: 'absent',
      detail: 'Non équipé sur carte nue',
    },
  ],
  canNodes: [
    {
      id: 'n1',
      physicalLine: 1,
      logicalBus: 'A',
      nodeId: 16,
      serialHint: 'LMS-01-AA-BB-CC-DD',
      moduleType: 'LMS-L1',
      sceneState: 'Scene A · lecture',
      lastSeenMs: 120,
      rssiOrQuality: 'OK',
    },
    {
      id: 'n2',
      physicalLine: 1,
      logicalBus: 'B',
      nodeId: 24,
      serialHint: 'LMS-02-EE-FF-00-11',
      moduleType: 'LMS-L1',
      sceneState: 'Idle',
      lastSeenMs: 340,
      rssiOrQuality: 'OK',
    },
    {
      id: 'n3',
      physicalLine: 1,
      logicalBus: 'A',
      nodeId: 40,
      serialHint: 'LMS-03-22-33-44-55',
      moduleType: 'LMS-L1',
      sceneState: 'Erreur LED (mock)',
      lastSeenMs: 890,
      rssiOrQuality: 'WARN',
    },
  ],
}
