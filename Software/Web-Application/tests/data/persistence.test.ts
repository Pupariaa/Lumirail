import { describe, it, expect } from 'vitest'
import {
  loadUserData,
  validateName,
  clampDuration,
  StorageQuotaError,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  createProject,
  updateProject,
  deleteProject,
  createModule,
  updateModule,
  deleteModule,
  createBookmark,
  addBlockToModule,
} from '../../src/data/persistence'
import type { StorageAdapter } from '../../src/storage'

function createMemoryAdapter(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

function createQuotaExceededAdapter(): StorageAdapter {
  return {
    getItem: () => null,
    setItem: () => {
      const error = new Error('Quota exceeded')
      error.name = 'QuotaExceededError'
      throw error
    },
    removeItem: () => {},
    clear: () => {},
  }
}

describe('validateName', () => {
  it('trims whitespace', () => {
    expect(validateName('  test  ')).toBe('test')
  })

  it('truncates names over 100 characters', () => {
    const longName = 'a'.repeat(150)
    expect(validateName(longName)).toHaveLength(100)
  })

  it('returns empty string for whitespace-only input', () => {
    expect(validateName('   ')).toBe('')
  })
})

describe('clampDuration', () => {
  it('clamps values below 2 to 2', () => {
    expect(clampDuration(0)).toBe(2)
    expect(clampDuration(1)).toBe(2)
    expect(clampDuration(-5)).toBe(2)
  })

  it('clamps values above 30 to 30', () => {
    expect(clampDuration(31)).toBe(30)
    expect(clampDuration(100)).toBe(30)
  })

  it('preserves values between 2 and 30', () => {
    expect(clampDuration(2)).toBe(2)
    expect(clampDuration(15)).toBe(15)
    expect(clampDuration(30)).toBe(30)
  })

  it('rounds fractional values', () => {
    expect(clampDuration(10.3)).toBe(10)
    expect(clampDuration(10.7)).toBe(11)
  })
})

describe('StorageQuotaError', () => {
  it('throws StorageQuotaError when quota exceeded', () => {
    const adapter = createQuotaExceededAdapter()
    expect(() => createWorkspace(adapter, 'user-1', 'Test')).toThrow(StorageQuotaError)
  })
})

describe('data persistence - workspaces', () => {
  it('loads empty data when no storage', () => {
    const adapter = createMemoryAdapter()
    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces).toEqual([])
    expect(data.projects).toEqual([])
  })

  it('persists and restores workspace', () => {
    const adapter = createMemoryAdapter()
    createWorkspace(adapter, 'user-1', 'My Workspace')
    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces).toHaveLength(1)
    expect(data.workspaces[0].name).toBe('My Workspace')
  })

  it('persists across reload', () => {
    const adapter = createMemoryAdapter()
    createWorkspace(adapter, 'user-1', 'Workspace A')
    const afterCreate = loadUserData(adapter, 'user-1')
    expect(afterCreate.workspaces).toHaveLength(1)

    const afterReload = loadUserData(adapter, 'user-1')
    expect(afterReload.workspaces).toHaveLength(1)
    expect(afterReload.workspaces[0].name).toBe('Workspace A')
  })

  it('isolates data per user', () => {
    const adapter = createMemoryAdapter()
    createWorkspace(adapter, 'user-1', 'User 1 Workspace')
    createWorkspace(adapter, 'user-2', 'User 2 Workspace')

    const data1 = loadUserData(adapter, 'user-1')
    const data2 = loadUserData(adapter, 'user-2')
    expect(data1.workspaces).toHaveLength(1)
    expect(data2.workspaces).toHaveLength(1)
    expect(data1.workspaces[0].name).toBe('User 1 Workspace')
    expect(data2.workspaces[0].name).toBe('User 2 Workspace')
  })

  it('updates workspace name', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Original')
    const updated = updateWorkspace(adapter, 'user-1', ws.id, { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces[0].name).toBe('Renamed')
  })

  it('returns null when updating non-existent workspace', () => {
    const adapter = createMemoryAdapter()
    const result = updateWorkspace(adapter, 'user-1', 'fake-id', { name: 'Test' })
    expect(result).toBeNull()
  })

  it('deletes workspace and cascades to projects', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    createModule(adapter, 'user-1', proj!.id, 'Module')

    const deleted = deleteWorkspace(adapter, 'user-1', ws.id)
    expect(deleted).toBe(true)

    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces).toHaveLength(0)
    expect(data.projects).toHaveLength(0)
  })

  it('returns false when deleting non-existent workspace', () => {
    const adapter = createMemoryAdapter()
    const result = deleteWorkspace(adapter, 'user-1', 'fake-id')
    expect(result).toBe(false)
  })
})

