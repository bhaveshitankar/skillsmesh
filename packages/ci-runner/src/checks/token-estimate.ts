import type { CICheckResult } from '@skillmesh/shared'

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function checkTokenEstimate(skill: { promptTemplate?: string; tokenEstimate?: number }): CICheckResult {
  const template = skill.promptTemplate ?? ''
  const estimated = estimateTokens(template)
  const declared = skill.tokenEstimate ?? 0

  if (estimated > 8000) {
    return {
      checkType: 'token_test',
      status: 'fail',
      output: `Prompt template is too long (~${estimated} tokens). Keep under 8,000 tokens.`,
    }
  }

  if (declared > 0 && Math.abs(estimated - declared) / declared > 0.5) {
    return {
      checkType: 'token_test',
      status: 'warn',
      output: `Declared token estimate (${declared}) differs from measured (~${estimated}) by >50%. Consider updating tokenEstimate.`,
    }
  }

  return {
    checkType: 'token_test',
    status: 'pass',
    output: `Estimated ~${estimated} tokens. Within limits.`,
  }
}
