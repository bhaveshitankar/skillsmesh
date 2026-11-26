import { describe, it, expect, beforeAll } from 'vitest'
import { env } from 'cloudflare:test'
import app from '../../src/index'
import { applyMigrations } from '../setup'

beforeAll(async () => {
  await applyMigrations()
})

describe('GET /auth/github', () => {
  it('redirects to github oauth', async () => {
    const res = await app.request('/auth/github', {}, {
      ...env,
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-secret',
      SESSION_SECRET: 'test-session-secret',
    })
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toContain('github.com/login/oauth/authorize')
    expect(res.headers.get('Location')).toContain('test-client-id')
  })
})
