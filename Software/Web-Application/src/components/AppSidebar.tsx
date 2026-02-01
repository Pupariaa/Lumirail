import { useState, useContext, useEffect } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { useData } from '../context/useData'
import { SerialContext } from '../context/serialContext'
import { AddModuleDialog } from './AddModuleDialog'
import type { Module } from '../data'

function getModuleSn(m: Module): string {
  return (m.storedModuleInfo?.board?.['SN'] ?? m.name ?? '').trim()
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
  const projectPathMatch = pathname.match(/^\/workspace\/([^/]+)\/project\/([^/]+)(?:\/|$)/)
  const workspacePathMatch = pathname.match(/^\/workspace\/([^/]+)(?:\/|$)/)
  const wsId = params.wsId ?? projectPathMatch?.[1] ?? workspacePathMatch?.[1] ?? ''
  const projectId = params.projectId ?? projectPathMatch?.[2] ?? ''
  const moduleId = params.moduleId ?? pathname.match(/\/module\/([^/]+)(?:\/|$)/)?.[1] ?? ''
  const [addModuleDialogOpen, setAddModuleDialogOpen] = useState(false)
  const [addModuleProjectId, setAddModuleProjectId] = useState<string>(projectId)
  const [addWithDetectedModule, setAddWithDetectedModule] = useState(false)

  useEffect(() => {
    if (projectId) setAddModuleProjectId(projectId)
  }, [projectId])

  const isHome = pathname === '/'
  const isWorkspace = pathname.startsWith('/workspace/') && !pathname.includes('/project/')
  const isProject = Boolean(wsId && projectId)

  const workspace = wsId ? data.workspaces.find((w) => w.id === wsId) : null
  const projects = workspace
    ? data.projects.filter((p) => p.workspaceId === workspace.id)
    : []
  const allProjects = data.projects
  const project = projectId ? data.projects.find((p) => p.id === projectId) : null
  const modules = project?.modules ?? []

  const digiKeyConnected = serialState === 'connected'
  const canScanDigiKey = isSupported && digiKeyConnected

  const projectsForAdd = isHome ? allProjects : projects
  const targetProjectId = isProject ? projectId! : ((addModuleProjectId || projectsForAdd[0]?.id) ?? '')

  const addModuleButton = (
    <button
      type="button"
      className="btn btn-primary btn-sm sidebar-add-module-btn"
      onClick={() => {
        setAddWithDetectedModule(false)
        setAddModuleDialogOpen(true)
      }}
    >
      Ajouter un module
    </button>
  )

  if (isHome) {
    return (
      <aside className="app-sidebar">
        <nav aria-label="Navigation">
          <section>
            <h3 className="sidebar-section-title">Accueil</h3>
            <ul className="sidebar-list">
              <li>
                <Link to="/" className="sidebar-link sidebar-link-active">
                  Espaces de travail
                </Link>
              </li>
            </ul>
          </section>
        </nav>
      </aside>
    )
  }

  if (isWorkspace && workspace) {
    return (
      <aside className="app-sidebar">
        <nav aria-label="Projects navigation">
          <section>
            <h3 className="sidebar-section-title">Projets</h3>
            <Link to="/" className="sidebar-back-link">
              Espaces de travail
            </Link>
            {projects.length === 0 ? (
              <p className="sidebar-empty">Aucun projet</p>
            ) : (
              <ul className="sidebar-list">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/workspace/${wsId}/project/${p.id}`}
                      className={`sidebar-link ${p.id === projectId ? 'sidebar-link-active' : ''}`}
                    >
                      {p.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </nav>
      </aside>
    )
  }

  if (isProject) {
    const projectsForDialog = project ? [project] : (workspace ? projects : [])
    const defaultProjectIdForDialog = projectId ?? (projectsForDialog[0]?.id ?? '')
    const detectedModuleNotInProject = connectedModuleSn && connectedModuleInfo && modulePresent
      ? !modules.some((m) => getModuleSn(m) === connectedModuleSn)
      : false
    const detectedModuleStoredInfo = connectedModuleInfo
      ? { board: connectedModuleInfo.board, config: connectedModuleInfo.config, s1Meta: connectedModuleInfo.s1Meta, s2Meta: connectedModuleInfo.s2Meta }
      : undefined

    return (
      <aside className="app-sidebar">
        <nav aria-label="Modules navigation">
          <section>
            <h3 className="sidebar-section-title">Modules</h3>
            <Link to={wsId ? `/workspace/${wsId}` : '/'} className="sidebar-back-link">
              {workspace?.name ?? 'Espaces de travail'}
            </Link>
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
                        to={`/workspace/${wsId}/project/${projectId}/module/${m.id}`}
                        className={`sidebar-link ${m.id === moduleId ? 'sidebar-link-active' : ''}`}
                      >
                        {m.name}
                      </Link>
                      {connectedModuleSn !== null && (
                        <span className={`sidebar-module-status ${isConnected ? 'sidebar-module-status-connected' : 'sidebar-module-status-disconnected'}`} title={isConnected ? 'Module connecté au DigiKey' : isModuleAbsent ? 'Module absent (pas de réponse au ping)' : 'Autre module connecté'}>
                          {isConnected ? 'Connecté' : isModuleAbsent ? 'Module absent' : 'Non connecté'}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            {detectedModuleNotInProject && (
              <button
                type="button"
                className="btn btn-secondary btn-sm sidebar-add-detected-btn"
                onClick={() => {
                  setAddModuleProjectId(projectId ?? '')
                  setAddWithDetectedModule(true)
                  setAddModuleDialogOpen(true)
                }}
              >
                Module détecté, ajouter ?
              </button>
            )}
            {addModuleButton}
          </section>
        </nav>
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

  return (
    <aside className="app-sidebar">
      <nav aria-label="Navigation">
        <Link to="/" className="sidebar-back-link">
          Accueil
        </Link>
      </nav>
    </aside>
  )
}
