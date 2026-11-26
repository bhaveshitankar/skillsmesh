import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { storeKey, getKey, deleteKey } from '../../src/lib/byok'

describe('byok key management', () => {
  it('stores and retrieves a key', async () => {
    await storeKey(env.KV, 'org-1', 'user-1', 'sk-test-openai-key')
    const key = await getKey(env.KV, 'org-1', 'user-1')
    expect(key).toBe('sk-test-openai-key')
  })

  it('returns null for missing key', async () => {
    const key = await getKey(env.KV, 'org-missing', 'user-missing')
    expect(key).toBeNull()
  })

  it('deletes a key', async () => {
    await storeKey(env.KV, 'org-2', 'user-2', 'sk-to-delete')
    await deleteKey(env.KV, 'org-2', 'user-2')
    const key = await getKey(env.KV, 'org-2', 'user-2')
    expect(key).toBeNull()
  })
})
