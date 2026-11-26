import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

type PgEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    AI: Ai
  }
  Variables: { userId: string; orgId: string; role: string }
}

const FREE_LIMIT = 5
const PRO_LIMIT = 50
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

const playground = new Hono<PgEnv>()

// POST /playground/run
playground.post('/run', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select({ plan: schema.orgs.plan })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, c.get('orgId')))
    .get()

  const isPro = org?.plan !== 'free'
  const limit = isPro ? PRO_LIMIT : FREE_LIMIT

  const userId = c.get('userId')
  const today = new Date().toISOString().slice(0, 10)
  const kvKey = `rate:pg:${userId}:${today}`

  const raw = await c.env.KV.get(kvKey)
  const used = raw ? parseInt(raw, 10) : 0

  if (used >= limit) {
    return c.json({
      error: isPro
        ? `Daily limit of ${PRO_LIMIT} free requests reached. Try again tomorrow.`
        : `You've used all ${FREE_LIMIT} free requests for today. Upgrade to Pro for ${PRO_LIMIT}/day.`,
      code: 'RATE_LIMIT',
      requestsUsed: used,
      requestsRemaining: 0,
      limit,
    }, 429)
  }

  const body = await c.req.json<{ prompt: string }>()
  if (!body.prompt?.trim()) return c.json({ error: 'prompt is required' }, 400)
  if (body.prompt.length > 8000) return c.json({ error: 'Prompt too long (max 8000 chars)' }, 400)

  let reply = ''
  try {
    const res = await c.env.AI.run(MODEL as Parameters<typeof c.env.AI.run>[0], {
      messages: [{ role: 'user', content: body.prompt }],
    } as never) as { response?: string }
    reply = res?.response ?? ''
  } catch (e: unknown) {
    return c.json({ error: 'AI call failed: ' + (e as Error).message }, 502)
  }

  if (!reply) return c.json({ error: 'No response from AI' }, 502)

  const newUsed = used + 1
  // TTL: seconds until end of UTC day
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  const ttl = Math.ceil((midnight.getTime() - now.getTime()) / 1000)
  await c.env.KV.put(kvKey, String(newUsed), { expirationTtl: ttl })

  return c.json({
    reply,
    model: MODEL,
    requestsUsed: newUsed,
    requestsRemaining: limit - newUsed,
    limit,
  })
})

// GET /playground/usage — check remaining requests without running
playground.get('/usage', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select({ plan: schema.orgs.plan })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, c.get('orgId')))
    .get()

  const isPro = org?.plan !== 'free'
  const limit = isPro ? PRO_LIMIT : FREE_LIMIT

  const userId = c.get('userId')
  const today = new Date().toISOString().slice(0, 10)
  const kvKey = `rate:pg:${userId}:${today}`

  const raw = await c.env.KV.get(kvKey)
  const used = raw ? parseInt(raw, 10) : 0

  return c.json({ requestsUsed: used, requestsRemaining: limit - used, limit, isPro })
})

export default playground
