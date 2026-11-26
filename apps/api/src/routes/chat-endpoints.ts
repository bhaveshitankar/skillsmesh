import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { isPro } from '../lib/plan'

type Env = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

const chatEndpoints = new Hono<Env>()
chatEndpoints.use('*', authMiddleware)

// GET /chat-endpoints — list all for org
chatEndpoints.get('/', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)
  const endpoints = await db.select().from(schema.chatEndpoints)
    .where(eq(schema.chatEndpoints.orgId, c.get('orgId')))
    .all()
  return c.json({ endpoints })
})

// POST /chat-endpoints — create new endpoint
chatEndpoints.post('/', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only' }, 403)

  const body = await c.req.json<{ name: string; workflowId?: string; config?: Record<string, unknown> }>()
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400)

  // Validate workflowId if provided
  if (body.workflowId) {
    const wf = await db.select().from(schema.workflows)
      .where(and(eq(schema.workflows.id, body.workflowId), eq(schema.workflows.orgId, c.get('orgId'))))
      .get()
    if (!wf) return c.json({ error: 'Workflow not found' }, 404)
  }

  const id = crypto.randomUUID()
  const token = crypto.randomUUID().replace(/-/g, '')
  await db.insert(schema.chatEndpoints).values({
    id,
    orgId: c.get('orgId'),
    workflowId: body.workflowId ?? null,
    name: body.name.trim().slice(0, 80),
    token,
    config: (body.config ?? {}) as never,
    createdAt: Date.now(),
  })
  return c.json({ endpoint: { id, token, name: body.name.trim() } }, 201)
})

// PATCH /chat-endpoints/:id — update config/name
chatEndpoints.patch('/:id', async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only' }, 403)

  const ep = await db.select().from(schema.chatEndpoints)
    .where(and(eq(schema.chatEndpoints.id, c.req.param('id')), eq(schema.chatEndpoints.orgId, c.get('orgId'))))
    .get()
  if (!ep) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    name?: string
    workflowId?: string | null
    config?: Record<string, unknown>
    regenerateToken?: boolean
  }>()

  const newToken = body.regenerateToken ? crypto.randomUUID().replace(/-/g, '') : ep.token
  await db.update(schema.chatEndpoints).set({
    ...(body.name ? { name: body.name.trim().slice(0, 80) } : {}),
    ...(body.workflowId !== undefined ? { workflowId: body.workflowId } : {}),
    ...(body.config !== undefined ? { config: { ...ep.config, ...body.config } as never } : {}),
    token: newToken,
  }).where(eq(schema.chatEndpoints.id, ep.id))

  return c.json({ ok: true, token: newToken })
})

// DELETE /chat-endpoints/:id
chatEndpoints.delete('/:id', async (c) => {
  const db = createDb(c.env.DB)
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only' }, 403)
  await db.delete(schema.chatEndpoints)
    .where(and(eq(schema.chatEndpoints.id, c.req.param('id')), eq(schema.chatEndpoints.orgId, c.get('orgId'))))
  return c.json({ ok: true })
})

export default chatEndpoints
