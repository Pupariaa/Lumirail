import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Upload, Trash2 } from 'lucide-react'
import { useData } from '../context/useData'
import { getSoundsEnabled, setSoundsEnabled, setTutorialDismissed, getDefaultProjectDuration, setDefaultProjectDuration } from '../lib/preferences'
import { DURATION_MIN, DURATION_MAX } from '../data'

export function SettingsPage() {
  const navigate = useNavigate()
  const { data, exportData, importData, clearAllData } = useData()
  const [soundsEnabled, setSoundsEnabledState] = useState(true)
  const [defaultDuration, setDefaultDurationState] = useState(10)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSoundsEnabledState(getSoundsEnabled())
    setDefaultDurationState(getDefaultProjectDuration())
  }, [])

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

  return (
    <div className="app-layout home-layout">
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

      <section className="settings-section" aria-labelledby="settings-about">
        <h2 id="settings-about" className="section-heading">À propos</h2>
        <dl className="settings-list">
          <div className="settings-row">
            <dt>Version</dt>
            <dd>{version}</dd>
          </div>
          <div className="settings-row">
            <dt>Mode</dt>
            <dd>{isDesktop ? 'Desktop' : 'Web'}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-section" aria-labelledby="settings-params">
        <h2 id="settings-params" className="section-heading">Paramètres</h2>
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
                Réafficher le tutoriel
              </button>
            </dd>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="settings-data">
        <h2 id="settings-data" className="section-heading">Données</h2>
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
    </div>
  )
}
