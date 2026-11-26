import { describe, it, expect, vi } from 'vitest'
import { resolveSkill } from '../src/tools/resolve-skill'
import type { SkillMeshClient } from '../src/client'

describe('resolveSkill tool', () => {
  it('returns found:true with skill info when API matches', async () => {
    const mockClient = {
      resolveSkill: vi.fn().mockResolvedValue({
        found: true,
        match: {
          skill: { id: 'skill-1', name: 'jira-sprint-report', promptTemplate: 'Do {{task}}', tokenEstimate: 800 },
          score: 0.92,
        },
        topCandidates: [],
      }),
      logUsage: vi.fn().mockResolvedValue(undefined),
    } as unknown as SkillMeshClient

    const result = await resolveSkill(mockClient, { query: 'generate sprint velocity report' })
    expect(result.found).toBe(true)
    expect(result.skillName).toBe('jira-sprint-report')
    expect(result.promptTemplate).toBe('Do {{task}}')
    expect(mockClient.logUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'used' }))
  })

  it('returns found:false and logs fallback when no match', async () => {
    const mockClient = {
      resolveSkill: vi.fn().mockResolvedValue({ found: false, topCandidates: [] }),
      logUsage: vi.fn().mockResolvedValue(undefined),
    } as unknown as SkillMeshClient

    const result = await resolveSkill(mockClient, { query: 'something completely novel' })
    expect(result.found).toBe(false)
    expect(mockClient.logUsage).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'fallback' }))
  })
})
