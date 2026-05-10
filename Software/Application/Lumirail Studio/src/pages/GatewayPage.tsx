import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft, Activity, Cable, Cpu, Gauge, HardDrive, RadioTower, Zap } from 'lucide-react'
import { useSerial } from '../context/useSerial'
import { useProjectStorage } from '../context/useProjectStorage'
import { serialConnection } from '../serial'
import type {
  CpuTelemetryReading,
  GatewayHardwareTelemetry,
  RailTelemetry,
} from '../data/gatewayTelemetry'
import {
  DEV_GW_MON_PARSE_TEST,
  EMPTY_GATEWAY_TELEMETRY,
  formatFreqMhz,
  formatHeap,
  formatPowerMw,
  formatRailTriple,
  formatTempC,
  formatVoltageFromMv,
  normalizeCpuRows,
} from '../data/gatewayTelemetry'
import { useHelp } from '../context/useHelp'
import {
  formatFieldBusCurrent,
  formatFieldBusTemp,
  formatFieldBusVoltage,
  simulatedCanLine0,
  simulatedDccLine,
} from '../lib/gatewayFieldBusSimulation'
import { overlaySimulatedPowerMetrics, useGatewayPowerSimulationSeconds } from '../lib/gatewayPowerSimulation'
import { GATEWAY_SECTIONS } from '../lib/gatewaySections'
import { GATEWAY_COMMON_SPECS, MOCK_GATEWAY_SNAPSHOT } from '../data/gatewayMock'
import type { GatewayProcessorSpec, InterfaceMock } from '../data/gatewayMock'

function MonitoringStrip({ entries }: { entries: { label: string; value: string }[] }) {
  return (
    <div className="gateway-mon-strip">
      {entries.map((e) => (
        <div key={e.label} className="gateway-mon-strip-cell">
          <div className="gateway-mon-strip-label">{e.label}</div>
          <div className="gateway-mon-strip-value gateway-mono">{e.value}</div>
        </div>
      ))}
    </div>
  )
}

