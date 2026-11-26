import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, count, and, inArray } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { generateEmbedding, buildEmbeddingText, embedSkillSync } from '../lib/embed'
import { upsertSkillVector } from '../lib/vectorize'
import { EMBEDDING_MODEL_FREE, EMBEDDING_MODEL_PAID } from '@skillmesh/shared'

type ApprovalEnv = {
  Bindings: {
    DB: D1Database
    VECTORIZE_384: VectorizeIndex
    VECTORIZE_768: VectorizeIndex
    AI: Ai
    EMBED_QUEUE: Queue | undefined
  }
  Variables: { userId: string; orgId: string; role: string }
}

const approvals = new Hono<ApprovalEnv>()

// GET /skills/:id/approvals — approval status for the skill
approvals.get('/:id/approvals', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')

  const skill = await db.select({ orgId: schema.skills.orgId, status: schema.skills.status })
    .from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) return c.json({ error: 'Skill not found' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden' }, 403)

  const org = await db.select({ settings: schema.orgs.settings })
    .from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()

  const votes = await db.select({
    reviewerId: schema.approvals.reviewerId,
    verdict: schema.approvals.verdict,
    comment: schema.approvals.comment,
    createdAt: schema.approvals.createdAt,
  }).from(schema.approvals).where(eq(schema.approvals.skillId, skillId)).all()

  const approveVotes = votes.filter(v => v.verdict === 'approved')
  const currentUserVote = votes.find(v => v.reviewerId === c.get('userId'))

  // Fetch reviewer names
  const reviewerIds = [...new Set(votes.map(v => v.reviewerId))]
  const reviewers: Record<string, string> = {}
  if (reviewerIds.length > 0) {
    const users = await db.select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users).where(inArray(schema.users.id, reviewerIds)).all()
    users.forEach(u => { reviewers[u.id] = u.name })
  }

  const currentUserId = c.get('userId')
  return c.json({
    approvalCount: approveVotes.length,
    threshold: org?.settings?.approvalThreshold ?? 1,
    hasVoted: !!currentUserVote,
    myVote: currentUserVote?.verdict ?? null,
    votes: votes.map(v => ({
      verdict: v.verdict,
      comment: v.comment,
      reviewerName: reviewers[v.reviewerId] ?? 'Unknown',
      isCurrentUser: v.reviewerId === currentUserId,
      createdAt: v.createdAt,
    })),
  })
})

// DELETE /skills/:id/approvals — withdraw your own vote while skill is still pending
approvals.delete('/:id/approvals', authMiddleware, async (c) => {
  const role = c.get('role')
  if (!['admin', 'curator'].includes(role)) {
    return c.json({ error: 'Only admins and curators can withdraw votes', code: 'FORBIDDEN' }, 403)
  }

  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')

  const skill = await db.select({ status: schema.skills.status, orgId: schema.skills.orgId })
    .from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'pending') return c.json({ error: 'Can only withdraw a vote while the skill is pending', code: 'BAD_REQUEST' }, 400)

  const existing = await db.select({ id: schema.approvals.id })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.skillId, skillId), eq(schema.approvals.reviewerId, c.get('userId'))))
    .get()
  if (!existing) return c.json({ error: 'No vote to withdraw', code: 'NOT_FOUND' }, 404)

  await db.delete(schema.approvals)
    .where(and(eq(schema.approvals.skillId, skillId), eq(schema.approvals.reviewerId, c.get('userId'))))

  const [{ value: approvalCount }] = await db
    .select({ value: count() })
    .from(schema.approvals)
    .where(and(eq(schema.approvals.skillId, skillId), eq(schema.approvals.verdict, 'approved')))

  return c.json({ ok: true, approvalCount })
})

approvals.post('/:id/approve', authMiddleware, async (c) => {
  // FIX #10: only admins/curators can approve; authors cannot self-approve
  const role = c.get('role')
  if (!['admin', 'curator'].includes(role)) {
    return c.json({ error: 'Only admins and curators can approve skills', code: 'FORBIDDEN' }, 403)
  }

  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')
  const body = await c.req.json<{ comment?: string }>().catch(() => ({ comment: '' }))
  const comment = String(body.comment ?? '').slice(0, 1000)

  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'pending') return c.json({ error: 'Skill is not pending review', code: 'BAD_REQUEST' }, 400)

  // FIX #10: authors cannot approve their own skills
  if (skill.authorId === c.get('userId')) {
    return c.json({ error: 'Authors cannot approve their own skills', code: 'FORBIDDEN' }, 403)
  }

  // Prevent duplicate votes from the same reviewer
  const alreadyVoted = await db.select().from(schema.approvals)
    .where(and(eq(schema.approvals.skillId, skillId), eq(schema.approvals.reviewerId, c.get('userId'))))
    .get()
  if (alreadyVoted) {
    return c.json({ error: 'You have already reviewed this skill', code: 'BAD_REQUEST' }, 400)
  }

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, skill.orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)

  await db.insert(schema.approvals).values({
    id: crypto.randomUUID(),
    skillId,
    reviewerId: c.get('userId'),
    verdict: 'approved',
    comment,
    createdAt: Date.now(),
  })

  const [{ value: approvalCount }] = await db
    .select({ value: count() })
    .from(schema.approvals)
    .where(eq(schema.approvals.skillId, skillId))

  const threshold = org.settings.approvalThreshold
  if (approvalCount >= threshold) {
    const now = Date.now()
    await db.update(schema.skills).set({ status: 'approved', publishedAt: now }).where(eq(schema.skills.id, skillId))

    const isPaid = org.plan !== 'free'
    if (isPaid) {
      const embText = buildEmbeddingText({
        description: skill.description,
        triggers: skill.triggers as string[],
        tags: skill.tags as string[],
      })
      const vector = await generateEmbedding(c.env.AI, embText, EMBEDDING_MODEL_PAID)
      await upsertSkillVector(c.env.VECTORIZE_768, skillId, vector, { orgId: skill.orgId, name: skill.name, visibility: skill.visibility })
    } else {
      try {
        await c.env.EMBED_QUEUE?.send({ skillId, orgId: skill.orgId })
      } catch {
        // Queue unavailable on Cloudflare free tier — embed synchronously instead.
        const skillRow = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
        if (skillRow) {
          await embedSkillSync(c.env, skillRow as import('../lib/embed').EmbedSkill)
        }
      }
    }

    return c.json({ published: true, approvalCount, threshold })
  }

  return c.json({ published: false, approvalCount, threshold })
})

approvals.post('/:id/reject', authMiddleware, async (c) => {
  // FIX #10: only admins/curators can reject
  const role = c.get('role')
  if (!['admin', 'curator'].includes(role)) {
    return c.json({ error: 'Only admins and curators can reject skills', code: 'FORBIDDEN' }, 403)
  }

  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')
  const body = await c.req.json<{ comment: string }>()
  if (!body.comment?.trim()) return c.json({ error: 'Rejection requires a comment', code: 'BAD_REQUEST' }, 400)

  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)
  if (skill.orgId !== c.get('orgId')) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (skill.status !== 'pending') return c.json({ error: 'Skill is not pending review', code: 'BAD_REQUEST' }, 400)

  await db.insert(schema.approvals).values({
    id: crypto.randomUUID(), skillId, reviewerId: c.get('userId'),
    verdict: 'rejected', comment: String(body.comment).slice(0, 1000), createdAt: Date.now(),
  })
  await db.update(schema.skills).set({ status: 'draft' }).where(eq(schema.skills.id, skillId))
  return c.json({ rejected: true, comment: body.comment })
})

export default approvals
