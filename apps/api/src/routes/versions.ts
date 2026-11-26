import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

type Env = {
  Bindings: { DB: D1Database; VECTORIZE_384: VectorizeIndex; VECTORIZE_768: VectorizeIndex; AI: Ai }
  Variables: { userId: string; orgId: string; role: string }
}

const versions = new Hono<Env>()
versions.use('*', authMiddleware)

// GET /skills/:id/versions — list all versions for a skill
versions.get('/:id/versions', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const rows = await db.select().from(schema.skillVersions)
    .where(eq(schema.skillVersions.skillId, skill.id))
    .orderBy(desc(schema.skillVersions.createdAt))
    .all()

  return c.json({ versions: rows, current: skill.version })
})

// POST /skills/:id/versions — save current template as a new named version
versions.post('/:id/versions', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ version?: string; changelog?: string; promptTemplate?: string }>()
    .catch(() => ({} as { version?: string; changelog?: string; promptTemplate?: string }))

  const label = (body.version ?? '').trim().slice(0, 50)
  if (!label) return c.json({ error: 'version label required (e.g. "v2")' }, 400)

  // Check label uniqueness within the skill
  const existing = await db.select().from(schema.skillVersions)
    .where(and(eq(schema.skillVersions.skillId, skill.id), eq(schema.skillVersions.version, label)))
    .get()
  if (existing) return c.json({ error: `Version "${label}" already exists` }, 409)

  const template = (body.promptTemplate ?? skill.promptTemplate).slice(0, 50000)
  const changelog = (body.changelog ?? '').slice(0, 2000)

  const id = crypto.randomUUID()
  await db.insert(schema.skillVersions).values({
    id, skillId: skill.id, version: label,
    promptTemplate: template, changelog, createdAt: Date.now(),
  })

  return c.json({ id, version: label, changelog, createdAt: Date.now() }, 201)
})

// POST /skills/:id/versions/:version/promote — make a saved version the active template
versions.post('/:id/versions/:version/promote', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  if (!['admin', 'curator'].includes(c.get('role')))
    return c.json({ error: 'Only admins and curators can promote versions' }, 403)

  const ver = await db.select().from(schema.skillVersions)
    .where(and(
      eq(schema.skillVersions.skillId, skill.id),
      eq(schema.skillVersions.version, c.req.param('version')),
    )).get()
  if (!ver) return c.json({ error: 'Version not found' }, 404)

  await db.update(schema.skills)
    .set({ promptTemplate: ver.promptTemplate, version: ver.version, status: 'draft' })
    .where(eq(schema.skills.id, skill.id))

  return c.json({ ok: true, promoted: ver.version })
})

// DELETE /skills/:id/versions/:version
versions.delete('/:id/versions/:version', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  if (!['admin', 'curator'].includes(c.get('role')))
    return c.json({ error: 'Only admins and curators can delete versions' }, 403)

  await db.delete(schema.skillVersions)
    .where(and(
      eq(schema.skillVersions.skillId, skill.id),
      eq(schema.skillVersions.version, c.req.param('version')),
    ))

  return c.json({ ok: true })
})

export default versions
