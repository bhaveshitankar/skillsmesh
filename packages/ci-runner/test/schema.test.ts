import { describe, it, expect } from 'vitest'
import { checkSchema } from '../src/checks/schema'

describe('checkSchema', () => {
  it('passes a valid skill', () => {
    const result = checkSchema({
      name: 'test-skill',
      description: 'A test skill',
      promptTemplate: 'Do {{task}} for {{context}}',
      triggers: ['run test', 'execute test'],
      tags: ['testing'],
    })
    expect(result.status).toBe('pass')
  })

  it('fails when name is missing', () => {
    const result = checkSchema({ description: 'A skill', promptTemplate: 'Do it', triggers: ['do it'], tags: [] } as any)
    expect(result.status).toBe('fail')
    expect(result.output).toContain('name')
  })

  it('fails when triggers array is empty', () => {
    const result = checkSchema({ name: 'skill', description: 'desc', promptTemplate: 'Do it', triggers: [], tags: [] })
    expect(result.status).toBe('fail')
    expect(result.output).toContain('triggers')
  })

  it('warns when no template variables found', () => {
    const result = checkSchema({ name: 'skill', description: 'desc', promptTemplate: 'Do it with no vars', triggers: ['do it'], tags: [] })
    expect(result.status).toBe('warn')
  })
})