function MonitoringRailCard({ title, subtitle, rail }: { title: string; subtitle?: string; rail: RailTelemetry }) {
  const triple = formatRailTriple(rail)
  return (
    <div className="gateway-mon-rail-card">
      <div className="gateway-mon-rail-card-head">
        <span className="gateway-mon-rail-card-title">{title}</span>
        {subtitle ? <span className="gateway-mon-rail-card-sub">{subtitle}</span> : null}
      </div>
      {!rail.sensorConnected ? (
        <p className="gateway-mon-rail-unavail">
          Courant, tension et puissance : non disponibles tant que le capteur dédié et son pilote ne sont pas actifs (rails P4
          / C6).
        </p>
      ) : (
        <dl className="gateway-mon-rail-kv">
          <div>
            <dt>Tension</dt>
            <dd className="gateway-mono">{triple.v}</dd>
          </div>
          <div>
            <dt>Courant</dt>
            <dd className="gateway-mono">{triple.a}</dd>
          </div>
          <div>
            <dt>Puissance</dt>
            <dd className="gateway-mono">{triple.w}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}

function MonitoringCpuTable({
  rows,
}: {
  rows: { spec: GatewayProcessorSpec; reading: CpuTelemetryReading }[]
}) {
  return (
    <div className="gateway-table-wrap gateway-mon-table-wrap">
      <table className="gateway-table gateway-mon-table">
        <thead>
          <tr>
            <th>Coeur</th>
            <th className="gateway-mon-num">Fréquence</th>
            <th className="gateway-mon-num">Température</th>
            <th className="gateway-mon-num">Tension</th>
            <th className="gateway-mon-num">Puissance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ spec, reading }, index) => (
            <tr key={spec.id}>
              <td>
                <div className="gateway-mon-cpu-title">Coeur #{index}</div>
              </td>
              <td className="gateway-mon-num">{formatFreqMhz(reading.megahertz)}</td>
              <td className="gateway-mon-num">{formatTempC(reading.tempC)}</td>
              <td className="gateway-mon-num">{formatVoltageFromMv(reading.voltageMv)}</td>
              <td className="gateway-mon-num">{formatPowerMw(reading.powerMw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InterfaceStatePill({ iface }: { iface: InterfaceMock }) {
  const cls =
    iface.state === 'ok'
      ? 'gateway-pill gateway-pill-ok'
      : iface.state === 'warn'
        ? 'gateway-pill gateway-pill-warn'
        : iface.state === 'idle'
          ? 'gateway-pill gateway-pill-idle'
          : 'gateway-pill gateway-pill-absent'
  const label =
    iface.state === 'ok'
      ? 'OK'
      : iface.state === 'warn'
        ? 'Attention'
        : iface.state === 'idle'
          ? 'Inactif'
          : 'Absent'
  return <span className={cls}>{label}</span>
}

export function GatewayPage() {
  const { hash } = useLocation()
  const { state: serialState, deviceKind } = useSerial()
  const { origin: projectOrigin, setOrigin: setProjectOrigin, gatewayUsbPresent } = useProjectStorage()
  const { setActiveSectionId } = useHelp()
  const containerRef = useRef<HTMLDivElement>(null)
  const snap = MOCK_GATEWAY_SNAPSHOT
  const [liveTelem, setLiveTelem] = useState<GatewayHardwareTelemetry | null>(null)

  useEffect(() => serialConnection.subscribeGatewayTelemetry(setLiveTelem), [])

  const simTimeSec = useGatewayPowerSimulationSeconds()
  const telemBase = liveTelem ?? EMPTY_GATEWAY_TELEMETRY
  const telem = useMemo(
    () => overlaySimulatedPowerMetrics(telemBase, simTimeSec),
    [telemBase, simTimeSec]
  )
  const canLine0 = useMemo(() => simulatedCanLine0(simTimeSec), [simTimeSec])
  const dccLine = useMemo(() => simulatedDccLine(simTimeSec), [simTimeSec])
  const p4CpuRows = normalizeCpuRows(GATEWAY_COMMON_SPECS.mainSocProcessors, telem.p4.cpus)
  const c6CpuRows = normalizeCpuRows(GATEWAY_COMMON_SPECS.radioCoprocessors, telem.c6.cpus)

  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    setActiveSectionId(id)
    const container = containerRef.current
    const el = document.getElementById(id)
    if (!container || !el) return
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scrollTop = container.scrollTop + rect.top - containerRect.top - 16
      container.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' })
    })
  }, [hash, setActiveSectionId])

  useEffect(() => {
    return () => setActiveSectionId(null)
  }, [setActiveSectionId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ids = GATEWAY_SECTIONS.map((s) => s.id)
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        )
        const id = topmost.target.id
        if (ids.includes(id)) setActiveSectionId(id)
      },
      {
        root: container,
        rootMargin: '-10% 0px -70% 0px',
        threshold: 0,
      }
    )

    elements.forEach((el) => observer.observe(el))
    return () => elements.forEach((el) => observer.unobserve(el))
  }, [setActiveSectionId])

  const usbConnected = serialState === 'connected'
  const gatewayUsb = usbConnected && deviceKind === 'gateway'

  return (
    <div ref={containerRef} className="app-layout home-layout gateway-page">
      <header className="home-hero" aria-label="Passerelle">
        <Link to="/" className="settings-back-link">
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden />
          Retour
        </Link>
        <div className="home-hero-copy">
          <div className="home-kicker">Matériel</div>
          <div className="gateway-page-title-row">
            <h1 className="page-title">Passerelle</h1>
          </div>
          <p className="page-description">
            Supervision matérielle et bus CAN.             Tensions, courants et puissances (CPU, CAN ligne 0, DCC) sont simulés avec variation lente ; le reste provient
            du firmware lorsque la passerelle envoie{' '}
            <span className="gateway-mono">GW_MON</span>.
          </p>
          <div className="gateway-link-banner">
            <RadioTower size={16} strokeWidth={2} aria-hidden />
            <span>
              USB série :{' '}
              {usbConnected ? (
                gatewayUsb ? (
                  <strong>Périphérique passerelle détecté (GW_ACK)</strong>
                ) : (
                  <strong>Pont module — métriques passerelle non disponibles sur ce lien</strong>
                )
              ) : (
                <strong>non connecté</strong>
              )}
            </span>
          </div>
        </div>
      </header>

      <section id="gateway-overview" className="help-section">
        <h2 className="section-heading">
          <Cpu size={20} strokeWidth={2} aria-hidden />
          Vue d&apos;ensemble
        </h2>
        <div className="gateway-overview-grid">
          <dl className="gateway-kv">
            <dt>Modèle</dt>
            <dd>{snap.identity.variantLabel}</dd>
            <dt>Référence</dt>
            <dd><span className="gateway-mono">{snap.identity.modelCode}</span></dd>
            <dt>N° série</dt>
            <dd><span className="gateway-mono">{snap.identity.serialNumber}</span></dd>
            <dt>Firmware principal</dt>
            <dd><span className="gateway-mono">{telem.p4.firmwareInfo ?? '—'}</span></dd>
            <dt>Firmware co-processeur</dt>
            <dd><span className="gateway-mono">{telem.c6.firmwareInfo ?? '—'}</span></dd>
            <dt>Temps de fonctionnement</dt>
            <dd>{snap.identity.uptimeLabel}</dd>
          </dl>
          <div className="gateway-health-card">
            <div className="gateway-health-label">État global</div>
            <div className="gateway-health-value gateway-health-ok">Opérationnel</div>
            <p className="gateway-health-hint">
              Synthèse globale à enrichir lorsque le firmware exposera des statuts dédiés (ex. GW_INFO).
            </p>
          </div>
        </div>
      </section>

      <section id="gateway-monitoring" className="help-section">
        <h2 className="section-heading">
          <Gauge size={20} strokeWidth={2} aria-hidden />
          Monitoring matériel
        </h2>

        <div className="gateway-mon-zone">
          <h3 className="gateway-mon-zone-title">CPU Principal</h3>
          <MonitoringStrip
            entries={[
              { label: 'Heap libre', value: formatHeap(telem.p4.heapFreeBytes) },
              { label: 'Température interne', value: formatTempC(telem.p4.internalTempC) },
              {
                label: 'Ventilation',
                value:
                  telem.p4.fanPercent != null && Number.isFinite(telem.p4.fanPercent)
                    ? `${Math.round(telem.p4.fanPercent)} % PWM`
                    : '—',
              },
            ]}
          />
          <MonitoringRailCard title="Consommation" rail={telem.p4.rail} />
          <MonitoringCpuTable rows={p4CpuRows} />
        </div>

        <div className="gateway-mon-zone">
          <h3 className="gateway-mon-zone-title">Co CPU Radio</h3>
          <MonitoringStrip
            entries={[
              { label: 'Heap libre', value: formatHeap(telem.c6.heapFreeBytes) },
              { label: 'Température interne', value: formatTempC(telem.c6.internalTempC) },
            ]}
          />
          <MonitoringRailCard title="Consommation" rail={telem.c6.rail} />
          <MonitoringCpuTable rows={c6CpuRows} />
        </div>
      </section>

      <section id="gateway-can-line0" className="help-section">
        <h2 className="section-heading">
          <Cable size={20} strokeWidth={2} aria-hidden />
          CAN · ligne 0
        </h2>
        <div className="gateway-mon-zone">
          <MonitoringStrip
            entries={[
              { label: 'Température', value: formatFieldBusTemp(canLine0.tempC) },
              { label: 'Courant', value: formatFieldBusCurrent(canLine0.currentA) },
              { label: 'Tension', value: formatFieldBusVoltage(canLine0.voltageV) },
            ]}
          />
        </div>
      </section>

      <section id="gateway-dcc" className="help-section">
        <h2 className="section-heading">
          <Zap size={20} strokeWidth={2} aria-hidden />
          DCC
        </h2>
        <div className="gateway-mon-zone">
          <MonitoringStrip
            entries={[
              { label: 'Température', value: formatFieldBusTemp(dccLine.tempC) },
              { label: 'Courant', value: formatFieldBusCurrent(dccLine.currentA) },
              { label: 'Tension', value: formatFieldBusVoltage(dccLine.voltageV) },
            ]}
          />
        </div>
      </section>

      <section id="gateway-project-storage" className="help-section">
        <h2 className="section-heading">
          <HardDrive size={20} strokeWidth={2} aria-hidden />
          Projet &amp; clé USB
        </h2>
        <p className="gateway-can-intro">
          La clé USB sur la passerelle sert d&apos;archive portable : scènes brutes (LFP et métadonnées), configuration et
          vue projet pour qu&apos;un autre logiciel puisse tout relire. Lumirail Studio peut rester centré sur le stockage
          de ce poste ou déclarer la passerelle comme référence lorsque la clé est détectée.
        </p>
        <dl className="gateway-kv gateway-kv-block">
          <dt>Référence projet actuelle</dt>
          <dd>
            {projectOrigin === 'gateway_usb' ? (
              <span className="gateway-origin-badge gateway-origin-gateway">Passerelle + clé USB</span>
            ) : (
              <span className="gateway-origin-badge gateway-origin-studio">Stockage Lumirail Studio (ce poste)</span>
            )}
          </dd>
          <dt>Clé détectée (série)</dt>
          <dd>{gatewayUsbPresent ? 'Oui (GW_USB)' : 'Non'}</dd>
        </dl>
        <div className="gateway-storage-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={projectOrigin === 'studio'}
            onClick={() => setProjectOrigin('studio')}
          >
            Utiliser ce poste comme référence
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={projectOrigin === 'gateway_usb'}
            onClick={() => setProjectOrigin('gateway_usb')}
          >
            Utiliser la passerelle / clé comme référence
          </button>
        </div>
        {import.meta.env.DEV && (
          <div className="gateway-dev-sim">
            <span className="gateway-dev-sim-label">Dev · simuler lignes série</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => serialConnection.sendMessage('GW_USB:1')}>
              GW_USB:1
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => serialConnection.sendMessage('GW_USB:0')}>
              GW_USB:0
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                serialConnection.sendMessage('GW_MON:' + JSON.stringify(DEV_GW_MON_PARSE_TEST))
              }
            >
              GW_MON test
            </button>
          </div>
        )}
      </section>

      <section id="gateway-interfaces" className="help-section">
        <h2 className="section-heading">
          <Activity size={20} strokeWidth={2} aria-hidden />
          Interfaces
        </h2>
        <ul className="gateway-interface-list">
          {snap.interfaces.map((iface) => (
            <li key={iface.id} className="gateway-interface-row">
              <div className="gateway-interface-head">
                <span className="gateway-interface-title">{iface.label}</span>
                <InterfaceStatePill iface={iface} />
              </div>
              <div className="gateway-interface-role">{iface.role}</div>
              <div className="gateway-interface-detail">{iface.detail}</div>
            </li>
          ))}
        </ul>
      </section>

      <section id="gateway-can" className="help-section">
        <h2 className="section-heading">
          <RadioTower size={20} strokeWidth={2} aria-hidden />
          Bus CAN / modules Lumirail
        </h2>
        <p className="gateway-can-intro">
          Nœuds vus sur les bus logiques (données de démonstration). Correspondra aux LMS interrogés via la passerelle.
        </p>
        <div className="gateway-table-wrap">
          <table className="gateway-table">
            <thead>
              <tr>
                <th>Ligne</th>
                <th>Bus</th>
                <th>ID CAN</th>
                <th>Module</th>
                <th>N° série</th>
                <th>Scène</th>
                <th>Dernière vue</th>
              </tr>
            </thead>
            <tbody>
              {snap.canNodes.map((n) => (
                <tr key={n.id}>
                  <td>{n.physicalLine}</td>
                  <td>{n.logicalBus}</td>
                  <td><span className="gateway-mono">{n.nodeId}</span></td>
                  <td>{n.moduleType}</td>
                  <td><span className="gateway-mono">{n.serialHint}</span></td>
                  <td>{n.sceneState}</td>
                  <td>{n.lastSeenMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="gateway-footer-note">
        <Link to="/">Accueil</Link>
        {' · '}
        <Link to="/settings">Paramètres</Link>
      </p>
    </div>
  )
}
