import { useState, useContext, useEffect } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useData } from '../context/useData'
import { useHelp } from '../context/useHelp'
import { SerialContext } from '../context/serialContext'
import { AddModuleDialog } from './AddModuleDialog'
import { Plus, Plug, Settings, HelpCircle } from 'lucide-react'
import type { Module } from '../data'
import { HELP_SECTIONS } from '../lib/helpSections'
import { SETTINGS_SECTIONS } from '../lib/settingsSections'

function getModuleSn(m: Module): string {
  return (m.storedModuleInfo?.board?.['SN'] ?? m.name ?? '').trim()
}

function formatSidebarDate(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export function AppSidebar() {
  const { data, createModule, updateModule } = useData()
  const serialContext = useContext(SerialContext)
  const serialState = serialContext?.state ?? 'disconnected'
  const getModuleInfo = serialContext?.getModuleInfo ?? (async () => ({ board: {}, config: {}, s1Meta: {}, s2Meta: {} }))
  const connectedModuleSn = serialContext?.connectedModuleSn ?? null
  const connectedModuleInfo = serialContext?.connectedModuleInfo ?? null
  const modulePresent = serialContext?.modulePresent ?? false
  const isSupported = serialContext?.isSupported ?? false
  const params = useParams<{ wsId?: string; projectId?: string; moduleId?: string }>()
  const location = useLocation()
  const pathname = location.pathname
  const { activeSectionId } = useHelp()
  const projectPathMatch = pathname.match(/^\/workspace\/([^/]+)\/project\/([^/]+)(?:\/|$)/)
  const workspacePathMatch = pathname.match(/^\/workspace\/([^/]+)(?:\/|$)/)
  const modulePathMatch = pathname.match(/\/module\/([^/]+)(?:\/|$)/)
  const wsId = params.wsId ?? projectPathMatch?.[1] ?? workspacePathMatch?.[1] ?? ''
  const projectId = params.projectId ?? projectPathMatch?.[2] ?? ''
  const moduleId = params.moduleId ?? modulePathMatch?.[1] ?? ''
  const [addModuleDialogOpen, setAddModuleDialogOpen] = useState(false)
  const [addWithDetectedModule, setAddWithDetectedModule] = useState(false)

  useEffect(() => {
    if (!projectId) setAddWithDetectedModule(false)
  }, [projectId])

  const isHelpPage = pathname === '/help'
  const isSettingsPage = pathname === '/settings'
  const isHome = pathname === '/'
  const isWorkspacePage = Boolean(wsId && !projectId)
  const isProjectContext = Boolean(wsId && projectId)

  const workspace = wsId ? data.workspaces.find((w) => w.id === wsId) : null
  const projects = workspace
    ? data.projects.filter((p) => p.workspaceId === workspace.id)
    : []
  const project = projectId ? data.projects.find((p) => p.id === projectId) : null
  const modules = project?.modules ?? []

  const digiKeyConnected = serialState === 'connected'
  const canScanDigiKey = isSupported && digiKeyConnected

  const projectsForDialog = project ? [project] : []
  const defaultProjectIdForDialog = project?.id ?? ''
  const detectedModuleNotInProject = connectedModuleSn && connectedModuleInfo && modulePresent
    ? !modules.some((m) => getModuleSn(m) === connectedModuleSn)
    : false
  const detectedModuleStoredInfo = connectedModuleInfo
    ? { board: connectedModuleInfo.board, config: connectedModuleInfo.config, s1Meta: connectedModuleInfo.s1Meta, s2Meta: connectedModuleInfo.s2Meta }
    : undefined

  const version = import.meta.env.VITE_APP_VERSION ?? '0.1.0'

  return (
    <aside className="app-sidebar" aria-label="Sidebar">
      <div className="sidebar-scroll">
      <nav aria-label="Navigation">
        {isHelpPage && (
          <section className="sidebar-section">
            <h3 className="sidebar-section-title">Centre d&apos;aide</h3>
            <ul className="sidebar-list">
              {HELP_SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/help#${s.id}`}
                    className={`sidebar-link ${s.id === activeSectionId ? 'sidebar-link-active' : ''}`}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {isSettingsPage && (
          <section className="sidebar-section">
            <h3 className="sidebar-section-title">Paramètres</h3>
            <ul className="sidebar-list">
              {SETTINGS_SECTIONS.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/settings#${s.id}`}
                    className={`sidebar-link ${s.id === activeSectionId ? 'sidebar-link-active' : ''}`}
                  >
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!isHelpPage && !isSettingsPage && isHome && (
          <section className="sidebar-section">
            <h3 className="sidebar-section-title">Espaces de travail</h3>
            {data.workspaces.length === 0 ? (
              <p className="sidebar-empty">Aucun espace de travail</p>
            ) : (
              <ul className="sidebar-list">
                {data.workspaces.map((w) => (
                  <li key={w.id}>
                    <Link to={`/workspace/${w.id}`} className="sidebar-link">
                      {w.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!isHelpPage && isWorkspacePage && workspace && (
          <section className="sidebar-section">
            <h3 className="sidebar-section-title">Projets</h3>
            {projects.length === 0 ? (
              <p className="sidebar-empty">Aucun projet</p>
            ) : (
              <ul className="sidebar-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/workspace/${workspace.id}/project/${p.id}`}
                      className="sidebar-link sidebar-link-row"
                    >
                      <span className="sidebar-link-label">{p.name}</span>
                      <span className="sidebar-link-meta" aria-hidden>
                        {formatSidebarDate(p.createdAt) || '—'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="sidebar-actions">
              <Link to={`/workspace/${workspace.id}#create-project-heading`} className="btn btn-secondary btn-sm sidebar-action-link">
                Créer un projet
              </Link>
            </div>
          </section>
        )}

        {!isHelpPage && !isSettingsPage && isProjectContext && workspace && project && (
          <section className="sidebar-section">
            <div className="sidebar-section-title-row">
              <h3 className="sidebar-section-title">Modules</h3>
              <button
                type="button"
                className="sidebar-section-action"
                aria-label="Ajouter un module"
                title="Ajouter un module"
                onClick={() => {
                  setAddWithDetectedModule(detectedModuleNotInProject)
                  setAddModuleDialogOpen(true)
                }}
              >
                <Plus size={14} strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            {modules.length === 0 ? (
              <p className="sidebar-empty">Aucun module</p>
            ) : (
              <ul className="sidebar-list">
                {modules.map((m) => {
                  const isConnected = connectedModuleSn !== null && getModuleSn(m) === connectedModuleSn && modulePresent
                  const isModuleAbsent = connectedModuleSn !== null && getModuleSn(m) === connectedModuleSn && !modulePresent
                  return (
                    <li key={m.id} className="sidebar-module-item">
                      <Link
                        to={`/workspace/${workspace.id}/project/${project.id}/module/${m.id}`}
                        className={`sidebar-link sidebar-link-module ${m.id === moduleId ? 'sidebar-link-active' : ''}`}
                        title={isConnected ? 'Module connecté au DigiKey' : undefined}
                      >
                        {isConnected && (
                          <span className="sidebar-module-plug">
                            <Plug size={12} strokeWidth={2.5} aria-hidden />
                          </span>
                        )}
                        <span className="sidebar-link-label">{m.name}</span>
                      </Link>
                      {connectedModuleSn !== null && !isConnected && (
                        <span
                          className={`sidebar-module-status ${isConnected ? 'sidebar-module-status-connected' : 'sidebar-module-status-disconnected'}`}
                          title={isConnected ? 'Module connecté au DigiKey' : isModuleAbsent ? 'Module absent (pas de réponse au ping)' : 'Autre module connecté'}
                        >
                          {isConnected ? 'Connecté' : isModuleAbsent ? 'Module absent' : 'Non connecté'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
        )}
      </section>
        )}
      </nav>
      </div>

      <section className="sidebar-params" aria-label="Aide et paramètres">
        <Link to="/help" className="sidebar-params-link">
          <span className="sidebar-params-title">
            <HelpCircle size={12} strokeWidth={2.5} aria-hidden />
            Aide
          </span>
        </Link>
        <Link to="/settings" className="sidebar-params-link">
          <span className="sidebar-params-title">
            <Settings size={12} strokeWidth={2.5} aria-hidden />
            Paramètres
          </span>
          <span className="sidebar-params-version">{version}</span>
        </Link>
      </section>

      <AddModuleDialog
        open={addModuleDialogOpen}
        onClose={() => { setAddModuleDialogOpen(false); setAddWithDetectedModule(false) }}
        projects={projectsForDialog}
        defaultProjectId={defaultProjectIdForDialog}
        modules={modules}
        createModule={createModule}
        updateModule={updateModule}
        getModuleInfo={getModuleInfo}
        canScanDigiKey={canScanDigiKey}
        isSupported={isSupported}
        initialScannedInfo={addWithDetectedModule ? detectedModuleStoredInfo : undefined}
      />
    </aside>
  )
}
