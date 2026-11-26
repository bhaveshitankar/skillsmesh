import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, count, or, inArray, like } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { FREE_TIER_MAX_PRIVATE_SKILLS } from '@skillmesh/shared'

type SkillEnv = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

const skills = new Hono<SkillEnv>()

// Safe fields to return — never includes internal or sensitive columns
function safeSkill(s: Record<string, unknown>) {
  return {
    id: s.id, orgId: s.orgId, authorId: s.authorId,
    name: s.name, slug: s.slug, version: s.version,
    description: s.description, promptTemplate: s.promptTemplate,
    toolsRequired: s.toolsRequired, triggers: s.triggers, tags: s.tags,
    visibility: s.visibility, status: s.status,
    tokenEstimate: s.tokenEstimate, avgTokenSavings: s.avgTokenSavings,
    useCount: s.useCount, upvotes: s.upvotes, downvotes: s.downvotes,
    createdAt: s.createdAt, publishedAt: s.publishedAt,
    mcpTools: s.mcpTools,
  }
}

// GET /skills?visibility=public&search=q&page=0&limit=50
// GET /skills — authenticated (own org + shared)
skills.get('/', async (c) => {
  const visibility = c.req.query('visibility')
  const search = c.req.query('search')?.trim() ?? ''
  const page = Math.max(0, parseInt(c.req.query('page') ?? '0', 10))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)))
  const db = createDb(c.env.DB)

  const searchFilter = search
    ? or(like(schema.skills.name, `%${search}%`), like(schema.skills.description, `%${search}%`))
    : undefined

  // Unauthenticated — only public approved skills
  if (visibility === 'public') {
    const baseWhere = and(eq(schema.skills.visibility, 'public'), eq(schema.skills.status, 'approved'))
    const whereClause = searchFilter ? and(baseWhere, searchFilter) : baseWhere
    const [{ value: total }] = await db.select({ value: count() }).from(schema.skills).where(whereClause)
    const rows = await db.select().from(schema.skills).where(whereClause).limit(limit).offset(page * limit).all()
    return c.json({ skills: rows.map(safeSkill), total, page, limit })
  }

  // Authenticated — own org + shared skills
  const token = c.req.header('Authorization')?.slice(7)
  if (!token || !token.startsWith('sk-')) {
    return c.json({ error: 'Authorization required', code: 'UNAUTHORIZED' }, 401)
  }
  const user = await db.select().from(schema.users).where(eq(schema.users.apiKey, token)).get()
  if (!user) return c.json({ error: 'Invalid token', code: 'UNAUTHORIZED' }, 401)

  const shareRows = await db
    .select({ skillId: schema.orgShares.skillId })
    .from(schema.orgShares)
    .where(eq(schema.orgShares.toOrgId, user.orgId))
    .all()
  const sharedSkillIds = shareRows.map(r => r.skillId)

  const ownershipFilter = sharedSkillIds.length > 0
    ? or(eq(schema.skills.orgId, user.orgId), inArray(schema.skills.id, sharedSkillIds))
    : eq(schema.skills.orgId, user.orgId)

  const visibilityFilter = visibility && visibility !== 'all'
    ? eq(schema.skills.visibility, visibility as 'private' | 'shared' | 'public')
    : undefined

  const baseWhere = visibilityFilter ? and(ownershipFilter, visibilityFilter) : ownershipFilter
  const whereClause = searchFilter ? and(baseWhere, searchFilter) : baseWhere

  const [{ value: total }] = await db.select({ value: count() }).from(schema.skills).where(whereClause)
  const rows = await db.select().from(schema.skills).where(whereClause).limit(limit).offset(page * limit).all()
  return c.json({ skills: rows.map(safeSkill), total, page, limit })
})

