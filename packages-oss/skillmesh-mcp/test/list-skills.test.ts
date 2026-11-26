import { describe, it, expect, vi } from 'vitest'
import { listSkills } from '../src/tools/list-skills'
import type { SkillMeshClient } from '../src/client'

const makeClient = (skills: object[]) => ({
  listSkills: vi.fn().mockResolvedValue({ skills }),
}) as unknown as SkillMeshClient

describe('listSkills tool', () => {
  it('returns only approved skills', async () => {
    const client = makeClient([
      { id: '1', name: 'approved-skill', description: 'x', triggers: [], status: 'approved' },
      { id: '2', name: 'draft-skill', description: 'y', triggers: [], status: 'draft' },
    ])
    const result = await listSkills(client, {})
    expect(result.count).toBe(1)
    expect(result.skills[0].name).toBe('approved-skill')
  })

  it('returns empty message when no approved skills', async () => {
    const client = makeClient([])
    const result = await listSkills(client, {})
    expect(result.count).toBe(0)
    expect(result.message).toContain('No approved')
  })
})
