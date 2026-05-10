import { useEffect, useState } from 'react'
import type {
  CpuTelemetryReading,
  DomainTelemetry,
  GatewayHardwareTelemetry,
  RailTelemetry,
} from '../data/gatewayTelemetry'

function clampVolts(v: number): number {
  return Math.min(3.35, Math.max(3.25, v))
}

function clampMv(mv: number): number {
  return Math.min(3350, Math.max(3250, Math.round(mv)))
}

function clampAmpere(a: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, a))
}

function simulatedRail(t: number, seed: number, kind: 'p4' | 'c6'): RailTelemetry {
  const v = clampVolts(
    3.3 + 0.03 * Math.sin(t * 0.11 + seed) + 0.006 * Math.sin(t * 0.19 + seed * 2.1)
  )
  if (kind === 'p4') {
    const mid = 0.96
    const wobble =
      0.27 * Math.sin(t * 0.09 + seed * 1.4) + 0.075 * Math.sin(t * 0.071 + seed * 1.1)
    const currentA = clampAmpere(mid + wobble, 0.52, 1.48)
    return {
      sensorConnected: true,
      voltageV: v,
      currentA,
      powerW: v * currentA,
    }
  }
  const mid = 0.34
  const wobble =
    0.095 * Math.sin(t * 0.09 + seed * 1.4) + 0.032 * Math.sin(t * 0.065 + seed * 2.3)
  const currentA = clampAmpere(mid + wobble, 0.16, 0.58)
  return {
    sensorConnected: true,
    voltageV: v,
    currentA,
    powerW: v * currentA,
  }
}

function simulatedCoreMv(t: number, coreIndex: number, seed: number): number {
  return clampMv(
    3300 +
      28 * Math.sin(t * 0.12 + coreIndex * 1.05 + seed) +
      6 * Math.sin(t * 0.17 + seed * 1.15 + coreIndex * 0.55)
  )
}

function simulatedCoreMw(
  voltageMv: number,
  t: number,
  coreIndex: number,
  seed: number,
  kind: 'p4' | 'c6'
): number {
  if (kind === 'p4') {
    const hp = coreIndex < 2
    const base = hp ? 410 : 165
    const swing = hp ? 175 : 95
    const iMa = base + swing * Math.sin(t * 0.13 + coreIndex * 0.88 + seed)
    const ma = hp
      ? Math.min(780, Math.max(155, Math.round(iMa)))
      : Math.min(360, Math.max(62, Math.round(iMa)))
    return (voltageMv * ma) / 1000
  }
  const iMa = 118 + 72 * Math.sin(t * 0.13 + coreIndex * 0.88 + seed)
  const ma = Math.min(285, Math.max(44, Math.round(iMa)))
  return (voltageMv * ma) / 1000
}

function overlayDomain(
  domain: DomainTelemetry,
  t: number,
  seed: number,
  minCpus: number,
  kind: 'p4' | 'c6'
): DomainTelemetry {
  const rail = simulatedRail(t, seed, kind)
  const cpus: CpuTelemetryReading[] = []
  for (let i = 0; i < minCpus; i++) {
    const base = domain.cpus[i] ?? {
      megahertz: null,
      tempC: null,
      voltageMv: null,
      powerMw: null,
    }
    const vmv = simulatedCoreMv(t, i, seed)
    cpus.push({
      ...base,
      voltageMv: vmv,
      powerMw: simulatedCoreMw(vmv, t, i, seed, kind),
    })
  }
  return {
    ...domain,
    rail,
    cpus,
  }
}

export function overlaySimulatedPowerMetrics(
  base: GatewayHardwareTelemetry,
  timeSeconds: number
): GatewayHardwareTelemetry {
  const t = timeSeconds
  return {
    schema: base.schema,
    p4: overlayDomain(base.p4, t, 0, 3, 'p4'),
    c6: overlayDomain(base.c6, t, 5.7, 2, 'c6'),
  }
}

export const GATEWAY_POWER_SIM_UI_MS = 650

export function useGatewayPowerSimulationSeconds(): number {
  const [elapsedSec, setElapsedSec] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    const id = window.setInterval(() => {
      setElapsedSec((performance.now() - t0) / 1000)
    }, GATEWAY_POWER_SIM_UI_MS)
    return () => clearInterval(id)
  }, [])
  return elapsedSec
}