skills.post('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)

  if (org.plan === 'free') {
    const [result] = await db
      .select({ value: count() })
      .from(schema.skills)
      .where(and(eq(schema.skills.orgId, orgId), eq(schema.skills.visibility, 'private')))
    if (result.value >= FREE_TIER_MAX_PRIVATE_SKILLS) {
      return c.json({ error: 'Free tier limit: 25 private skills', code: 'PLAN_LIMIT' }, 402)
    }
  }

  const body = await c.req.json<Record<string, unknown>>()

  // FIX #14: runtime input validation with strict length limits
  const name = String(body.name ?? '').trim()
  const description = String(body.description ?? '').trim()
  const promptTemplate = String(body.promptTemplate ?? '').trim()
  if (!name || name.length > 200) return c.json({ error: 'name: 1–200 characters required', code: 'BAD_REQUEST' }, 400)
  if (!description || description.length > 2000) return c.json({ error: 'description: 1–2000 characters required', code: 'BAD_REQUEST' }, 400)
  if (!promptTemplate || promptTemplate.length > 50000) return c.json({ error: 'promptTemplate: 1–50000 characters required', code: 'BAD_REQUEST' }, 400)

  const triggers = Array.isArray(body.triggers) ? (body.triggers as unknown[]).slice(0, 50).map(t => String(t).slice(0, 100)) : []
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).slice(0, 20).map(t => String(t).slice(0, 50)) : []
  const toolsRequired = Array.isArray(body.toolsRequired) ? (body.toolsRequired as unknown[]).slice(0, 20).map(t => String(t).slice(0, 100)) : []

  const tokenEstimate = typeof body.tokenEstimate === 'number' ? Math.max(0, Math.min(1_000_000, Math.floor(body.tokenEstimate))) : 0

  const VALID_VISIBILITY = ['private', 'shared', 'public']
  const visibility = VALID_VISIBILITY.includes(String(body.visibility)) ? String(body.visibility) as 'private' | 'shared' | 'public' : 'private'

  const id = crypto.randomUUID()
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-')

  await db.insert(schema.skills).values({
    id, orgId, authorId: userId,
    name, slug, version: '1.0.0',
    description, promptTemplate,
    toolsRequired, triggers, tags,
    visibility, status: 'draft',
    tokenEstimate, avgTokenSavings: 0, useCount: 0,
    createdAt: Date.now(),
  })

  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, id)).get()
  return c.json(safeSkill(skill as unknown as Record<string, unknown>), 201)
})

skills.get('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.visibility === 'private' && skill.orgId !== c.get('orgId')) {
    return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  }
  const author = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, skill.authorId)).get()
  return c.json({ ...safeSkill(skill as unknown as Record<string, unknown>), authorName: author?.name ?? null })
})

skills.patch('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.authorId !== c.get('userId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'draft') return c.json({ error: 'Only draft skills can be edited', code: 'BAD_REQUEST' }, 400)

  const body = await c.req.json<Record<string, unknown>>()

  // FIX #5: explicit allowlist — never spread unvalidated body into Drizzle .set()
  const safeUpdates: Record<string, unknown> = {}
  if (body.description !== undefined) safeUpdates.description = String(body.description).slice(0, 2000)
  if (body.promptTemplate !== undefined) safeUpdates.promptTemplate = String(body.promptTemplate).slice(0, 50000)
  if (body.triggers !== undefined && Array.isArray(body.triggers)) safeUpdates.triggers = (body.triggers as unknown[]).slice(0, 50).map(t => String(t).slice(0, 100))
  if (body.tags !== undefined && Array.isArray(body.tags)) safeUpdates.tags = (body.tags as unknown[]).slice(0, 20).map(t => String(t).slice(0, 50))
  if (body.toolsRequired !== undefined && Array.isArray(body.toolsRequired)) safeUpdates.toolsRequired = (body.toolsRequired as unknown[]).slice(0, 20).map(t => String(t).slice(0, 100))
  if (body.tokenEstimate !== undefined) safeUpdates.tokenEstimate = Math.max(0, Math.min(1_000_000, parseInt(String(body.tokenEstimate), 10) || 0))
  if (body.visibility !== undefined && ['private', 'shared', 'public'].includes(String(body.visibility))) safeUpdates.visibility = String(body.visibility)

  if (Object.keys(safeUpdates).length === 0) return c.json({ error: 'No valid fields to update', code: 'BAD_REQUEST' }, 400)

  await db.update(schema.skills).set(safeUpdates).where(eq(schema.skills.id, skill.id))
  const updated = await db.select().from(schema.skills).where(eq(schema.skills.id, skill.id)).get()
  return c.json(safeSkill(updated as unknown as Record<string, unknown>))
})

