export interface FieldBusElectricSnapshot {
  tempC: number
  voltageV: number
  currentA: number
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function simulatedCanLine0(t: number): FieldBusElectricSnapshot {
  const tempC = clamp(
    43.5 +
      5.5 * Math.sin(t * 0.095 + 1.15) +
      2.2 * Math.sin(t * 0.142 + 0.42),
    36,
    58
  )
  const voltageV = clamp(
    5.01 +
      0.045 * Math.sin(t * 0.088 + 2.05) +
      0.022 * Math.sin(t * 0.131 + 0.74),
    4.88,
    5.12
  )
  const currentA = clamp(
    0.054 + 0.031 * Math.sin(t * 0.104 + 0.48) + 0.012 * Math.sin(t * 0.067 + 1.9),
    0.022,
    0.112
  )
  return {
    tempC: Math.round(tempC * 10) / 10,
    voltageV: Math.round(voltageV * 1000) / 1000,
    currentA: Math.round(currentA * 1000) / 1000,
  }
}

export function simulatedDccLine(t: number): FieldBusElectricSnapshot {
  const tempC = clamp(
    49 +
      7 * Math.sin(t * 0.091 + 3.35) +
      2.5 * Math.sin(t * 0.118 + 1.05),
    38,
    66
  )
  const voltageV = clamp(
    12.02 +
      0.18 * Math.sin(t * 0.086 + 1.62) +
      0.06 * Math.sin(t * 0.124 + 2.4),
    11.65,
    12.42
  )
  const currentA = clamp(
    0.92 +
      0.52 * Math.sin(t * 0.099 + 2.75) +
      0.18 * Math.sin(t * 0.073 + 0.55),
    0.25,
    1.95
  )
  return {
    tempC: Math.round(tempC * 10) / 10,
    voltageV: Math.round(voltageV * 1000) / 1000,
    currentA: Math.round(currentA * 1000) / 1000,
  }
}

export function formatFieldBusTemp(c: number): string {
  return `${c.toFixed(1)} °C`
}

export function formatFieldBusVoltage(v: number): string {
  return `${v.toFixed(2)} V`
}

export function formatFieldBusCurrent(a: number): string {
  if (Math.abs(a) < 1) return `${Math.round(a * 1000)} mA`
  return `${a.toFixed(2)} A`
}
