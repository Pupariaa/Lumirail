import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useParams, useNavigate } from 'react-router-dom'
import { DataProvider, useData, SerialProvider, useSerial } from './context'
import { SceneTimeline } from './components/SceneTimeline'
import { NameEditDialog } from './components/NameEditDialog'
import { NumberEditDialog } from './components/NumberEditDialog'
import { PlateauEditor } from './components/PlateauEditor'
import { ArrowLeft, Building2, ChevronsLeft, FolderOpen, Users, ListTodo, Settings, UserPlus, Mail, CheckSquare, Clock, Zap, Play, Cpu, Info, Tag, Download, Upload } from 'lucide-react'
import { DURATION_MIN, DURATION_MAX, clampDuration } from './data'
import { getDefaultProjectDuration } from './lib/preferences'
import { generateSceneFrames } from './sceneGenerator'
import { buildLfp } from './lfpEncoder'
import { UploadLfpDialog } from './components/UploadLfpDialog'
import { dispatchUndo, dispatchRedo } from './lib/undoRedoEvents'
import { AppSidebar } from './components/AppSidebar'
import { SettingsPage } from './pages/SettingsPage'
import { DeleteModuleConfirmDialog } from './components/DeleteModuleConfirmDialog'
import { SerialPortDialog } from './components/SerialPortDialog'
import { ViewportSizeGuard } from './components/ViewportSizeGuard'
import { TutorialOverlay } from './components/TutorialOverlay'
import logoLumirail from '../assets/logo-lumirail.png'

function AppShell({ children }: { children: React.ReactNode }) {
  const { state: serialState, connect, disconnect, isSupported, error, clearError } = useSerial()
  const [connecting, setConnecting] = useState(false)
  const [serialDialogOpen, setSerialDialogOpen] = useState(false)
  const [serialPortList, setSerialPortList] = useState<{ path: string; portId: string; displayName?: string; portName?: string }[] | null>(null)
  const isDesktop = typeof window !== 'undefined' && !!window.electronSerial

  const handleConnect = async () => {
    if (isDesktop) {
      setSerialDialogOpen(true)
      setSerialPortList(null)
      clearError()
      try {
        const list = await window.electronSerial!.listPorts()
        setSerialPortList(list)
      } catch {
        setSerialPortList([])
      }
      return
    }
    setConnecting(true)
    clearError()
    try {
      await connect()
    } finally {
      setConnecting(false)
    }
  }

  const handleSerialPortSelect = (path: string) => {
    setConnecting(true)
    window.electronSerial!.connectTo(path).then(() => {
      setSerialDialogOpen(false)
      setSerialPortList(null)
    }).catch((err) => {
      setSerialPortList(null)
    }).finally(() => {
      setConnecting(false)
    })
  }

  const handleSerialPortCancel = () => {
    setSerialDialogOpen(false)
    setSerialPortList(null)
  }

  const handleDisconnect = async () => {
    await disconnect()
  }

  const digiKeyLabel =
    serialState === 'connected'
      ? 'DigiKey connecté'
      : serialState === 'connecting' || connecting
        ? 'Connexion…'
        : 'Connecter DigiKey'
  const digiKeyDisabled = !isSupported || serialState === 'connecting' || connecting
  const showConnectButton = serialState !== 'connected'
  const showDisconnectButton = serialState === 'connected'

  return (
    <div className="app-shell">
      <ViewportSizeGuard enabled={import.meta.env.MODE !== 'test'} minWidth={1200} minHeight={670} />
      <header className="app-header">
        <Link to="/" className="app-header-brand">
          <img src={logoLumirail} alt="" className="app-header-logo" aria-hidden />
          <span className="app-header-title">Lumirail Studio</span>
        </Link>
        <div className="app-header-actions">
          {isSupported ? (
            <>
              <span
                className={`app-header-digikey-status ${serialState === 'connected' ? 'app-header-digikey-connected' : ''}`}
                aria-live="polite"
              >
                {serialState === 'connected' ? 'Connecté' : serialState === 'connecting' || connecting ? 'Connexion…' : 'Déconnecté'}
              </span>
              {showDisconnectButton ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleDisconnect}
                  disabled={connecting}
                >
                  Déconnecter DigiKey
                </button>
              ) : showConnectButton ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConnect}
                  disabled={digiKeyDisabled}
                  title={!isSupported ? 'Web Serial non supporté' : undefined}
                >
                  {digiKeyLabel}
                </button>
              ) : null}
            </>
          ) : (
            <span className="app-header-digikey-unsupported" title="Web Serial non supporté">
              DigiKey non disponible
            </span>
          )}
          {error && (
            <span className="app-header-digikey-error" role="alert">
              {error}
            </span>
          )}
        </div>
      </header>
      {isDesktop && (
        <SerialPortDialog
          open={serialDialogOpen}
          portList={serialPortList ?? []}
          loading={serialPortList === null}
          onSelect={handleSerialPortSelect}
          onCancel={handleSerialPortCancel}
        />
      )}
      {children}
    </div>
  )
}

const LOCAL_USER_ID = 'local'

function HomePageWithData() {
  return (
    <DataProvider userId={LOCAL_USER_ID}>
      <AppShell>
        <div className="app-body">
          <AppSidebar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/workspace/:wsId" element={<WorkspacePage />} />
              <Route path="/workspace/:wsId/project/:projectId" element={<ProjectPage />} />
              <Route path="/workspace/:wsId/project/:projectId/module/:moduleId" element={<ModulePage />} />
            </Routes>
          </main>
        </div>
      </AppShell>
    </DataProvider>
  )
}

