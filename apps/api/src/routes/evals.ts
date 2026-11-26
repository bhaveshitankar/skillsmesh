import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

type Env = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

const evals = new Hono<Env>()
evals.use('*', authMiddleware)

// Render a prompt template by substituting {{var}} placeholders
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// Fuzzy pass check — rendered output contains expected (case-insensitive substring)
// Score: exact=1.0, contains=0.7, else 0.0
function scoreOutput(rendered: string, expected: string): { passed: boolean; score: number } {
  const r = rendered.toLowerCase()
  const e = expected.toLowerCase()
  if (r === e) return { passed: true, score: 1.0 }
  if (r.includes(e) || e.includes(r)) return { passed: true, score: 0.7 }
  // Word overlap ratio
  const rWords = new Set(r.split(/\s+/))
  const eWords = e.split(/\s+/)
  const overlap = eWords.filter(w => rWords.has(w)).length
  const score = eWords.length > 0 ? overlap / eWords.length : 0
  return { passed: score >= 0.5, score: Math.round(score * 100) / 100 }
}

// GET /skills/:id/evals — list test cases with latest run result per case
evals.get('/:id/evals', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const cases = await db.select().from(schema.skillTestCases)
    .where(eq(schema.skillTestCases.skillId, skill.id))
    .orderBy(desc(schema.skillTestCases.createdAt))
    .all()

  // Latest run for each test case — limit to recent 100 to avoid unbounded read
  const runs = await db.select().from(schema.skillEvalRuns)
    .where(eq(schema.skillEvalRuns.skillId, skill.id))
    .orderBy(desc(schema.skillEvalRuns.ranAt))
    .limit(100)
    .all()

  const latestRun = new Map<string, typeof runs[0]>()
  for (const r of runs) {
    if (!latestRun.has(r.testCaseId)) latestRun.set(r.testCaseId, r)
  }

  return c.json({
    cases: cases.map(tc => ({ ...tc, lastRun: latestRun.get(tc.id) ?? null })),
    skillVersion: skill.version,
  })
})

// POST /skills/:id/evals — create a test case
evals.post('/:id/evals', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{
    description?: string
    inputVars?: Record<string, string>
    expectedOutput: string
  }>().catch(() => null)

  if (!body?.expectedOutput?.trim())
    return c.json({ error: 'expectedOutput is required' }, 400)

  const id = crypto.randomUUID()
  const tc = {
    id,
    skillId: skill.id,
    description: (body.description ?? '').slice(0, 500),
    inputVars: body.inputVars ?? {},
    expectedOutput: body.expectedOutput.slice(0, 10000),
    createdAt: Date.now(),
  }
  await db.insert(schema.skillTestCases).values(tc)
  return c.json(tc, 201)
})

// PATCH /skills/:id/evals/:caseId — update a test case
evals.patch('/:id/evals/:caseId', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const tc = await db.select().from(schema.skillTestCases)
    .where(and(eq(schema.skillTestCases.id, c.req.param('caseId')), eq(schema.skillTestCases.skillId, skill.id)))
    .get()
  if (!tc) return c.json({ error: 'Test case not found' }, 404)

  const body = await c.req.json<Partial<{ description: string; inputVars: Record<string, string>; expectedOutput: string }>>()
    .catch(() => ({} as Partial<{ description: string; inputVars: Record<string, string>; expectedOutput: string }>))

  const updates: Partial<typeof tc> = {}
  if (body.description !== undefined) updates.description = body.description.slice(0, 500)
  if (body.inputVars !== undefined) updates.inputVars = body.inputVars
  if (body.expectedOutput !== undefined) updates.expectedOutput = body.expectedOutput.slice(0, 10000)

  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400)
  await db.update(schema.skillTestCases).set(updates).where(eq(schema.skillTestCases.id, tc.id))
  return c.json({ ok: true })
})

// DELETE /skills/:id/evals/:caseId
evals.delete('/:id/evals/:caseId', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  await db.delete(schema.skillTestCases)
    .where(and(eq(schema.skillTestCases.id, c.req.param('caseId')), eq(schema.skillTestCases.skillId, skill.id)))
  await db.delete(schema.skillEvalRuns)
    .where(eq(schema.skillEvalRuns.testCaseId, c.req.param('caseId')))

  return c.json({ ok: true })
})

// POST /skills/:id/evals/run — run all test cases against current skill template
evals.post('/:id/evals/run', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const cases = await db.select().from(schema.skillTestCases)
    .where(eq(schema.skillTestCases.skillId, skill.id))
    .all()

  if (cases.length === 0) return c.json({ results: [], passed: 0, total: 0 })

  const now = Date.now()
  const results = await Promise.all(cases.map(async (tc) => {
    const rendered = renderTemplate(skill.promptTemplate, tc.inputVars as Record<string, string>)
    const { passed, score } = scoreOutput(rendered, tc.expectedOutput)
    const run = {
      id: crypto.randomUUID(),
      skillId: skill.id,
      testCaseId: tc.id,
      skillVersion: skill.version,
      rendered,
      passed,
      score,
      ranAt: now,
    }
    await db.insert(schema.skillEvalRuns).values(run)
    return { ...run, description: tc.description }
  }))

  const passed = results.filter(r => r.passed).length
  return c.json({ results, passed, total: results.length, version: skill.version })
})

// POST /skills/:id/evals/:caseId/run — run a single test case
evals.post('/:id/evals/:caseId/run', async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId'))))
    .get()
  if (!skill) return c.json({ error: 'Not found' }, 404)

  const tc = await db.select().from(schema.skillTestCases)
    .where(and(eq(schema.skillTestCases.id, c.req.param('caseId')), eq(schema.skillTestCases.skillId, skill.id)))
    .get()
  if (!tc) return c.json({ error: 'Test case not found' }, 404)

  const rendered = renderTemplate(skill.promptTemplate, tc.inputVars as Record<string, string>)
  const { passed, score } = scoreOutput(rendered, tc.expectedOutput)
  const run = {
    id: crypto.randomUUID(),
    skillId: skill.id,
    testCaseId: tc.id,
    skillVersion: skill.version,
    rendered,
    passed,
    score,
    ranAt: Date.now(),
  }
  await db.insert(schema.skillEvalRuns).values(run)
  return c.json(run)
})

export default evals
