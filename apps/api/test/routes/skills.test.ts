import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import app from '../../src/index'
import { createDb, schema } from '@skillmesh/db'
import { EMBEDDING_DIM_FREE, DEFAULT_APPROVAL_THRESHOLD, API_KEY_PREFIX } from '@skillmesh/shared'
import { applyMigrations } from '../setup'

async function seedUser(e: typeof env) {
  const db = createDb(e.DB)
  const orgId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const apiKey = `${API_KEY_PREFIX}skilltest${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
  await db.insert(schema.orgs).values({
    id: orgId, name: 'Test Org', slug: `test-org-${orgId.slice(0, 8)}`, plan: 'free',
    settings: { approvalThreshold: DEFAULT_APPROVAL_THRESHOLD, embeddingDim: EMBEDDING_DIM_FREE },
    createdAt: Date.now(),
  })
  await db.insert(schema.users).values({
    id: userId, email: `test-${orgId}@example.com`, name: 'Test User',
    orgId, role: 'admin', apiKey, lastActiveAt: Date.now(),
  })
  return { orgId, userId, apiKey }
}

beforeAll(async () => {
  await applyMigrations()
})

describe('POST /skills', () => {
  it('creates a skill in draft status', async () => {
    const { apiKey } = await seedUser(env)
    const res = await app.request('/skills', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'jira-sprint-report',
        description: 'Generates a sprint velocity report from Jira',
        promptTemplate: 'You are analyzing sprint data. Given board {{board}}...',
        triggers: ['sprint report', 'velocity'],
        tags: ['jira', 'reporting'],
        toolsRequired: ['jira_list_sprints'],
        tokenEstimate: 800,
      }),
    }, env)
    expect(res.status).toBe(201)
    const body = await res.json<{ status: string; name: string }>()
    expect(body.status).toBe('draft')
    expect(body.name).toBe('jira-sprint-report')
  })

  it('returns 401 without auth', async () => {
    const res = await app.request('/skills', { method: 'POST' }, env)
    expect(res.status).toBe(401)
  })
})

describe('POST /skills/:id/submit', () => {
  it('moves skill to pending status', async () => {
    const { apiKey, userId, orgId } = await seedUser(env)
    const db = createDb(env.DB)
    const skillId = crypto.randomUUID()
    await db.insert(schema.skills).values({
      id: skillId, orgId, authorId: userId, name: 'test', slug: 'test',
      version: '1.0.0', description: 'desc', promptTemplate: 'Do {{task}}',
      toolsRequired: [], triggers: ['test'], tags: [], visibility: 'private',
      status: 'draft', tokenEstimate: 100, avgTokenSavings: 0, useCount: 0,
      createdAt: Date.now(),
    })
    const res = await app.request(`/skills/${skillId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    }, env)
    expect(res.status).toBe(200)
  })
})
