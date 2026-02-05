import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataProvider, useData } from '../../src/context'

function TestHomePage() {
  const { data, createWorkspace, deleteWorkspace, updateWorkspace } = useData()
  return (
    <div>
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

describe('DataProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads and displays persisted workspaces', () => {
    localStorage.setItem(
      'lumirail_userdata_local',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'My Workspace', ownerId: 'local', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <DataProvider userId="local">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspaces')).toHaveTextContent('My Workspace')
  })

  it('creates workspace via button click', () => {
    render(
      <DataProvider userId="local">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('0')

    fireEvent.click(screen.getByTestId('add-workspace'))

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('1')
    expect(screen.getByTestId('workspaces')).toHaveTextContent('Test WS')
  })

  it('deletes workspace via button click', () => {
    localStorage.setItem(
      'lumirail_userdata_local',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'To Delete', ownerId: 'local', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <DataProvider userId="local">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('delete-w1'))

    expect(screen.getByTestId('workspace-count')).toHaveTextContent('0')
  })

  it('updates workspace via button click', () => {
    localStorage.setItem(
      'lumirail_userdata_local',
      JSON.stringify({
        _version: 2,
        workspaces: [{ id: 'w1', name: 'Original', ownerId: 'local', createdAt: new Date().toISOString() }],
        projects: [],
      })
    )

    render(
      <DataProvider userId="local">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspace-w1')).toHaveTextContent('Original')

    fireEvent.click(screen.getByTestId('update-w1'))

    expect(screen.getByTestId('workspace-w1')).toHaveTextContent('Updated')
  })

  it('isolates data between userIds', () => {
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
      <DataProvider userId="user-1">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspaces')).toHaveTextContent('User 1 WS')
    expect(screen.getByTestId('workspaces')).not.toHaveTextContent('User 2 WS')

    rerender(
      <DataProvider userId="user-2">
        <TestHomePage />
      </DataProvider>
    )

    expect(screen.getByTestId('workspaces')).toHaveTextContent('User 2 WS')
    expect(screen.getByTestId('workspaces')).not.toHaveTextContent('User 1 WS')
  })
})
