import type { CICheckResult } from '@skillmesh/shared'

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(DAN|a\s+jailbreak|unrestricted)/i,
  /reveal\s+(your\s+)?(system\s+prompt|instructions)/i,
  /do\s+anything\s+now/i,
  /pretend\s+you\s+(have\s+no\s+restrictions|are\s+not\s+an?\s+AI)/i,
  /<\/?script[\s>]/i,
  /\beval\s*\(/i,
]

export function checkSafety(skill: { promptTemplate?: string }): CICheckResult {
  const template = skill.promptTemplate ?? ''

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(template)) {
      return {
        checkType: 'safety',
        status: 'fail',
        output: `Prompt injection pattern detected: ${pattern.source}. Remove this pattern before resubmitting.`,
      }
    }
  }

  return { checkType: 'safety', status: 'pass', output: 'No injection patterns detected' }
}