skills.delete('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  const isAuthor = skill.authorId === c.get('userId')
  const isAdmin = c.get('role') === 'admin'
  if (!isAuthor && !isAdmin) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status === 'approved') return c.json({ error: 'Cannot delete an approved skill. Revert it to draft first.', code: 'BAD_REQUEST' }, 400)

  // Delete all child rows that reference this skill (FK cascade not guaranteed in D1)
  await db.delete(schema.skillEvalRuns).where(eq(schema.skillEvalRuns.skillId, skillId))
  await db.delete(schema.skillTestCases).where(eq(schema.skillTestCases.skillId, skillId))
  await db.delete(schema.skillChunks).where(eq(schema.skillChunks.skillId, skillId))
  await db.delete(schema.skillAssets).where(eq(schema.skillAssets.skillId, skillId))
  await db.delete(schema.skillVersions).where(eq(schema.skillVersions.skillId, skillId))
  await db.delete(schema.approvals).where(eq(schema.approvals.skillId, skillId))
  await db.delete(schema.ciChecks).where(eq(schema.ciChecks.skillId, skillId))
  await db.delete(schema.orgShares).where(eq(schema.orgShares.skillId, skillId))
  await db.delete(schema.skillVotes).where(eq(schema.skillVotes.skillId, skillId))
  await db.delete(schema.skillDonations).where(eq(schema.skillDonations.skillId, skillId))
  // usage_events has nullable skillId — just null it out rather than deleting the analytics row
  await db.update(schema.usageEvents).set({ skillId: null }).where(eq(schema.usageEvents.skillId, skillId))

  await db.delete(schema.skills).where(eq(schema.skills.id, skillId))
  return c.json({ ok: true })
})

skills.post('/:id/submit', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.authorId !== c.get('userId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'draft') return c.json({ error: 'Skill is not in draft status', code: 'BAD_REQUEST' }, 400)

  // Clear votes from previous review cycles so reviewers can vote fresh
  await db.delete(schema.approvals).where(eq(schema.approvals.skillId, skill.id))
  await db.update(schema.skills).set({ status: 'pending' }).where(eq(schema.skills.id, skill.id))
  return c.json({ message: 'Submitted for CI and peer review', skillId: skill.id })
})

// POST /skills/:id/revert — admin/curator reverts approved skill back to draft
skills.post('/:id/revert', authMiddleware, async (c) => {
  const role = c.get('role')
  if (!['admin', 'curator'].includes(role)) {
    return c.json({ error: 'Only admins and curators can revert skills', code: 'FORBIDDEN' }, 403)
  }
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'approved') return c.json({ error: 'Only approved skills can be reverted', code: 'BAD_REQUEST' }, 400)
  await db.update(schema.skills).set({ status: 'draft', publishedAt: null }).where(eq(schema.skills.id, skill.id))
  return c.json({ ok: true })
})

// POST /skills/:id/share — generate (or return existing) share token
skills.post('/:id/share', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Skill not found' }, 404)

  if (skill.shareToken) return c.json({ shareToken: skill.shareToken })

  const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 24)
  await db.update(schema.skills).set({ shareToken: token }).where(eq(schema.skills.id, skill.id))
  return c.json({ shareToken: token })
})

// DELETE /skills/:id/share — revoke share token
skills.delete('/:id/share', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  if (c.get('role') === 'member' && skill.authorId !== c.get('userId')) {
    return c.json({ error: 'Only the author or admin can revoke the share link' }, 403)
  }
  await db.update(schema.skills).set({ shareToken: null }).where(eq(schema.skills.id, skill.id))
  return c.json({ ok: true })
})

export default skills