describe('data persistence - projects', () => {
  it('creates project in workspace', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'My Project')

    expect(proj).not.toBeNull()
    expect(proj!.name).toBe('My Project')
    expect(proj!.workspaceId).toBe(ws.id)
    expect(proj!.durationMinutes).toBe(10)
    expect(proj!.modules).toEqual([])
    expect(proj!.bookmarks).toEqual([])

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects).toHaveLength(1)
  })

  it('updates project name', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Original')

    const updated = updateProject(adapter, 'user-1', proj!.id, { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
  })

  it('moves project to different workspace', () => {
    const adapter = createMemoryAdapter()
    const ws1 = createWorkspace(adapter, 'user-1', 'Workspace 1')
    const ws2 = createWorkspace(adapter, 'user-1', 'Workspace 2')
    const proj = createProject(adapter, 'user-1', ws1.id, 'Project')

    const updated = updateProject(adapter, 'user-1', proj!.id, { workspaceId: ws2.id })
    expect(updated?.workspaceId).toBe(ws2.id)
  })

  it('returns null when creating project with non-existent workspace', () => {
    const adapter = createMemoryAdapter()
    const result = createProject(adapter, 'user-1', 'non-existent-workspace-id', 'Project', 10)
    expect(result).toBeNull()
    const data = loadUserData(adapter, 'user-1')
    expect(data.projects).toHaveLength(0)
  })

  it('returns null when updating non-existent project', () => {
    const adapter = createMemoryAdapter()
    const result = updateProject(adapter, 'user-1', 'fake-id', { name: 'Test' })
    expect(result).toBeNull()
  })

  it('deletes project and cascades to modules', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    createModule(adapter, 'user-1', proj!.id, 'Module')

    const deleted = deleteProject(adapter, 'user-1', proj!.id)
    expect(deleted).toBe(true)

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects).toHaveLength(0)
  })

  it('returns false when deleting non-existent project', () => {
    const adapter = createMemoryAdapter()
    const result = deleteProject(adapter, 'user-1', 'fake-id')
    expect(result).toBe(false)
  })
})

describe('data persistence - modules', () => {
  it('creates module in project', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    const mod = createModule(adapter, 'user-1', proj!.id, 'My Module')
    expect(mod).not.toBeNull()

    expect(mod!.name).toBe('My Module')
    expect(mod!.projectId).toBe(proj!.id)
    expect(mod!.blocks).toEqual([])
    expect(mod!.outputAddresses).toEqual([])

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects[0].modules).toHaveLength(1)
  })

  it('returns null when project does not exist', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    createProject(adapter, 'user-1', ws.id, 'Project')
    const result = createModule(adapter, 'user-1', 'non-existent-project-id', 'Orphan')
    expect(result).toBeNull()
    const data = loadUserData(adapter, 'user-1')
    expect(data.projects[0].modules).toHaveLength(0)
  })

  it('updates module properties', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    const mod = createModule(adapter, 'user-1', proj!.id, 'Original')
    expect(mod).not.toBeNull()

    const updated = updateModule(adapter, 'user-1', mod!.id, { name: 'Renamed' })
    expect(updated?.name).toBe('Renamed')
  })

  it('deletes module', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    const mod = createModule(adapter, 'user-1', proj!.id, 'Module')
    expect(mod).not.toBeNull()

    const deleted = deleteModule(adapter, 'user-1', mod!.id)
    expect(deleted).toBe(true)

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects[0].modules).toHaveLength(0)
  })
})

describe('data persistence - bookmarks', () => {
  it('creates bookmark in project', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    const bm = createBookmark(adapter, 'user-1', proj!.id, 60000, 'Lever du soleil')
    expect(bm).not.toBeNull()
    expect(bm!.label).toBe('Lever du soleil')
    expect(bm!.positionMs).toBe(60000)

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects[0].bookmarks).toHaveLength(1)
  })
})

describe('data persistence - blocks', () => {
  it('adds block to module', () => {
    const adapter = createMemoryAdapter()
    const ws = createWorkspace(adapter, 'user-1', 'Workspace')
    const proj = createProject(adapter, 'user-1', ws.id, 'Project')
    const mod = createModule(adapter, 'user-1', proj!.id, 'Module')
    const block = addBlockToModule(adapter, 'user-1', mod!.id, {
      type: 'on',
      startMs: 0,
      durationMs: 5000,
      outputIndex: 0,
    })
    expect(block).not.toBeNull()
    expect(block!.type).toBe('on')
    expect(block!.startMs).toBe(0)
    expect(block!.durationMs).toBe(5000)
    expect(block!.outputIndex).toBe(0)

    const data = loadUserData(adapter, 'user-1')
    expect(data.projects[0].modules[0].blocks).toHaveLength(1)
  })
})

describe('data migration', () => {
  it('migrates old data without version field to empty', () => {
    const adapter = createMemoryAdapter()
    adapter.setItem(
      'lumirail_userdata_user-1',
      JSON.stringify({
        workspaces: [{ id: 'w1', name: 'Old WS', ownerId: 'user-1', createdAt: '2024-01-01' }],
        projects: [],
        scenes: [],
      })
    )

    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces).toHaveLength(0)
    expect(data.projects).toHaveLength(0)
  })

  it('handles corrupted JSON gracefully', () => {
    const adapter = createMemoryAdapter()
    adapter.setItem('lumirail_userdata_user-1', 'not valid json')

    const data = loadUserData(adapter, 'user-1')
    expect(data.workspaces).toEqual([])
    expect(data.projects).toEqual([])
  })
})
