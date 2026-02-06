import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Upload, Trash2, Info, FileText, Cpu } from 'lucide-react'
import { useData } from '../context/useData'
import { useHelp } from '../context/useHelp'
import { getSoundsEnabled, setSoundsEnabled, setTutorialDismissed, getDefaultProjectDuration, setDefaultProjectDuration } from '../lib/preferences'
import { DURATION_MIN, DURATION_MAX } from '../data'
import { SETTINGS_SECTIONS } from '../lib/settingsSections'

export function SettingsPage() {
  const navigate = useNavigate()
  const { hash } = useLocation()
  const { data, exportData, importData, clearAllData } = useData()
  const { setActiveSectionId } = useHelp()
  const containerRef = useRef<HTMLDivElement>(null)
  const [soundsEnabled, setSoundsEnabledState] = useState(true)
  const [defaultDuration, setDefaultDurationState] = useState(10)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSoundsEnabledState(getSoundsEnabled())
    setDefaultDurationState(getDefaultProjectDuration())
  }, [])

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
    const ids = SETTINGS_SECTIONS.map((s) => s.id)
    const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const topmost = visible.reduce((a, b) =>
          (a.boundingClientRect.top < b.boundingClientRect.top ? a : b)
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

  const handleSoundsToggle = () => {
    const next = !soundsEnabled
    setSoundsEnabled(next)
    setSoundsEnabledState(next)
  }

  const handleShowTutorial = () => {
    setTutorialDismissed(false)
    navigate('/')
  }

  const handleDefaultDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(e.target.value)
    const clamped = Number.isNaN(raw) ? DURATION_MIN : Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(raw)))
    setDefaultProjectDuration(clamped)
    setDefaultDurationState(clamped)
  }

  const handleExport = () => {
    const json = exportData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lumirail-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    setImportError(null)
    fileInputRef.current?.click()
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImportError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = String(reader.result)
        importData(json)
        navigate('/')
      } catch (err) {
        setImportError((err as Error).message || 'Invalid backup file')
      }
    }
    reader.readAsText(file)
  }

  const handleClearClick = () => {
    if (clearConfirm) {
      clearAllData()
      setClearConfirm(false)
      navigate('/')
    } else {
      setClearConfirm(true)
    }
  }

  const handleClearCancel = () => setClearConfirm(false)

  const version = import.meta.env.VITE_APP_VERSION ?? '0.1.0'
  const isDesktop = typeof window !== 'undefined' && !!window.electronSerial
  const buildMode = import.meta.env.MODE ?? 'development'

  const systemInfo = typeof navigator !== 'undefined' ? {
    platform: navigator.platform,
    language: navigator.language,
    screenSize: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '-',
  } : null

  return (
    <div ref={containerRef} className="app-layout home-layout settings-page">
      <header className="home-hero" aria-label="Paramètres">
        <Link to="/" className="settings-back-link">
          <ArrowLeft size={18} strokeWidth={2.5} aria-hidden />
          Retour
        </Link>
        <div className="home-hero-copy">
          <div className="home-kicker">Logiciel</div>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-description">
            Informations et paramètres de Lumirail Studio.
          </p>
        </div>
      </header>

      <section className="settings-section" id="settings-about" aria-labelledby="settings-about-heading">
        <h2 id="settings-about-heading" className="section-heading">
          <Info size={20} strokeWidth={2} aria-hidden />
          À propos
        </h2>
        <dl className="settings-list">
          <div className="settings-row">
            <dt>Version</dt>
            <dd>{version}</dd>
          </div>
          <div className="settings-row">
            <dt>Mode</dt>
            <dd>{isDesktop ? 'Desktop' : 'Web'}</dd>
          </div>
          <div className="settings-row">
            <dt>Build</dt>
            <dd>{buildMode}</dd>
          </div>
          <div className="settings-row">
            <dt>Aide</dt>
            <dd>
              <Link to="/help" className="btn btn-ghost btn-sm">
                Centre d&apos;aide
              </Link>
            </dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" id="settings-params" aria-labelledby="settings-params-heading">
        <h2 id="settings-params-heading" className="section-heading">Parametres</h2>
        <div className="settings-list">
          <div className="settings-row settings-row-toggle">
            <dt>Sons</dt>
            <dd>
              <button
                type="button"
                role="switch"
                aria-checked={soundsEnabled}
                aria-label={soundsEnabled ? 'Désactiver les sons' : 'Activer les sons'}
                className={`settings-toggle ${soundsEnabled ? 'settings-toggle-on' : ''}`}
                onClick={handleSoundsToggle}
              >
                <span className="settings-toggle-thumb" />
              </button>
            </dd>
          </div>
          <div className="settings-row settings-row-input">
            <dt>Durée par défaut des projets</dt>
            <dd>
              <input
                type="number"
                min={DURATION_MIN}
                max={DURATION_MAX}
                value={defaultDuration}
                onChange={handleDefaultDurationChange}
                className="settings-number-input"
                aria-label="Durée par défaut en minutes"
              />
              <span className="settings-input-suffix">min</span>
            </dd>
          </div>
          <div className="settings-row">
            <dt>Tutoriel</dt>
            <dd>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleShowTutorial}
              >
                Reafficher le tutoriel
              </button>
            </dd>
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-data" aria-labelledby="settings-data-heading">
        <h2 id="settings-data-heading" className="section-heading">Donnees</h2>
        <div className="settings-list">
          <div className="settings-row">
            <dt>Export</dt>
            <dd>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleExport}
                disabled={data.workspaces.length === 0 && data.projects.length === 0}
              >
                <Download size={14} strokeWidth={2.5} aria-hidden />
                Télécharger la sauvegarde
              </button>
            </dd>
          </div>
          <div className="settings-row">
            <dt>Import</dt>
            <dd>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="settings-file-input"
                aria-label="Fichier de sauvegarde"
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleImportClick}
              >
                <Upload size={14} strokeWidth={2.5} aria-hidden />
                Restaurer une sauvegarde
              </button>
              {importError && (
                <span className="settings-error" role="alert">{importError}</span>
              )}
            </dd>
          </div>
          <div className="settings-row">
            <dt>Effacer</dt>
            <dd>
              {clearConfirm ? (
                <span className="settings-clear-confirm">
                  <button type="button" className="btn btn-danger btn-sm" onClick={handleClearClick}>
                    Confirmer l&apos;effacement
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleClearCancel}>
                    Annuler
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm settings-clear-btn"
                  onClick={handleClearClick}
                >
                  <Trash2 size={14} strokeWidth={2.5} aria-hidden />
                  Effacer toutes les données
                </button>
              )}
            </dd>
          </div>
        </div>
      </section>

      <section className="settings-section" id="settings-licence" aria-labelledby="settings-licence-heading">
        <h2 id="settings-licence-heading" className="section-heading">
          <FileText size={20} strokeWidth={2} aria-hidden />
          Licence
        </h2>
        <p className="settings-licence-text">
          Lumirail Studio est un logiciel propriétaire développé par Lumirail. Les données créées (espaces, projets, modules, scènes) sont stockées localement sur votre appareil.
        </p>
      </section>

      <section className="settings-section" id="settings-system" aria-labelledby="settings-system-heading">
        <h2 id="settings-system-heading" className="section-heading">
          <Cpu size={20} strokeWidth={2} aria-hidden />
          Informations système
        </h2>
        {systemInfo ? (
          <dl className="settings-list settings-list-mono">
            <div className="settings-row">
              <dt>Plateforme</dt>
              <dd>{systemInfo.platform}</dd>
            </div>
            <div className="settings-row">
              <dt>Langue</dt>
              <dd>{systemInfo.language}</dd>
            </div>
            <div className="settings-row">
              <dt>Resolution</dt>
              <dd>{systemInfo.screenSize}</dd>
            </div>
          </dl>
        ) : (
          <p className="settings-muted">Non disponible</p>
        )}
      </section>
    </div>
  )
}
