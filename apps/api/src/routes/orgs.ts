import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

type OrgEnv = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

const orgs = new Hono<OrgEnv>()

orgs.get('/:slug', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db
    .select()
    .from(schema.orgs)
    .where(eq(schema.orgs.slug, c.req.param('slug')))
    .get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.id !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  return c.json(org)
})

// PATCH /orgs/:slug — admin-only org settings update
orgs.patch('/:slug', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') {
    return c.json({ error: 'Only admins can update org settings', code: 'FORBIDDEN' }, 403)
  }
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, c.req.param('slug'))).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.id !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const body = await c.req.json<Record<string, unknown>>()
  const updates: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name || name.length > 100) {
      return c.json({ error: 'name: 1–100 characters required', code: 'BAD_REQUEST' }, 400)
    }
    updates.name = name
  }

  if (body.approvalThreshold !== undefined) {
    const t = parseInt(String(body.approvalThreshold), 10)
    if (isNaN(t) || t < 0 || t > 20) {
      return c.json({ error: 'approvalThreshold must be 0–20', code: 'BAD_REQUEST' }, 400)
    }
    updates.settings = { ...org.settings, approvalThreshold: t }
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ error: 'No valid fields to update', code: 'BAD_REQUEST' }, 400)
  }

  await db.update(schema.orgs).set(updates).where(eq(schema.orgs.id, org.id))
  const updated = await db.select().from(schema.orgs).where(eq(schema.orgs.id, org.id)).get()
  return c.json(updated)
})

export default orgs
