import type { CICheckResult } from '@skillmesh/shared'
import { SIMILARITY_BLOCK_THRESHOLD } from '@skillmesh/shared'

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] ** 2
    magB += b[i] ** 2
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export function checkSimilarity(
  newEmbedding: number[],
  existingEmbeddings: Array<{ vector: number[]; skillName: string }>,
): CICheckResult {
  if (existingEmbeddings.length === 0) {
    return { checkType: 'similarity', status: 'pass', output: 'No existing skills to compare against' }
  }

  let maxSimilarity = 0
  let mostSimilarName = ''
  for (const existing of existingEmbeddings) {
    const sim = cosineSimilarity(newEmbedding, existing.vector)
    if (sim > maxSimilarity) {
      maxSimilarity = sim
      mostSimilarName = existing.skillName
    }
  }

  if (maxSimilarity >= SIMILARITY_BLOCK_THRESHOLD) {
    return {
      checkType: 'similarity',
      status: 'fail',
      output: `Skill is ${Math.round(maxSimilarity * 100)}% similar to existing skill "${mostSimilarName}". Use or extend the existing skill instead.`,
    }
  }

  if (maxSimilarity >= 0.75) {
    return {
      checkType: 'similarity',
      status: 'warn',
      output: `Skill is ${Math.round(maxSimilarity * 100)}% similar to "${mostSimilarName}". Consider whether a new skill is needed.`,
    }
  }

  return { checkType: 'similarity', status: 'pass', output: `Most similar skill is ${Math.round(maxSimilarity * 100)}% — unique enough.` }
}
