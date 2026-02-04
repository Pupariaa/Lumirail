import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../src/App'

function createProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proj1',
    workspaceId: 'ws1',
    name: 'My Project',
    durationMinutes: 10,
    bookmarks: [],
    modules: [],
    cards: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('redirects unauthenticated user to login', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows home page when user is authenticated', () => {
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(<App />)
    expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    expect(screen.getByText(/test@example.com/)).toBeInTheDocument()
  })

  it('shows sign out button when authenticated', () => {
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(<App />)
    expect(screen.getByRole('button', { name: /déconnexion/i })).toBeInTheDocument()
  })

  it('logs out user when sign out button is clicked', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(<App />)

    await user.click(screen.getByRole('button', { name: /déconnexion/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    })
  })

  it('clears session from localStorage on logout', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(<App />)

    await user.click(screen.getByRole('button', { name: /déconnexion/i }))

    await waitFor(() => {
      expect(localStorage.getItem('lumirail_session')).toBeNull()
    })
  })

  it('redirects to login when navigating to protected route without auth', () => {
    render(<App />)
    expect(screen.queryByRole('link', { name: /Lumirail Studio/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('does not store passwordHash in session', () => {
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(<App />)

    const storedSession = JSON.parse(localStorage.getItem('lumirail_session') || '{}')
    expect(storedSession).not.toHaveProperty('passwordHash')
  })

  it('authenticated user can create module and see timeline', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    const ws = { id: 'ws1', name: 'My Workspace', ownerId: 'test-id', createdAt: new Date().toISOString() }
    const proj = createProject({ id: 'proj1', workspaceId: 'ws1' })
    localStorage.setItem(
      'lumirail_userdata_test-id',
      JSON.stringify({
        _version: 4,
        workspaces: [ws],
        projects: [proj],
      })
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))
    await user.click(screen.getByRole('link', { name: 'My Project' }))

    await user.click(screen.getByRole('button', { name: /ajouter un module/i }))
    const moduleSerial = 'LMS-AA-BB-CC-DD-EE'
    await user.type(screen.getByLabelText(/numéro de série/i), moduleSerial)
    await user.click(screen.getByRole('button', { name: /ajouter par numéro/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: moduleSerial }).length).toBeGreaterThan(0)
    })

    await user.click(screen.getByRole('link', { name: moduleSerial }))
    expect(await screen.findByRole('heading', { name: moduleSerial })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /timeline du module/i })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /télécharger la composition/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /télécharger la scène/i })).toBeInTheDocument()
    const uploadBtn = screen.getByRole('button', { name: /téléverser la scène/i })
    expect(uploadBtn).toBeInTheDocument()
    expect(uploadBtn.className).toMatch(/\bbtn-primary\b/)

    await user.click(uploadBtn)
    expect(await screen.findByRole('dialog', { name: /téléverser la scène/i })).toBeInTheDocument()
    expect(screen.queryByText(/slot scène/i)).not.toBeInTheDocument()
  })

  it('authenticated user can create project with configurable duration 2-30 min', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    const ws = { id: 'ws1', name: 'My Workspace', ownerId: 'test-id', createdAt: new Date().toISOString() }
    localStorage.setItem(
      'lumirail_userdata_test-id',
      JSON.stringify({
        _version: 4,
        workspaces: [ws],
        projects: [],
      })
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))

    await user.type(screen.getByLabelText(/nom du projet/i), 'Test Project')
    const durationInput = screen.getByLabelText(/durée \(min\)/i)
    fireEvent.change(durationInput, { target: { value: '15' } })
    await user.click(screen.getByRole('button', { name: /créer/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /Test Project/i }).length).toBeGreaterThan(0)
    })

    const stored = JSON.parse(localStorage.getItem('lumirail_userdata_test-id') || '{}')
    expect(stored.projects).toHaveLength(1)
    expect(stored.projects[0].name).toBe('Test Project')
    expect(stored.projects[0].durationMinutes).toBe(15)
  })

  it('clamps project duration to 2-30 min range', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    const ws = { id: 'ws1', name: 'My Workspace', ownerId: 'test-id', createdAt: new Date().toISOString() }
    localStorage.setItem(
      'lumirail_userdata_test-id',
      JSON.stringify({
        _version: 4,
        workspaces: [ws],
        projects: [],
      })
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))

    await user.type(screen.getByLabelText(/nom du projet/i), 'Clamped Project')
    const durationInput = screen.getByLabelText(/durée \(min\)/i)
    await user.clear(durationInput)
    await user.type(durationInput, '50')
    await user.click(screen.getByRole('button', { name: /créer/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /Clamped Project/i }).length).toBeGreaterThan(0)
    })

    const stored = JSON.parse(localStorage.getItem('lumirail_userdata_test-id') || '{}')
    expect(stored.projects[0].durationMinutes).toBe(30)
  })

  it('shows projects context list in sidebar on workspace page', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    const ws = { id: 'ws1', name: 'My Workspace', ownerId: 'test-id', createdAt: new Date().toISOString() }
    const proj1 = createProject({ id: 'proj1', workspaceId: 'ws1', name: 'Project A' })
    const proj2 = createProject({ id: 'proj2', workspaceId: 'ws1', name: 'Project B' })
    localStorage.setItem(
      'lumirail_userdata_test-id',
      JSON.stringify({
        _version: 4,
        workspaces: [ws],
        projects: [proj1, proj2],
      })
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))

    const sidebar = screen.getByRole('complementary', { name: /sidebar/i })
    expect(within(sidebar).getByText('Projets')).toBeInTheDocument()
    expect(within(sidebar).getAllByRole('link', { name: 'Project A' }).length).toBeGreaterThan(0)
    expect(within(sidebar).getAllByRole('link', { name: 'Project B' }).length).toBeGreaterThan(0)
    expect(within(sidebar).queryByRole('button', { name: /ajouter un module/i })).not.toBeInTheDocument()
  })

  it('shows modules context list and actions in sidebar on project page', async () => {
    const user = userEvent.setup()
    const sessionUser = {
      id: 'test-id',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    const ws = { id: 'ws1', name: 'My Workspace', ownerId: 'test-id', createdAt: new Date().toISOString() }
    const proj = createProject({
      id: 'proj1',
      workspaceId: 'ws1',
      name: 'Project A',
      modules: [
        { id: 'm1', name: 'Module One', blocks: [], bookmarks: [], createdAt: new Date().toISOString(), storedModuleInfo: { board: { SN: 'SN-1' }, config: {}, s1Meta: {}, s2Meta: {} } },
      ],
    })
    localStorage.setItem(
      'lumirail_userdata_test-id',
      JSON.stringify({
        _version: 4,
        workspaces: [ws],
        projects: [proj],
      })
    )

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))
    await user.click(screen.getByRole('link', { name: 'Project A' }))

    const sidebar = screen.getByRole('complementary', { name: /sidebar/i })
    expect(within(sidebar).getByText('Modules')).toBeInTheDocument()
    expect(within(sidebar).getAllByRole('link', { name: 'Module One' }).length).toBeGreaterThan(0)
    expect(within(sidebar).getByRole('button', { name: /ajouter un module/i })).toBeInTheDocument()
  })
})
