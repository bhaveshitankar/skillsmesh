import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import app from '../../src/index'
import { createDb, schema } from '@skillmesh/db'
import { API_KEY_PREFIX, EMBEDDING_DIM_FREE, DEFAULT_APPROVAL_THRESHOLD } from '@skillmesh/shared'
import { applyMigrations } from '../setup'

async function seedUserAndOrg(e: typeof env) {
  const db = createDb(e.DB)
  const orgId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const apiKey = `${API_KEY_PREFIX}resolve${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
  await db.insert(schema.orgs).values({
    id: orgId, name: 'Resolve Org', slug: `resolve-${orgId.slice(0, 8)}`, plan: 'free',
    settings: { approvalThreshold: DEFAULT_APPROVAL_THRESHOLD, embeddingDim: EMBEDDING_DIM_FREE },
    createdAt: Date.now(),
  })
  await db.insert(schema.users).values({
    id: userId, email: `resolve-${orgId}@example.com`, name: 'Resolve User',
    orgId, role: 'admin', apiKey, lastActiveAt: Date.now(),
  })
  return { orgId, userId, apiKey }
}

beforeAll(async () => {
  await applyMigrations()
})

describe('POST /resolve', () => {
  it('returns 401 without auth', async () => {
    const res = await app.request('/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'sprint report' }),
    }, env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when query is missing', async () => {
    const { apiKey } = await seedUserAndOrg(env)
    const res = await app.request('/resolve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env)
    expect(res.status).toBe(400)
  })
})
