import { describe, it, expect } from 'vitest'
import { checkSimilarity } from '../src/checks/similarity'

describe('checkSimilarity', () => {
  it('passes when no existing embeddings', () => {
    const result = checkSimilarity([0.1, 0.2, 0.3], [])
    expect(result.status).toBe('pass')
  })

  it('fails when similarity exceeds 90% threshold', () => {
    const vec = [1, 0, 0]
    const result = checkSimilarity(vec, [{ vector: [1, 0, 0], skillName: 'existing-skill' }])
    expect(result.status).toBe('fail')
    expect(result.output).toContain('existing-skill')
  })

  it('warns when similarity is between 75-90%', () => {
    // cosine([1,0,0], [0.8, 0.6, 0]) = 0.8 — within warn range
    const result = checkSimilarity([1, 0, 0], [{ vector: [0.8, 0.6, 0], skillName: 'similar-skill' }])
    expect(result.status).toBe('warn')
  })

  it('passes when similarity is below 75%', () => {
    const result = checkSimilarity([1, 0, 0], [{ vector: [0, 1, 0], skillName: 'different-skill' }])
    expect(result.status).toBe('pass')
  })
})
