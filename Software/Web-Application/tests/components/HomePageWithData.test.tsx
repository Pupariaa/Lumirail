import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AuthProvider, DataProvider, useAuth, useData } from '../../src/context'

function TestHomePage() {
  const { user } = useAuth()
  const { data, createWorkspace, deleteWorkspace, updateWorkspace } = useData()
  if (!user) return null
  return (
    <div>
      <span data-testid="user-email">{user.email}</span>
      <span data-testid="workspace-count">{data.workspaces.length}</span>
      <ul data-testid="workspaces">
        {data.workspaces.map((ws) => (
          <li key={ws.id} data-testid={`workspace-${ws.id}`}>
            {ws.name}
            <button type="button" onClick={() => deleteWorkspace(ws.id)} data-testid={`delete-${ws.id}`}>
              Delete
            </button>
            <button type="button" onClick={() => updateWorkspace(ws.id, { name: 'Updated' })} data-testid={`update-${ws.id}`}>
              Update
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => createWorkspace('Test WS')} data-testid="add-workspace">
        Add
      </button>
    </div>
  )
}

describe('DataProvider with auth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads and displays persisted workspaces', () => {
    const sessionUser = {
      id: 'user-1',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    localStorage.setItem(
      'lumirail_userdata_user-1',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'My Workspace', ownerId: 'user-1', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <AuthProvider>
        <DataProvider userId="user-1">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('user-email')).toHaveTextContent('test@example.com')
    expect(screen.getByTestId('workspaces')).toHaveTextContent('My Workspace')
  })

  it('creates workspace via button click', () => {
    const sessionUser = {
      id: 'user-1',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))

    render(
      <AuthProvider>
        <DataProvider userId="user-1">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('0')

    fireEvent.click(screen.getByTestId('add-workspace'))

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('1')
    expect(screen.getByTestId('workspaces')).toHaveTextContent('Test WS')
  })

  it('deletes workspace via button click', () => {
    const sessionUser = {
      id: 'user-1',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    localStorage.setItem(
      'lumirail_userdata_user-1',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'To Delete', ownerId: 'user-1', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <AuthProvider>
        <DataProvider userId="user-1">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('delete-w1'))

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('0')
  })

  it('updates workspace via button click', () => {
    const sessionUser = {
      id: 'user-1',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    }
    localStorage.setItem('lumirail_session', JSON.stringify(sessionUser))
    localStorage.setItem(
      'lumirail_userdata_user-1',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'Original', ownerId: 'user-1', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <AuthProvider>
        <DataProvider userId="user-1">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('workspace-w1')).toHaveTextContent('Original')

    fireEvent.click(screen.getByTestId('update-w1'))

    expect(screen.getByTestId('workspace-w1')).toHaveTextContent('Updated')
  })

  it('isolates data between users', () => {
    localStorage.setItem('lumirail_session', JSON.stringify({ id: 'user-1', email: 'user1@test.com', createdAt: new Date().toISOString() }))
    localStorage.setItem(
      'lumirail_userdata_user-1',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'User 1 WS', ownerId: 'user-1', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )
    localStorage.setItem(
      'lumirail_userdata_user-2',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w2', name: 'User 2 WS', ownerId: 'user-2', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    const { rerender } = render(
      <AuthProvider>
        <DataProvider userId="user-1">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('workspaces')).toHaveTextContent('User 1 WS')
    expect(screen.getByTestId('workspaces')).not.toHaveTextContent('User 2 WS')

    localStorage.setItem('lumirail_session', JSON.stringify({ id: 'user-2', email: 'user2@test.com', createdAt: new Date().toISOString() }))

    rerender(
      <AuthProvider>
        <DataProvider userId="user-2">
          <TestHomePage />
        </DataProvider>
      </AuthProvider>
    )

    expect(screen.getByTestId('workspaces')).toHaveTextContent('User 2 WS')
    expect(screen.getByTestId('workspaces')).not.toHaveTextContent('User 1 WS')
  })
})
