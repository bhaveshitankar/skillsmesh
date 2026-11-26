import { checkSchema } from './checks/schema'
import { checkSafety } from './checks/safety'
import { checkTokenEstimate } from './checks/token-estimate'
import { checkSimilarity } from './checks/similarity'
import type { CIRunResult } from '@skillmesh/shared'

export interface SkillInput {
  name?: string
  description?: string
  promptTemplate?: string
  triggers?: string[]
  tags?: string[]
  tokenEstimate?: number
}

export async function runChecks(
  skill: SkillInput,
  existingEmbeddings: Array<{ vector: number[]; skillName: string }> = [],
  newEmbedding?: number[],
): Promise<CIRunResult> {
  const checks = [
    checkSchema(skill),
    checkSafety(skill),
    checkTokenEstimate(skill),
    ...(newEmbedding ? [checkSimilarity(newEmbedding, existingEmbeddings)] : []),
  ]

  const passed = checks.every((c) => c.status !== 'fail')
  return { passed, checks }
}

export { checkSchema, checkSafety, checkTokenEstimate, checkSimilarity }
