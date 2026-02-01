import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByRole('heading', { name: /Lumirail Studio/i })).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
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

    await user.click(screen.getByRole('button', { name: /sign out/i }))

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

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    await waitFor(() => {
      expect(localStorage.getItem('lumirail_session')).toBeNull()
    })
  })

  it('redirects to login when navigating to protected route without auth', () => {
    render(<App />)
    expect(screen.queryByText(/Lumirail Studio/i)).not.toBeInTheDocument()
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
      expect(screen.getByRole('heading', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))
    await user.click(screen.getByRole('link', { name: 'My Project' }))

    await user.type(screen.getByLabelText(/nom du module/i), 'My Module')
    await user.click(screen.getByRole('button', { name: /créer un module/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Module' })).toBeInTheDocument()
    })
    expect(screen.getByText(/ajoutez des blocs à ce module/i)).toBeInTheDocument()
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
      expect(screen.getByRole('heading', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))

    await user.type(screen.getByLabelText(/nom du projet/i), 'Test Project')
    const durationInput = screen.getByLabelText(/durée \(min\)/i)
    await user.clear(durationInput)
    await user.type(durationInput, '15')
    await user.click(screen.getByRole('button', { name: /créer/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Test Project/i })).toBeInTheDocument()
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
      expect(screen.getByRole('heading', { name: /Lumirail Studio/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('link', { name: 'My Workspace' }))

    await user.type(screen.getByLabelText(/nom du projet/i), 'Clamped Project')
    const durationInput = screen.getByLabelText(/durée \(min\)/i)
    await user.clear(durationInput)
    await user.type(durationInput, '50')
    await user.click(screen.getByRole('button', { name: /créer/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Clamped Project/i })).toBeInTheDocument()
    })

    const stored = JSON.parse(localStorage.getItem('lumirail_userdata_test-id') || '{}')
    expect(stored.projects[0].durationMinutes).toBe(30)
  })
})
