import type { GatewayProcessorSpec } from './gatewayMock'

export interface CpuTelemetryReading {
  megahertz: number | null
  tempC: number | null
  voltageMv: number | null
  powerMw: number | null
}

export interface RailTelemetry {
  voltageV: number | null
  currentA: number | null
  powerW: number | null
  sensorConnected: boolean
}

export interface DomainTelemetry {
  heapFreeBytes: number | null
  internalTempC: number | null
  firmwareInfo: string | null
  rail: RailTelemetry
  cpus: CpuTelemetryReading[]
  fanPercent?: number | null
}

export interface GatewayHardwareTelemetry {
  schema: number
  p4: DomainTelemetry
  c6: DomainTelemetry
}

function railDerivedPowerW(r: RailTelemetry): number | null {
  if (r.powerW != null && Number.isFinite(r.powerW)) return r.powerW
  const v = r.voltageV
  const a = r.currentA
  if (v != null && a != null && Number.isFinite(v) && Number.isFinite(a)) return v * a
  return null
}

export function formatFreqMhz(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v)} MHz`
}

export function formatTempC(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${Math.round(v)} °C`
}

export function formatVoltageFromMv(mv: number | null): string {
  if (mv == null || !Number.isFinite(mv)) return '—'
  return `${(mv / 1000).toFixed(2)} V`
}

export function formatPowerMw(mw: number | null): string {
  if (mw == null || !Number.isFinite(mw)) return '—'
  if (mw >= 1000) return `${(mw / 1000).toFixed(2)} W`
  return `${Math.round(mw)} mW`
}

export function formatHeap(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—'
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${Math.round(bytes)} o`
}

export function formatRailTriple(r: RailTelemetry): { v: string; a: string; w: string } {
  const pw = railDerivedPowerW(r)
  return {
    v: r.voltageV != null && Number.isFinite(r.voltageV) ? `${r.voltageV.toFixed(2)} V` : '—',
    a: r.currentA != null && Number.isFinite(r.currentA) ? `${r.currentA.toFixed(3)} A` : '—',
    w: pw != null ? `${pw.toFixed(2)} W` : '—',
  }
}

function nullCpu(): CpuTelemetryReading {
  return { megahertz: null, tempC: null, voltageMv: null, powerMw: null }
}

const EMPTY_RAIL: RailTelemetry = {
  voltageV: null,
  currentA: null,
  powerW: null,
  sensorConnected: false,
}

export const EMPTY_GATEWAY_TELEMETRY: GatewayHardwareTelemetry = {
  schema: 1,
  p4: {
    heapFreeBytes: null,
    internalTempC: null,
    firmwareInfo: null,
    rail: EMPTY_RAIL,
    fanPercent: null,
    cpus: [nullCpu(), nullCpu(), nullCpu()],
  },
  c6: {
    heapFreeBytes: null,
    internalTempC: null,
    firmwareInfo: null,
    rail: EMPTY_RAIL,
    cpus: [nullCpu(), nullCpu()],
  },
}

export const DEV_GW_MON_PARSE_TEST: GatewayHardwareTelemetry = {
  schema: 1,
  p4: {
    heapFreeBytes: 204800,
    internalTempC: 42,
    firmwareInfo: 'parse-test',
    rail: EMPTY_RAIL,
    cpus: [
      { megahertz: 400, tempC: 41, voltageMv: null, powerMw: null },
      { megahertz: 400, tempC: 42, voltageMv: null, powerMw: null },
      { megahertz: 160, tempC: 40, voltageMv: null, powerMw: null },
    ],
  },
  c6: {
    heapFreeBytes: 65536,
    internalTempC: 44,
    firmwareInfo: 'parse-test',
    rail: EMPTY_RAIL,
    cpus: [
      { megahertz: 240, tempC: 43, voltageMv: null, powerMw: null },
      { megahertz: 80, tempC: 42, voltageMv: null, powerMw: null },
    ],
  },
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function readCpu(x: unknown): CpuTelemetryReading {
  if (!x || typeof x !== 'object') {
    return { megahertz: null, tempC: null, voltageMv: null, powerMw: null }
  }
  const r = x as Record<string, unknown>
  return {
    megahertz: num(r.mhz ?? r.megahertz ?? r.freq),
    tempC: num(r.t ?? r.tempC ?? r.temp ?? r.ts ?? r.dieC),
    voltageMv: num(r.mv ?? r.voltageMv ?? r.coreMv),
    powerMw: num(r.mw ?? r.powerMw ?? r.pMw),
  }
}

function readRail(x: unknown): RailTelemetry {
  if (!x || typeof x !== 'object') {
    return { voltageV: null, currentA: null, powerW: null, sensorConnected: false }
  }
  const r = x as Record<string, unknown>
  const hasKeys =
    r.v != null ||
    r.a != null ||
    r.w != null ||
    r.voltageV != null ||
    r.currentA != null ||
    r.powerW != null
  let sensorConnected = hasKeys
  if (typeof r.sensorOk === 'boolean') sensorConnected = r.sensorOk
  else if (typeof r.sensorConnected === 'boolean') sensorConnected = r.sensorConnected
  return {
    voltageV: num(r.v ?? r.voltageV),
    currentA: num(r.a ?? r.currentA),
    powerW: num(r.w ?? r.powerW),
    sensorConnected,
  }
}

function readDomain(x: unknown, minCpus: number): DomainTelemetry | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  const heap = num(r.heap ?? r.heapFreeBytes)
  const intTemp = num(
    r.intTempC ?? r.internalTempC ?? r.temp ?? r.chipTempC ?? r.dieTempC ?? r.tsensC
  )
  const fwRaw = r.fw ?? r.firmwareInfo
  const fw = typeof fwRaw === 'string' ? fwRaw : null
  let cpus: CpuTelemetryReading[] = []
  const arr = Array.isArray(r.cpus) ? r.cpus : Array.isArray(r.cpu) ? r.cpu : []
  cpus = arr.map(readCpu)
  while (cpus.length < minCpus) {
    cpus.push({ megahertz: null, tempC: null, voltageMv: null, powerMw: null })
  }
  const rail = readRail(r.rail ?? r.power)
  const fan = num(r.fan ?? r.fanPercent)
  return {
    heapFreeBytes: heap,
    internalTempC: intTemp,
    firmwareInfo: fw,
    rail,
    cpus,
    fanPercent: fan ?? undefined,
  }
}

export function parseGatewayMonPayload(raw: unknown): GatewayHardwareTelemetry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const p4 = o.p4 != null && typeof o.p4 === 'object' ? readDomain(o.p4, 3) : null
  if (!p4) return null
  const c6Parsed = o.c6 != null && typeof o.c6 === 'object' ? readDomain(o.c6, 2) : null
  const c6 = c6Parsed ?? EMPTY_GATEWAY_TELEMETRY.c6
  const sch = num(o.schema)
  return {
    schema: sch != null ? Math.floor(sch) : 1,
    p4,
    c6,
  }
}

export function normalizeCpuRows(
  specs: GatewayProcessorSpec[],
  cpus: CpuTelemetryReading[]
): { spec: GatewayProcessorSpec; reading: CpuTelemetryReading }[] {
  return specs.map((spec, i) => ({
    spec,
    reading:
      cpus[i] ?? {
        megahertz: null,
        tempC: null,
        voltageMv: null,
        powerMw: null,
      },
  }))
}
