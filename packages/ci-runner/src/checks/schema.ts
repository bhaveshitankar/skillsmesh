import type { CICheckResult } from '@skillmesh/shared'

interface SkillInput {
  name?: string
  description?: string
  promptTemplate?: string
  triggers?: string[]
  tags?: string[]
}

export function checkSchema(skill: SkillInput): CICheckResult {
  const missing: string[] = []

  if (!skill.name?.trim()) missing.push('name')
  if (!skill.description?.trim()) missing.push('description')
  if (!skill.promptTemplate?.trim()) missing.push('promptTemplate')
  if (!Array.isArray(skill.triggers) || skill.triggers.length === 0) missing.push('triggers (must have at least one)')

  if (missing.length > 0) {
    return {
      checkType: 'schema',
      status: 'fail',
      output: `Missing required fields: ${missing.join(', ')}`,
    }
  }

  const hasTemplateVars = /\{\{[^}]+\}\}/.test(skill.promptTemplate!)
  if (!hasTemplateVars) {
    return {
      checkType: 'schema',
      status: 'warn',
      output: 'No template variables ({{varName}}) found in promptTemplate. Skills without variables may not be reusable.',
    }
  }

  return { checkType: 'schema', status: 'pass', output: 'All required fields present' }
}
