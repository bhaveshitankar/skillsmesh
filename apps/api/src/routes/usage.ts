import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, sql, and, or, inArray } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import type { UsageOutcome } from '@skillmesh/shared'

type UsageEnv = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

const usage = new Hono<UsageEnv>()

usage.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{
    skillId?: string
    queryText: string
    matchScore?: number
    tokensUsed?: number
    tokensSaved?: number
    outcome: UsageOutcome
  }>()

  if (!body.queryText?.trim()) return c.json({ error: 'queryText is required', code: 'BAD_REQUEST' }, 400)
  if (body.queryText.length > 2000) return c.json({ error: 'queryText too long', code: 'BAD_REQUEST' }, 400)
  if (!['used', 'skipped', 'fallback'].includes(body.outcome)) {
    return c.json({ error: 'Invalid outcome value', code: 'BAD_REQUEST' }, 400)
  }

  const db = createDb(c.env.DB)
  await db.insert(schema.usageEvents).values({
    id: crypto.randomUUID(),
    skillId: body.skillId ?? null,
    userId: c.get('userId'),
    orgId: c.get('orgId'),
    matchedAt: Date.now(),
    queryText: body.queryText,
    matchScore: body.matchScore,
    tokensUsed: body.tokensUsed,
    tokensSaved: body.tokensSaved,
    outcome: body.outcome,
  })

  if (body.skillId && body.outcome === 'used') {
    // FIX #12: verify skillId is accessible to this org before updating stats
    const shareRows = await db.select({ skillId: schema.orgShares.skillId })
      .from(schema.orgShares)
      .where(eq(schema.orgShares.toOrgId, c.get('orgId')))
      .all()
    const sharedIds = shareRows.map(r => r.skillId)
    const accessFilter = sharedIds.length > 0
      ? or(eq(schema.skills.orgId, c.get('orgId')), eq(schema.skills.visibility, 'public'), inArray(schema.skills.id, sharedIds))
      : or(eq(schema.skills.orgId, c.get('orgId')), eq(schema.skills.visibility, 'public'))
    const accessible = await db.select({ id: schema.skills.id }).from(schema.skills)
      .where(and(eq(schema.skills.id, body.skillId), accessFilter!))
      .get()
    if (accessible) {
      await db
        .update(schema.skills)
        .set({
          useCount: sql`use_count + 1`,
          avgTokenSavings: body.tokensSaved
            ? sql`(avg_token_savings * use_count + ${body.tokensSaved}) / (use_count + 1)`
            : sql`avg_token_savings`,
        })
        .where(eq(schema.skills.id, body.skillId))
    }
  }

  return c.json({ logged: true })
})

export default usage
