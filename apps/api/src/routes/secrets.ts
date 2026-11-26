import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, or } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { isPro } from '../lib/plan'
import { nrLog } from '../lib/newrelic'

type Env = {
  Bindings: { DB: D1Database; SESSION_SECRET: string }
  Variables: { userId: string; orgId: string; role: string }
}

const secrets = new Hono<Env>()

async function deriveKey(sessionSecret: string, orgId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(sessionSecret + orgId), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(orgId), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encrypt(value: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(value))
  const combined = new Uint8Array(iv.length + cipher.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(cipher), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decrypt(data: string, key: CryptoKey): Promise<string> {
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  const iv = bytes.slice(0, 12)
  const cipher = bytes.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder().decode(plain)
}

const NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/

secrets.use('*', authMiddleware)

secrets.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

  const rows = await db.select({
    id: schema.orgSecrets.id,
    name: schema.orgSecrets.name,
    scope: schema.orgSecrets.scope,
    createdAt: schema.orgSecrets.createdAt,
  }).from(schema.orgSecrets).where(
    and(
      eq(schema.orgSecrets.orgId, c.get('orgId')),
      or(
        eq(schema.orgSecrets.scope, 'org'),
        eq(schema.orgSecrets.userId, c.get('userId'))
      )
    )
  ).all()

  return c.json({ secrets: rows })
})

secrets.post('/', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

  const body = await c.req.json<{ name: string; value: string; scope?: 'org' | 'user' }>()
  if (!NAME_PATTERN.test(body.name)) {
    return c.json({ error: 'Name must be UPPER_SNAKE_CASE (e.g. MY_KEY)' }, 400)
  }

  const scope = body.scope === 'user' ? 'user' : 'org'
  const key = await deriveKey(c.env.SESSION_SECRET, c.get('orgId'))
  const encryptedValue = await encrypt(body.value, key)
  const now = Date.now()
  const id = crypto.randomUUID()

  await db.insert(schema.orgSecrets).values({
    id, orgId: c.get('orgId'),
    userId: scope === 'user' ? c.get('userId') : null,
    scope, name: body.name, encryptedValue, createdAt: now,
  })

  nrLog(c.env as never, 'info', 'secret.created', { orgId: c.get('orgId'), name: body.name, scope })

  return c.json({ id, name: body.name, scope, createdAt: now })
})

secrets.put('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

  const secret = await db.select().from(schema.orgSecrets).where(
    and(eq(schema.orgSecrets.id, c.req.param('id')), eq(schema.orgSecrets.orgId, c.get('orgId')))
  ).get()
  if (!secret) return c.json({ error: 'Not found' }, 404)
  if (secret.scope === 'user' && secret.userId !== c.get('userId')) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json<{ value: string }>()
  const key = await deriveKey(c.env.SESSION_SECRET, c.get('orgId'))
  const encryptedValue = await encrypt(body.value, key)

  await db.update(schema.orgSecrets).set({ encryptedValue }).where(eq(schema.orgSecrets.id, c.req.param('id')))

  return c.json({ ok: true })
})

secrets.delete('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

  const secret = await db.select().from(schema.orgSecrets).where(
    and(eq(schema.orgSecrets.id, c.req.param('id')), eq(schema.orgSecrets.orgId, c.get('orgId')))
  ).get()
  if (!secret) return c.json({ error: 'Not found' }, 404)
  if (secret.scope === 'user' && secret.userId !== c.get('userId')) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(schema.orgSecrets).where(eq(schema.orgSecrets.id, c.req.param('id')))

  return c.json({ ok: true })
})

export { decrypt, deriveKey }
export default secrets
