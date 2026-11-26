import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import app from '../../src/index'
import { applyMigrations } from '../setup'

beforeAll(async () => {
  await applyMigrations()
})

describe('auth middleware', () => {
  it('returns 401 when no Authorization header', async () => {
    const res = await app.request('/me', {}, env)
    expect(res.status).toBe(401)
  })

  it('returns 401 when api key is invalid', async () => {
    const res = await app.request('/me', {
      headers: { Authorization: 'Bearer sk-invalid' }
    }, env)
    expect(res.status).toBe(401)
  })
})
