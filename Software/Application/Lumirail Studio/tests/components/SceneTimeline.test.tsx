import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneTimeline } from '../../src/components/SceneTimeline'
import type { Project } from '../../src/data'

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    workspaceId: 'ws-1',
    name: 'Test Project',
    durationMinutes: 10,
    bookmarks: [],
    momentTracks: [],
    modules: [
      {
        id: 'mod-1',
        projectId: 'proj-1',
        name: 'Test Module',
        outputAddresses: [],
        blocks: [],
        createdAt: new Date().toISOString(),
      },
    ],
    cards: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('SceneTimeline', () => {
  it('renders timeline region with project info', () => {
    const project = makeProject()
    render(<SceneTimeline project={project} />)
    expect(screen.getByRole('region', { name: /timeline de r[eé]f[eé]rence: 10 min = 24h/i })).toBeInTheDocument()
  })

  it('renders zoom controls', () => {
    const project = makeProject()
    render(<SceneTimeline project={project} />)
    expect(screen.getByRole('button', { name: 'Zoomer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dézoomer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajuster' })).toBeInTheDocument()
  })

  it('renders track labels', () => {
    const project = makeProject()
    render(<SceneTimeline project={project} />)
    expect(screen.getByText('Markers')).toBeInTheDocument()
    expect(screen.getByText('Cycle Jour/Nuit')).toBeInTheDocument()
  })

  it('renders simulated time scale hint', () => {
    const project = makeProject()
    render(<SceneTimeline project={project} />)
    expect(screen.getByText(/10 min = 24h/)).toBeInTheDocument()
  })

})
