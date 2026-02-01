import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SceneTimeline } from '../../src/components/SceneTimeline'
import type { Module, Project } from '../../src/data'

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 'mod-1',
    projectId: 'proj-1',
    name: 'Test Module',
    outputAddresses: [],
    blocks: [],
    bookmarks: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeProject(): Project {
  return {
    id: 'proj-1',
    workspaceId: 'ws-1',
    name: 'Test Project',
    durationMinutes: 10,
    bookmarks: [],
    momentTracks: [],
    modules: [],
    cards: [],
    createdAt: new Date().toISOString(),
  }
}

describe('SceneTimeline module mode', () => {
  it('renders timeline region with duration in aria-label', () => {
    const mod = makeModule()
    const proj = makeProject()
    render(<SceneTimeline project={proj} module={mod} />)
    expect(screen.getByRole('region', { name: /timeline de r[eé]f[eé]rence: 10 min = 24h/i })).toBeInTheDocument()
  })

  it('displays time scale hint', () => {
    const mod = makeModule()
    const proj = makeProject()
    render(<SceneTimeline project={proj} module={mod} />)
    expect(screen.getByText(/10 min = 24h/)).toBeInTheDocument()
  })

  it('shows Markers and output tracks when module provided (cycle in background)', () => {
    const mod = makeModule({ blocks: [] })
    const proj = makeProject()
    render(<SceneTimeline project={proj} module={mod} />)
    expect(screen.getByText('Markers')).toBeInTheDocument()
    expect(screen.getByText('Sortie 1')).toBeInTheDocument()
    expect(screen.getByText(/Sortie 1 \| On\/Off/)).toBeInTheDocument()
  })

  it('renders zoom controls', () => {
    const mod = makeModule()
    const proj = makeProject()
    render(<SceneTimeline project={proj} module={mod} />)
    expect(screen.getByRole('button', { name: 'Zoomer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dézoomer' })).toBeInTheDocument()
  })

  it('does not show Piste Moments button in module mode', () => {
    const mod = makeModule()
    const proj = makeProject()
    render(<SceneTimeline project={proj} module={mod} onCreateMomentTrack={() => null} />)
    expect(screen.queryByRole('button', { name: /piste moments/i })).not.toBeInTheDocument()
  })
})
