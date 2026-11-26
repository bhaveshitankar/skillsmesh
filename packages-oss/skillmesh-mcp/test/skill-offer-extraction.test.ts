import { describe, it, expect, vi } from 'vitest'
import { skillOfferExtraction } from '../src/tools/skill-offer-extraction'
import type { SkillMeshClient } from '../src/client'

const mockClient = {} as unknown as SkillMeshClient

describe('skillOfferExtraction tool', () => {
  it('generates a draft with sensible name from task description', async () => {
    const result = await skillOfferExtraction(mockClient, {
      taskDescription: 'summarize a pull request',
      conversationSummary: 'Summarize this PR in 5 bullet points.',
    })
    expect(result.offered).toBe(true)
    expect(result.draft.name).toContain('summarize')
    expect(result.draft.promptTemplate).toContain('{{task_description}}')
    expect(result.draft.triggers.length).toBeGreaterThan(0)
  })

  it('uses suggestedName when provided', async () => {
    const result = await skillOfferExtraction(mockClient, {
      taskDescription: 'generate a release note',
      conversationSummary: 'Create a release note from commits.',
      suggestedName: 'my-custom-name',
    })
    expect(result.draft.name).toBe('my-custom-name')
  })

  it('uses tokensUsed for tokenEstimate when provided', async () => {
    const result = await skillOfferExtraction(mockClient, {
      taskDescription: 'some task',
      conversationSummary: 'did something',
      tokensUsed: 420,
    })
    expect(result.draft.tokenEstimate).toBe(420)
  })
})
