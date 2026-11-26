import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, inArray } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { generateEmbedding, generateEmbeddingWithFallback } from '../lib/embed'
import { searchSkills as vectorSearch } from '../lib/vectorize'
import {
  SCORE_THRESHOLD_FREE,
  SCORE_THRESHOLD_PAID,
  EMBEDDING_MODEL_FREE,
  EMBEDDING_MODEL_PAID,
  FREE_TIER_MAX_RESOLVER_CALLS_PER_MONTH,
} from '@skillmesh/shared'
import type { ResolveSkillResponse } from '@skillmesh/shared'

type ResolveEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    VECTORIZE_384: VectorizeIndex
    VECTORIZE_768: VectorizeIndex
    AI: Ai
    JINA_API_KEY?: string
  }
  Variables: { userId: string; orgId: string; role: string }
}

const resolve = new Hono<ResolveEnv>()

resolve.post('/', authMiddleware, async (c) => {
  const body = await c.req.json<{ query?: string; topK?: number }>()
  if (!body.query?.trim()) {
    return c.json({ error: 'query is required', code: 'BAD_REQUEST' }, 400)
  }
  if (body.query.length > 2000) {
    return c.json({ error: 'query must be under 2000 characters', code: 'BAD_REQUEST' }, 400)
  }

  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)

  const isPaid = org.plan !== 'free'

  if (!isPaid) {
    const monthKey = `resolve:${orgId}:${new Date().toISOString().slice(0, 7)}`
    const now = Date.now()
    const row = await c.env.DB.prepare(
      'SELECT count FROM rate_limits WHERE key = ? AND expires_at > ?'
    ).bind(monthKey, now).first<{ count: number }>()

    if ((row?.count ?? 0) >= FREE_TIER_MAX_RESOLVER_CALLS_PER_MONTH) {
      return c.json({ error: 'Monthly resolver limit reached. Upgrade to Pro for unlimited calls.', code: 'PLAN_LIMIT' }, 402)
    }

    // Upsert the counter without blocking the embedding call.
    // Resets cleanly when expires_at has passed (new month key each month).
    const expiresAt = now + 35 * 24 * 60 * 60 * 1000
    c.executionCtx.waitUntil(
      c.env.DB.prepare(
        'INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1'
      ).bind(monthKey, expiresAt).run()
    )
  }

  const index = isPaid ? c.env.VECTORIZE_768 : c.env.VECTORIZE_384
  const threshold = isPaid ? SCORE_THRESHOLD_PAID : SCORE_THRESHOLD_FREE

  // Free tier: Jina AI → Cloudflare Workers AI (384-dim fallback chain).
  // Paid tier: Workers AI BGE-base (768-dim, higher accuracy, no fallback needed).
  const queryVector = isPaid
    ? await generateEmbedding(c.env.AI, body.query, EMBEDDING_MODEL_PAID)
    : await generateEmbeddingWithFallback(c.env, body.query)

  // Search skill-level vectors (type='skill' or no type for backward compat)
  const matches = await vectorSearch(index, queryVector, body.topK ?? 5)

  if (matches.length === 0) {
    return c.json<ResolveSkillResponse>({ found: false, topCandidates: [] })
  }

  // Filter to skill-level matches only (exclude chunk_ prefix vectors)
  const skillMatches = matches.filter(m => !m.id.startsWith('chunk_'))
  if (skillMatches.length === 0) {
    return c.json<ResolveSkillResponse>({ found: false, topCandidates: [] })
  }

  const skillIds = skillMatches.map((m) => m.id)

  // Find skills shared with this org so we can include them
  const shareRows = await db
    .select({ skillId: schema.orgShares.skillId })
    .from(schema.orgShares)
    .where(inArray(schema.orgShares.skillId, skillIds))
    .all()
  const sharedWithOrg = new Set(shareRows.map(r => r.skillId))

  const skills = await db
    .select()
    .from(schema.skills)
    .where(inArray(schema.skills.id, skillIds))
    .all()

  // Security: exclude private skills from other orgs unless explicitly shared with us
  const accessibleSkills = skills.filter(s =>
    s.orgId === orgId ||
    s.visibility === 'public' ||
    (s.visibility === 'shared' && sharedWithOrg.has(s.id))
  )

  const candidates = skillMatches
    .map((m) => {
      const skill = accessibleSkills.find((s) => s.id === m.id)
      if (!skill) return null
      return { skill: skill as unknown as import('@skillmesh/shared').Skill, score: m.score }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.score - a.score)

  const topMatch = candidates[0]
  if (!topMatch || topMatch.score < threshold) {
    return c.json<ResolveSkillResponse>({ found: false, topCandidates: candidates })
  }

  // RAG: for paid plans, retrieve relevant chunks from the matched skill's assets
  let ragContext: Array<{ content: string; chunkIndex: number; fileName: string; score: number }> | undefined

  if (isPaid && c.env.VECTORIZE_768) {
    try {
      // Query the 768-dim index filtering to chunks of this specific skill
      const chunkMatches = await c.env.VECTORIZE_768.query(queryVector, {
        topK: 6,
        filter: { skillId: topMatch.skill.id, type: 'chunk' },
        returnMetadata: 'all',
      })

      if (chunkMatches.matches.length > 0) {
        const chunkIds = chunkMatches.matches
          .filter(m => m.score >= 0.75)
          .map(m => m.id.replace('chunk_', ''))

        if (chunkIds.length > 0) {
          const chunks = await db.select({
            id: schema.skillChunks.id,
            content: schema.skillChunks.content,
            chunkIndex: schema.skillChunks.chunkIndex,
            assetId: schema.skillChunks.assetId,
          }).from(schema.skillChunks)
            .where(inArray(schema.skillChunks.id, chunkIds))
            .all()

          // Get asset file names
          const assetIds = [...new Set(chunks.map(c => c.assetId))]
          const assetRows = await db.select({ id: schema.skillAssets.id, fileName: schema.skillAssets.fileName })
            .from(schema.skillAssets)
            .where(inArray(schema.skillAssets.id, assetIds))
            .all()
          const assetMap = Object.fromEntries(assetRows.map(a => [a.id, a.fileName]))

          ragContext = chunks.map(chunk => ({
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            fileName: assetMap[chunk.assetId] ?? 'unknown',
            score: chunkMatches.matches.find(m => m.id === `chunk_${chunk.id}`)?.score ?? 0,
          })).sort((a, b) => b.score - a.score)
        }
      }
    } catch {
      // RAG is best-effort — don't fail the resolve if chunk search fails
    }
  }

  return c.json<ResolveSkillResponse>({
    found: true,
    match: topMatch,
    topCandidates: candidates.slice(1),
    ...(ragContext && ragContext.length > 0 ? { ragContext } : {}),
  })
})

export default resolve