function HomePage() {
  const { data, createWorkspace } = useData()
  const [newWorkspaceName, setNewWorkspaceName] = useState('')

  const workspaces = data.workspaces
  const projects = data.projects
  const hasWorkspaces = workspaces.length > 0
  const projectCount = projects.length
  const moduleCount = projects.reduce((sum, p) => sum + (p.modules?.length ?? 0), 0)

  const projectsByWorkspace = new Map<string, typeof projects>()
  for (const p of projects) {
    const list = projectsByWorkspace.get(p.workspaceId) ?? []
    list.push(p)
    projectsByWorkspace.set(p.workspaceId, list)
  }

  const recentProjects = [...projects]
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 6)
    .map((p) => ({
      ...p,
      workspaceName: workspaces.find((w) => w.id === p.workspaceId)?.name ?? '—',
    }))

  const latestProject = recentProjects[0] ?? null

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (newWorkspaceName.trim()) {
      createWorkspace(newWorkspaceName.trim())
      setNewWorkspaceName('')
    }
  }

  const createWorkspaceForm = (
    <form onSubmit={handleCreateWorkspace} className="home-create-form" aria-label="Créer un espace de travail">
      <label htmlFor="workspace-name" className="visually-hidden">Nom de l&apos;espace de travail</label>
      <input
        id="workspace-name"
        type="text"
        value={newWorkspaceName}
        onChange={(e) => setNewWorkspaceName(e.target.value)}
        placeholder="Nom du nouvel espace de travail"
        maxLength={100}
        autoComplete="off"
      />
      <button type="submit" className="btn btn-primary" disabled={!newWorkspaceName.trim()}>
        Créer
      </button>
    </form>
  )

  return (
    <div className="app-layout home-layout">
      <TutorialOverlay />
      {!hasWorkspaces ? (
        <section className="home-hero" aria-label="Bienvenue">
          <div className="home-hero-top">
            <div className="home-hero-copy">
              <div className="home-kicker">Démarrage</div>
              <h1 className="page-title">Bienvenue</h1>
              <p className="page-description">
                Créez votre premier espace de travail, puis ajoutez un projet et des modules.
              </p>
            </div>
          </div>
          <div className="home-onboarding">
            <div className="home-onboarding-cards" aria-label="Étapes">
              <div className="home-step-card">
                <div className="home-step-title">1. Espace de travail</div>
                <div className="home-step-desc">Crée un espace pour regrouper tes projets.</div>
              </div>
              <div className="home-step-card">
                <div className="home-step-title">2. Projet</div>
                <div className="home-step-desc">Définis la durée (2–30 min) qui représente 24h.</div>
              </div>
              <div className="home-step-card">
                <div className="home-step-title">3. Module</div>
                <div className="home-step-desc">Ajoute un module et édite sa scène dans la timeline.</div>
              </div>
            </div>
            {createWorkspaceForm}
          </div>
        </section>
      ) : (
        <>
          <header className="home-hero" aria-label="Accueil">
            <div className="home-hero-top">
              <div className="home-hero-copy">
                <div className="home-kicker">Tableau de bord</div>
                <h1 className="page-title">Espaces de travail</h1>
                <p className="page-description">
                  Reprenez un projet existant ou créez un nouvel espace de travail.
                </p>
              </div>
              <div className="home-hero-actions">
                {recentProjects[0] && (
                  <Link
                    to={`/workspace/${recentProjects[0].workspaceId}/project/${recentProjects[0].id}`}
                    className="btn btn-primary"
                  >
                    Continuer
                  </Link>
                )}
                {createWorkspaceForm}
              </div>
            </div>
            <div className="home-stats" aria-label="Statistiques">
              <div className="home-stat">
                <div className="home-stat-label">Espaces</div>
                <div className="home-stat-value">{workspaces.length}</div>
              </div>
              <div className="home-stat">
                <div className="home-stat-label">Projets</div>
                <div className="home-stat-value">{projectCount}</div>
              </div>
              <div className="home-stat">
                <div className="home-stat-label">Modules</div>
                <div className="home-stat-value">{moduleCount}</div>
              </div>
              <div className="home-stat home-stat-wide">
                <div className="home-stat-label">Dernier projet</div>
                <div className="home-stat-value">
                  {latestProject ? `${latestProject.name} · ${latestProject.workspaceName}` : '—'}
                </div>
              </div>
            </div>
          </header>

          <div className="home-columns">
            <section className="home-section" aria-labelledby="home-workspaces">
              <h2 id="home-workspaces" className="section-heading">Vos espaces de travail</h2>
              <div className="card-grid">
                {workspaces.map((ws) => {
                  const wsProjects = projectsByWorkspace.get(ws.id) ?? []
                  const lastProject = [...wsProjects].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
                  const countLabel = wsProjects.length === 1 ? '1 projet' : `${wsProjects.length} projets`
                  return (
                    <Link
                      key={ws.id}
                      to={`/workspace/${ws.id}`}
                      className="card home-workspace-card"
                      aria-label={`Ouvrir l'espace de travail ${ws.name}`}
                    >
                      <span className="card-title">{ws.name}</span>
                      <span className="card-meta" aria-hidden>{countLabel}</span>
                      <span className="card-meta" aria-hidden>{lastProject ? `Dernier: ${lastProject.name}` : 'Aucun projet'}</span>
                    </Link>
                  )
                })}
              </div>
            </section>

            <aside className="home-section" aria-labelledby="home-recent">
              <h2 id="home-recent" className="section-heading">Récents</h2>
              {recentProjects.length === 0 ? (
                <div className="home-empty">
                  <p className="section-empty">Aucun projet récent</p>
                  <p className="home-empty-hint">Ouvre un espace de travail pour créer un projet.</p>
                </div>
              ) : (
                <ul className="home-recent-list">
                  {recentProjects.map((p) => (
                    <li key={p.id} className="home-recent-item">
                      <Link to={`/workspace/${p.workspaceId}/project/${p.id}`} className="home-recent-link">
                        <span className="home-recent-title">{p.name}</span>
                        <span className="home-recent-meta">{p.workspaceName} · {p.durationMinutes} min</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

function WorkspacePage() {
  const { wsId } = useParams<{ wsId: string }>()
  const { data, createProject } = useData()
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDuration, setNewProjectDuration] = useState(getDefaultProjectDuration)

  const workspace = data.workspaces.find((w) => w.id === wsId)
  const projects = data.projects.filter((p) => p.workspaceId === wsId)

  const formatDateShort = (iso: string | undefined) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const moduleCount = projects.reduce((sum, p) => sum + (p.modules?.length ?? 0), 0)
  const recentProjects = [...projects].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).slice(0, 6)
  const latestProject = recentProjects[0] ?? null
  const hasProjects = projects.length > 0

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (wsId && newProjectName.trim()) {
      createProject(wsId, newProjectName.trim(), newProjectDuration)
      setNewProjectName('')
      setNewProjectDuration(getDefaultProjectDuration())
    }
  }

  if (!workspace) return <Navigate to="/" replace />

  return (
    <div className="app-layout workspace-layout">
      <nav className="nav-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Espaces de travail</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <span>{workspace.name}</span>
      </nav>

      <header className="workspace-hero" aria-label="Espace de travail">
        <div className="workspace-hero-top">
          <div className="workspace-hero-copy">
            <div className="home-kicker">Espace de travail</div>
            <h1 className="page-title">{workspace.name}</h1>
            <p className="page-description">Accédez à vos projets ou créez-en un nouveau.</p>
          </div>
          <div className="workspace-hero-actions">
            {latestProject && (
              <Link to={`/workspace/${wsId}/project/${latestProject.id}`} className="btn btn-primary">
                Continuer
              </Link>
            )}
            <a href="#create-project-heading" className="btn btn-secondary">
              Nouveau projet
            </a>
          </div>
        </div>
        <div className="workspace-stats" aria-label="Statistiques">
          <div className="home-stat">
            <div className="home-stat-label">Projets</div>
            <div className="home-stat-value">{projects.length}</div>
          </div>
          <div className="home-stat">
            <div className="home-stat-label">Modules</div>
            <div className="home-stat-value">{moduleCount}</div>
          </div>
          <div className="home-stat home-stat-wide">
            <div className="home-stat-label">Dernier projet</div>
            <div className="home-stat-value">
              {latestProject ? `${latestProject.name} · ${formatDateShort(latestProject.createdAt) || '—'}` : '—'}
            </div>
          </div>
        </div>
      </header>

      <div className="workspace-columns">
        <section aria-labelledby="projects-heading" className="workspace-section">
          <h2 id="projects-heading" className="section-heading">Projets</h2>
          {!hasProjects ? (
            <div className="workspace-empty">
              <p className="section-empty">Aucun projet pour le moment.</p>
              <p className="workspace-empty-hint">Crée un premier projet, puis ajoute des modules pour éditer leurs scènes.</p>
            </div>
          ) : (
            <div className="card-grid">
              {projects
                .slice()
                .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                .map((p) => (
                  <Link
                    key={p.id}
                    to={`/workspace/${wsId}/project/${p.id}`}
                    className="card workspace-project-card"
                    aria-label={`Ouvrir le projet ${p.name}`}
                  >
                    <span className="card-title">{p.name}</span>
                    <span className="card-meta" aria-hidden>{p.durationMinutes} min = 24h</span>
                    <span className="card-meta" aria-hidden>Créé: {formatDateShort(p.createdAt) || '—'}</span>
                  </Link>
                ))}
            </div>
          )}
        </section>

        <aside className="workspace-section workspace-section-side" aria-label="Créer un projet">
          <div className="workspace-create">
            <h3 id="create-project-heading" className="create-form-heading">Créer un projet</h3>
            <form onSubmit={handleCreateProject} aria-labelledby="create-project-heading">
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label htmlFor="project-name">Nom du projet</label>
                  <input
                    id="project-name"
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Saisir le nom"
                    maxLength={100}
                    autoComplete="off"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="project-duration">Durée (min)</label>
                  <input
                    id="project-duration"
                    type="number"
                    min={DURATION_MIN}
                    max={DURATION_MAX}
                    step={1}
                    value={newProjectDuration}
                    onChange={(e) => {
                      const raw = Number(e.target.value)
                      const clamped = Number.isNaN(raw) ? DURATION_MIN : clampDuration(raw)
                      setNewProjectDuration(clamped)
                    }}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" disabled={!newProjectName.trim()}>
                Créer
              </button>
              <p className="workspace-create-hint">
                \( {DURATION_MIN}–{DURATION_MAX} min \) représente une journée simulée \(24h\).
              </p>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}

function ProjectPage() {
  const { wsId, projectId } = useParams<{ wsId: string; projectId: string }>()
  const navigate = useNavigate()
  const { data, createBookmark, updateBookmark, deleteBookmark, createMomentTrack, updateMomentTrack, deleteMomentTrack, createMoment, updateMoment, deleteMoment, updateModule, deleteModule, updateWorkspace, updateProject, addBlockToModule } = useData()
  const workspace = data.workspaces.find((w) => w.id === wsId)
  const project = data.projects.find((p) => p.id === projectId)

  const handleCreateBookmark = (positionMs: number, label: string) => {
    if (projectId && label.trim()) createBookmark(projectId, positionMs, label.trim())
  }

  const [activeTab, setActiveTab] = useState<'timeline' | 'plateau' | 'organisation' | 'parametres'>('timeline')
  const [orgNameDialog, setOrgNameDialog] = useState<'workspace' | 'project' | null>(null)
  const [durationDialogOpen, setDurationDialogOpen] = useState(false)

  if (!workspace || !project) return <Navigate to="/" replace />

  const isCanvasTab = activeTab === 'timeline' || activeTab === 'plateau'

  return (
    <div className={`app-layout ${isCanvasTab ? 'app-layout-with-timeline' : ''}`}>
      <nav className="nav-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Espaces de travail</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <Link to={`/workspace/${wsId}`}>{workspace.name}</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <span>{project.name}</span>
      </nav>
      <h1 className="page-title">{project.name}</h1>
      <div className="page-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          className={`page-tab ${activeTab === 'timeline' ? 'page-tab-active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline Principale
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'plateau'}
          className={`page-tab ${activeTab === 'plateau' ? 'page-tab-active' : ''}`}
          onClick={() => setActiveTab('plateau')}
        >
          Plateau
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'organisation'}
          className={`page-tab ${activeTab === 'organisation' ? 'page-tab-active' : ''}`}
          onClick={() => setActiveTab('organisation')}
        >
          Organisation
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'parametres'}
          className={`page-tab ${activeTab === 'parametres' ? 'page-tab-active' : ''}`}
          onClick={() => setActiveTab('parametres')}
        >
          Paramètres
        </button>
      </div>
      {activeTab === 'timeline' && (
        <div className="app-layout-with-timeline">
          <p className="page-description">
            Timeline de référence : bookmarks partagés sur toutes les timelines des modules. Une timeline par module. Clic droit sur la règle pour ajouter un bookmark.
          </p>

          <section aria-labelledby="scene-timeline-heading" className="scene-timeline-section">
        <h2 id="scene-timeline-heading" className="section-heading visually-hidden">Timeline de référence</h2>
        <SceneTimeline
          project={project}
          projectId={projectId}
          onCreateBookmark={handleCreateBookmark}
          onUpdateBookmark={(bookmarkId, updates) => projectId && updateBookmark(projectId, bookmarkId, updates)}
          onDeleteBookmark={(bookmarkId) => projectId && deleteBookmark(projectId, bookmarkId)}
          onCreateMomentTrack={(name) => projectId && createMomentTrack(projectId, name)}
          onUpdateMomentTrack={(trackId, updates) => projectId && updateMomentTrack(projectId, trackId, updates)}
          onDeleteMomentTrack={(trackId) => projectId && deleteMomentTrack(projectId, trackId)}
          onCreateMoment={(trackId, moment) => projectId && createMoment(projectId, trackId, moment)}
          onUpdateMoment={(trackId, momentId, updates) => projectId && updateMoment(projectId, trackId, momentId, updates)}
          onDeleteMoment={(trackId, momentId) => projectId && deleteMoment(projectId, trackId, momentId)}
          onUpdateDayNight={(dawnH, duskH) => projectId && updateProject(projectId, { dayNightDawnSimulatedH: dawnH, dayNightDuskSimulatedH: duskH })}
          onUpdateProject={(updates) => projectId && updateProject(projectId, updates)}
        />
      </section>
        </div>
      )}
      {activeTab === 'plateau' && (
        <section aria-labelledby="plateau-heading" className="plateau-panel">
          <h2 id="plateau-heading" className="section-heading visually-hidden">Plateau</h2>
          <PlateauEditor
            project={project}
            projectId={projectId}
            onUpdateProject={(updates) => projectId && updateProject(projectId, updates)}
          />
        </section>
      )}
      {activeTab === 'organisation' && (
        <section aria-labelledby="organisation-heading" className="organisation-panel">
          <h2 id="organisation-heading" className="section-heading visually-hidden">Organisation</h2>
          <div className="organisation-context">
            <div className="organisation-context-item">
              <Building2 size={20} strokeWidth={2} className="organisation-context-icon" aria-hidden />
              <div className="organisation-context-content">
                <span className="organisation-context-label">Espace de travail</span>
                <div className="organisation-context-value-row">
                  <span className="organisation-context-value">{workspace.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm organisation-context-edit" onClick={() => setOrgNameDialog('workspace')} aria-label="Modifier le nom de l'espace">
                    Modifier
                  </button>
                </div>
              </div>
            </div>
            <span className="organisation-context-chevron" aria-hidden>/</span>
            <div className="organisation-context-item">
              <FolderOpen size={20} strokeWidth={2} className="organisation-context-icon" aria-hidden />
              <div className="organisation-context-content">
                <span className="organisation-context-label">Projet</span>
                <div className="organisation-context-value-row">
                  <span className="organisation-context-value">{project.name}</span>
                  <button type="button" className="btn btn-ghost btn-sm organisation-context-edit" onClick={() => setOrgNameDialog('project')} aria-label="Modifier le nom du projet">
                    Modifier
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="organisation-cards">
            <article className="organisation-card organisation-card-contributors">
              <header className="organisation-card-header">
                <span className="organisation-card-icon organisation-card-icon-contributors">
                  <Users size={20} strokeWidth={2} aria-hidden />
                </span>
                <h3 className="organisation-card-title">Contributeurs</h3>
                <button type="button" className="btn btn-primary btn-sm organisation-card-action" disabled title="À venir">
                  <UserPlus size={14} strokeWidth={2} aria-hidden />
                  Inviter
                </button>
              </header>
              <div className="organisation-member-list">
                <div className="organisation-member-item">
                  <span className="organisation-member-avatar" aria-hidden>V</span>
                  <span className="organisation-member-email">Vous</span>
                  <span className="organisation-member-badge organisation-member-badge-owner">Propriétaire</span>
                </div>
              </div>
              <div className="organisation-subsection">
                <h4 className="organisation-subtitle">
                  <Mail size={12} strokeWidth={2} aria-hidden />
                  Invitations en attente
                </h4>
                <p className="organisation-empty">Aucune invitation en attente</p>
              </div>
            </article>
            <article className="organisation-card organisation-card-tasks">
              <header className="organisation-card-header">
                <span className="organisation-card-icon organisation-card-icon-tasks">
                  <ListTodo size={20} strokeWidth={2} aria-hidden />
                </span>
                <h3 className="organisation-card-title">Tâches</h3>
                <button type="button" className="btn btn-secondary btn-sm organisation-card-action" disabled title="À venir">
                  <CheckSquare size={14} strokeWidth={2} aria-hidden />
                  Créer
                </button>
              </header>
              <div className="organisation-empty-block organisation-empty-block-tasks">
                <span className="organisation-empty-icon">
                  <CheckSquare size={40} strokeWidth={1.5} aria-hidden />
                </span>
                <p className="organisation-empty-title">Aucune tâche</p>
                <p className="organisation-empty-desc">Créez des tâches et assignez-les aux contributeurs pour suivre l&apos;avancement.</p>
              </div>
            </article>
          </div>
        </section>
      )}
      {orgNameDialog && (
        <NameEditDialog
          open
          title={orgNameDialog === 'workspace' ? "Nom de l'espace de travail" : 'Nom du projet'}
          defaultValue={orgNameDialog === 'workspace' ? workspace.name : project.name}
          onConfirm={(value) => {
            if (orgNameDialog === 'workspace' && wsId) updateWorkspace(wsId, { name: value })
            else if (orgNameDialog === 'project' && projectId) updateProject(projectId, { name: value })
            setOrgNameDialog(null)
          }}
          onCancel={() => setOrgNameDialog(null)}
        />
      )}
      {durationDialogOpen && (
        <NumberEditDialog
          open
          title="Durée de la scène"
          defaultValue={project.durationMinutes}
          min={DURATION_MIN}
          max={DURATION_MAX}
          unit="min"
          onConfirm={(value) => {
            if (projectId) updateProject(projectId, { durationMinutes: value })
            setDurationDialogOpen(false)
          }}
          onCancel={() => setDurationDialogOpen(false)}
        />
      )}
      {activeTab === 'parametres' && (
        <section aria-labelledby="parametres-heading" className="parametres-panel">
          <h2 id="parametres-heading" className="section-heading visually-hidden">Paramètres</h2>
          <div className="parametres-grid">
            <article className="parametres-card">
              <header className="parametres-card-header">
                <Clock size={18} strokeWidth={2} aria-hidden />
                <h3 className="parametres-card-title">Durée de la scène</h3>
              </header>
              <p className="parametres-card-desc">Durée en temps réel (2–30 min) qui représente 24h simulées sur les timelines.</p>
              <div className="parametres-row">
                <span className="parametres-value">{project.durationMinutes} min = 24h</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDurationDialogOpen(true)}>Modifier</button>
              </div>
            </article>
            <article className="parametres-card">
              <header className="parametres-card-header">
                <Settings size={18} strokeWidth={2} aria-hidden />
                <h3 className="parametres-card-title">Options</h3>
              </header>
              <p className="parametres-options-note">Paramètres avancés à venir.</p>
            </article>
          </div>
        </section>
      )}
    </div>
  )
}

function getModuleSn(m: { storedModuleInfo?: { board?: Record<string, string> }; name: string }): string {
  return (m.storedModuleInfo?.board?.['SN'] ?? m.name ?? '').trim()
}

function ModulePage() {
  const { wsId, projectId, moduleId } = useParams<{ wsId: string; projectId: string; moduleId: string }>()
  const navigate = useNavigate()
  const { data, deleteModule, updateModule, addBlockToModule, updateModuleBlock, removeBlockFromModule, createModuleBookmark, updateModuleBookmark, deleteModuleBookmark, createBookmark, updateBookmark, deleteBookmark, updateProject, updateMomentTrack, deleteMomentTrack, updateMoment, deleteMoment } = useData()
  const { connectedModuleSn, modulePresent, setConfig, getModuleInfo } = useSerial()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [moduleNameDialogOpen, setModuleNameDialogOpen] = useState(false)
  const [uploadLfpOpen, setUploadLfpOpen] = useState(false)
  const [uploadLfpBuffer, setUploadLfpBuffer] = useState<ArrayBuffer | null>(null)
  const [activeTab, setActiveTab] = useState<'scene' | 'config'>('scene')

  const workspace = data.workspaces.find((w) => w.id === wsId)
  const project = data.projects.find((p) => p.id === projectId)
  const module = project?.modules.find((m) => m.id === moduleId)

  const stored = module?.storedModuleInfo
  const boardInfo = stored?.board ?? {}
  const configInfo = stored?.config ?? {}
  const s1Meta = stored?.s1Meta ?? {}
  const s2Meta = stored?.s2Meta ?? {}
  const sop = configInfo.SOP === '1' || configInfo.SOP?.toLowerCase() === 'true'
  const sceneActive = configInfo.scene_active === '2' ? 2 : 1
  const activeMeta = sceneActive === 1 ? s1Meta : s2Meta
  const loop = activeMeta.loop === '1' || activeMeta.loop?.toLowerCase() === 'true'
  const delayMs = activeMeta.tick_ms ?? activeMeta.delay ?? ''
  const hasScene2 = !!s2Meta.SIZE && parseInt(s2Meta.SIZE, 10) > 0

  const handleDeleteConfirm = () => {
    if (moduleId) {
      deleteModule(moduleId)
      setDeleteConfirmOpen(false)
      navigate(`/workspace/${wsId}/project/${projectId}`)
    }
  }

  if (!workspace || !project) return <Navigate to="/" replace />
  if (!module) return <Navigate to={`/workspace/${wsId}/project/${projectId}`} replace />

  const moduleSn = getModuleSn(module)
  const isThisModuleConnected = connectedModuleSn !== null && moduleSn === connectedModuleSn && modulePresent
  const modulePageTitlePrefix = activeTab === 'scene' ? 'Édition de la scène du module' : 'Configuration du module'

  return (
    <div
      className={`app-layout app-layout-compact ${activeTab === 'scene' ? 'app-layout-with-timeline' : ''} ${activeTab === 'config' ? 'app-layout-module-config' : ''}`}
    >
      <nav className="nav-breadcrumb" aria-label="Breadcrumb">
        <span className="nav-breadcrumb-arrows" aria-label="Navigation rapide">
          <Link
            to={`/workspace/${wsId}/project/${projectId}`}
            className="nav-breadcrumb-arrow"
            aria-label="Retour au projet"
            title="Retour au projet"
          >
            <ArrowLeft size={16} strokeWidth={2} aria-hidden />
          </Link>
          <Link
            to={`/workspace/${wsId}`}
            className="nav-breadcrumb-arrow"
            aria-label="Retour à l'espace de travail"
            title="Retour à l'espace de travail"
          >
            <ChevronsLeft size={16} strokeWidth={2} aria-hidden />
          </Link>
        </span>
        <Link to="/">Espaces de travail</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <Link to={`/workspace/${wsId}`}>{workspace.name}</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <Link to={`/workspace/${wsId}/project/${projectId}`}>{project.name}</Link>
        <span className="nav-breadcrumb-sep" aria-hidden>/</span>
        <span>{module.name}</span>
      </nav>
      <div className="page-title-row">
        <div className="page-title-with-status">
          <div className="module-page-title-stack">
            <h1 className="page-title">{modulePageTitlePrefix} {module.name}</h1>
            <div className="module-page-serial">SN {moduleSn || '—'}</div>
          </div>
          {connectedModuleSn !== null && (
            <span className={`module-page-status ${isThisModuleConnected ? 'module-page-status-connected' : 'module-page-status-disconnected'}`} title={isThisModuleConnected ? 'Ce module est connecté au DigiKey' : moduleSn === connectedModuleSn && !modulePresent ? 'Module absent (pas de réponse au ping)' : 'Un autre module est connecté au DigiKey'}>
              {isThisModuleConnected ? 'Connecté' : moduleSn === connectedModuleSn && !modulePresent ? 'Module absent' : 'Non connecté'}
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setModuleNameDialogOpen(true)}
          aria-label="Modifier le nom du module"
        >
          Modifier
        </button>
      </div>
      <div className="page-tabs-row">
        <div className="page-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'scene'}
            className={`page-tab ${activeTab === 'scene' ? 'page-tab-active' : ''}`}
            onClick={() => setActiveTab('scene')}
          >
            Scène
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'config'}
            className={`page-tab ${activeTab === 'config' ? 'page-tab-active' : ''}`}
            onClick={() => setActiveTab('config')}
          >
            Configuration
          </button>
        </div>
        {activeTab === 'scene' ? (
          <div className="page-tabs-actions" aria-label="Actions de la scène">
            <button
              type="button"
              className="btn btn-ghost btn-sm page-tabs-action"
              onClick={() => {
                const board = module.storedModuleInfo?.board ?? {}
                const onOffCount = Math.max(0, parseInt(board['CHP'] ?? '0', 10))
                const pwmCount = Math.max(0, parseInt(board['CHPWM'] ?? '0', 10))
                const frameMs = 100
                const composition = {
                  version: 1,
                  params: {
                    serialNumber: getModuleSn(module),
                    onOffCount,
                    pwmCount,
                    delayMS: frameMs,
                  },
                  moduleName: module.name,
                  projectDurationMinutes: project.durationMinutes,
                  blocks: module.blocks,
                  bookmarks: module.bookmarks,
                  outputTrackLabels: module.outputTrackLabels ?? {},
                }
                const blob = new Blob([JSON.stringify(composition, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${module.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_composition.lmr`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download size={16} strokeWidth={2} aria-hidden />
              Télécharger la composition
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm page-tabs-action"
              onClick={() => {
                const board = module.storedModuleInfo?.board ?? {}
                let onOffCount = Math.max(0, parseInt(board['CHP'] ?? '0', 10))
                let pwmCount = Math.max(0, parseInt(board['CHPWM'] ?? '0', 10))
                if (onOffCount === 0 && pwmCount === 0) {
                  const maxOut = module.blocks.reduce((m, b) => Math.max(m, (b.outputIndex ?? 0) + 1), 0)
                  onOffCount = Math.max(1, maxOut)
                }
                const frameMs = 100
                const durationMs = project.durationMinutes * 60 * 1000
                const channelCount = onOffCount + pwmCount
                const frameData = generateSceneFrames(module.blocks, durationMs, onOffCount, pwmCount, frameMs)
                const lfp = buildLfp({ tickMs: frameMs, channelCount, frameData })
                const blob = new Blob([lfp], { type: 'application/octet-stream' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${module.name.replace(/[^a-zA-Z0-9-_]/g, '_')}_scene.lfp`
                a.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download size={16} strokeWidth={2} aria-hidden />
              Télécharger la scène
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm page-tabs-action"
              onClick={() => {
                const board = module.storedModuleInfo?.board ?? {}
                let onOffCount = Math.max(0, parseInt(board['CHP'] ?? '0', 10))
                let pwmCount = Math.max(0, parseInt(board['CHPWM'] ?? '0', 10))
                if (onOffCount === 0 && pwmCount === 0) {
                  const maxOut = module.blocks.reduce((m, b) => Math.max(m, (b.outputIndex ?? 0) + 1), 0)
                  onOffCount = Math.max(1, maxOut)
                }
                const frameMs = 100
                const durationMs = project.durationMinutes * 60 * 1000
                const channelCount = onOffCount + pwmCount
                const frameData = generateSceneFrames(module.blocks, durationMs, onOffCount, pwmCount, frameMs)
                const lfp = buildLfp({ tickMs: frameMs, channelCount, frameData })
                setUploadLfpBuffer(lfp)
                setUploadLfpOpen(true)
              }}
            >
              <Upload size={16} strokeWidth={2} aria-hidden />
              Téléverser la scène
            </button>
          </div>
        ) : (
          <div className="page-tabs-actions page-tabs-actions-placeholder" aria-hidden />
        )}
      </div>

      {uploadLfpOpen && (
        <UploadLfpDialog
          open
          lfpBuffer={uploadLfpBuffer}
          onSuccess={() => { setUploadLfpOpen(false); setUploadLfpBuffer(null) }}
          onCancel={() => { setUploadLfpOpen(false); setUploadLfpBuffer(null) }}
        />
      )}

      {activeTab === 'scene' && (
        <div className="app-layout-with-timeline">
          <section aria-labelledby="timeline-heading" className="scene-timeline-section">
            <h2 id="timeline-heading" className="section-heading visually-hidden">Timeline du module</h2>
            <SceneTimeline
              project={project}
              module={module}
              onCreateBookmark={(positionMs, label) => createBookmark(projectId, positionMs, label)}
              onUpdateBookmark={(bookmarkId, updates) => updateBookmark(projectId, bookmarkId, updates)}
              onDeleteBookmark={(bookmarkId) => deleteBookmark(projectId, bookmarkId)}
              onCreateModuleBookmark={(positionMs, label) => moduleId && createModuleBookmark(moduleId, positionMs, label)}
              onUpdateModuleBookmark={(bookmarkId, updates) => moduleId && updateModuleBookmark(moduleId, bookmarkId, updates)}
              onDeleteModuleBookmark={(bookmarkId) => moduleId && deleteModuleBookmark(moduleId, bookmarkId)}
              onUpdateDayNight={(dawnH, duskH) => updateProject(projectId, { dayNightDawnSimulatedH: dawnH, dayNightDuskSimulatedH: duskH })}
              onUpdateProject={(updates) => updateProject(projectId, updates)}
              onUpdateMomentTrack={(trackId, updates) => updateMomentTrack(projectId, trackId, updates)}
              onDeleteMomentTrack={(trackId) => deleteMomentTrack(projectId, trackId)}
              onUpdateMoment={(trackId, momentId, updates) => updateMoment(projectId, trackId, momentId, updates)}
              onDeleteMoment={(trackId, momentId) => deleteMoment(projectId, trackId, momentId)}
              onAddBlock={(block) => moduleId && addBlockToModule(moduleId, block)}
              onUpdateBlock={(blockId, updates) => moduleId && updateModuleBlock(moduleId, blockId, updates)}
              onRemoveBlock={(blockId) => moduleId && removeBlockFromModule(moduleId, blockId)}
              onUpdateTrackLabel={(outputIndex, label) => {
                if (!moduleId) return
                const next = { ...(module.outputTrackLabels ?? {}) }
                if (label) next[outputIndex] = label
                else delete next[outputIndex]
                updateModule(moduleId, { outputTrackLabels: next })
              }}
            />
          </section>
        </div>
      )}

      {activeTab === 'config' && (
        <section aria-labelledby="module-config-heading" className="module-config-panel">
          <h2 id="module-config-heading" className="section-heading visually-hidden">Configuration du module</h2>
          {!isThisModuleConnected && (
            <div className="module-config-callout" role="status">
              {connectedModuleSn === null
                ? 'Aucun module n\'est connecté. Connectez un module via le DigiKey pour modifier les paramètres.'
                : 'Connectez le module correspondant à cette scène pour modifier les paramètres.'}
            </div>
          )}

          <div className={`module-config-settings ${isThisModuleConnected ? '' : 'module-config-settings-disconnected'}`}>
            <div className="module-config-section module-config-section-module">
              <header className="module-config-section-header">
                <Tag size={18} strokeWidth={2} aria-hidden />
                <h3 className="module-config-section-title">Module</h3>
              </header>
              <div className="module-config-section-body">
                <div className="module-config-row">
                  <span className="module-config-label">Nom</span>
                  <span className="module-config-row-right">
                    <span className="module-config-value">{module.name}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setModuleNameDialogOpen(true)}
                      aria-label="Modifier le nom du module"
                    >
                      Modifier
                    </button>
                  </span>
                </div>
                <div className="module-config-row">
                  <span className="module-config-label">Suppression</span>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => setDeleteConfirmOpen(true)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>

            {isThisModuleConnected && (
              <div className="module-config-section module-config-section-startup">
                <header className="module-config-section-header">
                  <Zap size={18} strokeWidth={2} aria-hidden />
                  <h3 className="module-config-section-title">Démarrage</h3>
                </header>
                <div className="module-config-section-body">
                  <div className="module-config-row">
                    <span className="module-config-label">Démarrer dès que l&apos;alimentation est présente</span>
                    <label className="module-config-toggle">
                      <input
                        type="checkbox"
                        checked={sop}
                        onChange={async (e) => {
                          try {
                            const ok = await setConfig('SOP', e.target.checked ? 1 : 0)
                            if (ok && moduleId) {
                              const info = await getModuleInfo()
                              updateModule(moduleId, { storedModuleInfo: info })
                            }
                          } catch (_) {}
                        }}
                        aria-label="Démarrer dès que l'alimentation est présente"
                      />
                      <span className="module-config-toggle-slider" />
                    </label>
                  </div>
                  <div className="module-config-row module-config-row-disabled">
                    <span className="module-config-label">Démarrer lors d'un élément déclencheur</span>
                    <span className="module-config-badge">À venir</span>
                  </div>
                </div>
              </div>
            )}

            {isThisModuleConnected && (
              <div className="module-config-section module-config-section-scene">
                <header className="module-config-section-header">
                  <Play size={18} strokeWidth={2} aria-hidden />
                  <h3 className="module-config-section-title">Scène</h3>
                </header>
                <div className="module-config-section-body">
                  <div className="module-config-row">
                    <span className="module-config-label">Scène active</span>
                    <div className="module-config-scene-buttons">
                      <button
                        type="button"
                        className={`btn btn-sm ${sceneActive === 1 ? 'btn-primary' : 'btn-ghost'}`}
                        disabled={!hasScene2}
                        onClick={async () => {
                          try {
                            const ok = await setConfig('scene_active', 1)
                            if (ok && moduleId) {
                              const info = await getModuleInfo()
                              updateModule(moduleId, { storedModuleInfo: info })
                            }
                          } catch (_) {}
                        }}
                      >
                        Scène 1
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${sceneActive === 2 ? 'btn-primary' : 'btn-ghost'}`}
                        disabled={!hasScene2}
                        onClick={async () => {
                          try {
                            const ok = await setConfig('scene_active', 2)
                            if (ok && moduleId) {
                              const info = await getModuleInfo()
                              updateModule(moduleId, { storedModuleInfo: info })
                            }
                          } catch (_) {}
                        }}
                      >
                        Scène 2
                      </button>
                    </div>
                  </div>
                  {!hasScene2 && (
                    <p className="module-config-hint">Par défaut la scène 1. La scène 2 ne peut être sélectionnée que si elle existe.</p>
                  )}
                  <div className="module-config-divider" role="separator" aria-hidden />
                  <div className="module-config-row">
                    <span className="module-config-label">Boucle</span>
                    <span className="module-config-value">{loop ? 'Oui' : 'Non'}</span>
                  </div>
                  <div className="module-config-row">
                    <span className="module-config-label">Delay</span>
                    <span className="module-config-value">{delayMs ? `${delayMs} ms` : '-'}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="module-config-section module-config-section-infos">
              <header className="module-config-section-header">
                <Cpu size={18} strokeWidth={2} aria-hidden />
                <h3 className="module-config-section-title">Infos</h3>
              </header>
              <div className="module-config-section-body">
                {!stored ? (
                  <p className="module-config-placeholder">Ajoutez ce module via le scan DigiKey pour enregistrer ses informations.</p>
                ) : Object.keys(boardInfo).length === 0 ? (
                  <p className="module-config-placeholder">Aucune donnée enregistrée.</p>
                ) : (
                  <dl className="module-config-dl module-config-dl-compact">
                    <div className="module-config-dl-row">
                      <dt>Modèle</dt>
                      <dd>{boardInfo.MODEL ?? '-'}</dd>
                    </div>
                    <div className="module-config-dl-row">
                      <dt>On/Off</dt>
                      <dd>{boardInfo.CHP ?? '-'}</dd>
                    </div>
                    <div className="module-config-dl-row">
                      <dt>PWM</dt>
                      <dd>{boardInfo.CHPWM ?? '-'}</dd>
                    </div>
                    <div className="module-config-dl-row">
                      <dt>Driver</dt>
                      <dd>{boardInfo.DRIVER ?? '-'}</dd>
                    </div>
                    <div className="module-config-dl-row">
                      <dt>Révision</dt>
                      <dd>{boardInfo.REV ?? '-'}</dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {moduleNameDialogOpen && (
        <NameEditDialog
          open
          title="Nom du module"
          defaultValue={module.name}
          onConfirm={(value) => {
            if (moduleId) updateModule(moduleId, { name: value })
            setModuleNameDialogOpen(false)
          }}
          onCancel={() => setModuleNameDialogOpen(false)}
        />
      )}
      {deleteConfirmOpen && (
        <DeleteModuleConfirmDialog
          open
          moduleName={module.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </div>
  )
}

function App() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.isContentEditable) return
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.key === 'z') {
        e.preventDefault()
        e.stopPropagation()
        if (e.shiftKey) dispatchRedo()
        else dispatchUndo()
      } else if (e.key === 'y') {
        e.preventDefault()
        e.stopPropagation()
        dispatchRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <SerialProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/*" element={<HomePageWithData />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SerialProvider>
  )
}

export default App
