import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, desc, count, and, sql, inArray, like, or } from 'drizzle-orm'

type AdminEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    ADMIN_SECRET: string
    RESEND_API_KEY: string
    RAZORPAY_KEY_ID: string
    RAZORPAY_KEY_SECRET: string
  }
  Variables: { adminToken: string }
}

const admin = new Hono<AdminEnv>()

// ── Helpers ──────────────────────────────────────────────────────────────────

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const fixedKey = await crypto.subtle.importKey(
    'raw', enc.encode('skillmesh-sa-cmp'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', fixedKey, enc.encode(a)),
    crypto.subtle.sign('HMAC', fixedKey, enc.encode(b)),
  ])
  const ua = new Uint8Array(ha), ub = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

async function checkAdminRateLimit(kv: KVNamespace, ip: string) {
  const lockKey = `adm:lock:${ip}`
  if (await kv.get(lockKey)) return { allowed: false }
  const attempts = parseInt((await kv.get(`adm:attempts:${ip}`)) ?? '0')
  if (attempts >= 5) {
    await kv.put(lockKey, '1', { expirationTtl: 900 })
    await kv.delete(`adm:attempts:${ip}`)
    return { allowed: false }
  }
  return { allowed: true }
}

async function recordFailedAttempt(kv: KVNamespace, ip: string) {
  const key = `adm:attempts:${ip}`
  const current = parseInt((await kv.get(key)) ?? '0')
  await kv.put(key, String(current + 1), { expirationTtl: 900 })
}

async function adminAuth(c: any, next: () => Promise<void>) {
  const token = c.req.header('Authorization')?.slice(7)
  if (!token || !token.startsWith('adm-')) return c.json({ error: 'Not found' }, 404)
  const session = await c.env.KV.get(`adm:session:${token}`)
  if (!session) return c.json({ error: 'Not found' }, 404)
  c.set('adminToken', token)
  return await next()
}

// ── Auth ─────────────────────────────────────────────────────────────────────

admin.get('/ping', (c) => {
  if (!c.env.ADMIN_SECRET) return c.json({ error: 'ADMIN_SECRET not configured' }, 503)
  return c.json({ ok: true, configured: true })
})

admin.post('/auth', async (c) => {
  if (!c.env.ADMIN_SECRET) return c.json({ error: 'Not found' }, 404)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkAdminRateLimit(c.env.KV, ip)
  if (!allowed) return c.json({ error: 'Not found' }, 404)

  const body = await c.req.json<{ secret: string }>().catch(() => ({ secret: '' }))
  const valid = await timingSafeEqual(body.secret ?? '', c.env.ADMIN_SECRET)
  if (!valid) {
    await recordFailedAttempt(c.env.KV, ip)
    return c.json({ error: 'Not found' }, 404)
  }

  await c.env.KV.delete(`adm:attempts:${ip}`)
  const token = `adm-${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`
  await c.env.KV.put(`adm:session:${token}`, '1', { expirationTtl: 8 * 3600 })
  return c.json({ token })
})

admin.post('/logout', adminAuth, async (c) => {
  await c.env.KV.delete(`adm:session:${c.get('adminToken')}`)
  return c.json({ ok: true })
})

admin.post('/unlock', async (c) => {
  if (!c.env.ADMIN_SECRET) return c.json({ error: 'Not found' }, 404)
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkAdminRateLimit(c.env.KV, ip)
  if (!allowed) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json<{ secret: string }>().catch(() => ({ secret: '' }))
  const valid = await timingSafeEqual(body.secret ?? '', c.env.ADMIN_SECRET)
  if (!valid) { await recordFailedAttempt(c.env.KV, ip); return c.json({ error: 'Not found' }, 404) }
  await c.env.KV.delete(`adm:lock:${ip}`)
  await c.env.KV.delete(`adm:attempts:${ip}`)
  return c.json({ ok: true })
})

// ── Stats ─────────────────────────────────────────────────────────────────────

admin.get('/stats', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const [[orgsTotal], [usersTotal], [skillsTotal], [pendingSkills], [publicApproved], [proOrgs]] = await Promise.all([
    db.select({ value: count() }).from(schema.orgs),
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.skills),
    db.select({ value: count() }).from(schema.skills).where(eq(schema.skills.status, 'pending')),
    db.select({ value: count() }).from(schema.skills).where(and(eq(schema.skills.status, 'approved'), eq(schema.skills.visibility, 'public'))),
    db.select({ value: count() }).from(schema.orgs).where(eq(schema.orgs.plan, 'pro')),
  ])
  return c.json({
    orgs: { total: orgsTotal.value, pro: proOrgs.value, free: orgsTotal.value - proOrgs.value },
    users: { total: usersTotal.value },
    skills: { total: skillsTotal.value, pending: pendingSkills.value, publicApproved: publicApproved.value },
  })
})

// ── Orgs ──────────────────────────────────────────────────────────────────────

admin.get('/orgs', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit
  const search = c.req.query('search')?.trim()
  const planFilter = c.req.query('plan')

  const filters: ReturnType<typeof eq>[] = []
  if (search) filters.push(or(like(schema.orgs.name, `%${search}%`), like(schema.orgs.slug, `%${search}%`)) as ReturnType<typeof eq>)
  if (planFilter && ['free', 'pro', 'enterprise'].includes(planFilter)) filters.push(eq(schema.orgs.plan, planFilter as 'free' | 'pro' | 'enterprise'))
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters as Parameters<typeof and>)

  const [orgs, [{ value: total }]] = await Promise.all([
    db.select().from(schema.orgs).where(where).orderBy(desc(schema.orgs.createdAt)).limit(limit).offset(offset).all(),
    db.select({ value: count() }).from(schema.orgs).where(where),
  ])

  // Batch counts — one query each instead of N+1
  const orgIds = orgs.map(o => o.id)
  const memberCounts = orgIds.length
    ? await db.select({ orgId: schema.users.orgId, value: count() }).from(schema.users)
        .where(inArray(schema.users.orgId, orgIds)).groupBy(schema.users.orgId).all()
    : []
  const skillCounts = orgIds.length
    ? await db.select({ orgId: schema.skills.orgId, value: count() }).from(schema.skills)
        .where(inArray(schema.skills.orgId, orgIds)).groupBy(schema.skills.orgId).all()
    : []

  const mcMap = Object.fromEntries(memberCounts.map(r => [r.orgId, r.value]))
  const scMap = Object.fromEntries(skillCounts.map(r => [r.orgId, r.value]))

  return c.json({
    orgs: orgs.map(o => ({ ...o, memberCount: mcMap[o.id] ?? 0, skillCount: scMap[o.id] ?? 0 })),
    total, page, limit,
  })
})

admin.get('/orgs/:id', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.req.param('id'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  const members = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, lastActiveAt: schema.users.lastActiveAt })
    .from(schema.users).where(eq(schema.users.orgId, org.id)).all()
  const skills = await db.select().from(schema.skills).where(eq(schema.skills.orgId, org.id)).orderBy(desc(schema.skills.createdAt)).all()
  return c.json({ org, members, skills })
})

admin.patch('/orgs/:id', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.req.param('id'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json<{ plan?: string; name?: string; approvalThreshold?: number }>()
  const updates: Record<string, unknown> = {}
  if (body.plan && ['free', 'pro', 'enterprise'].includes(body.plan)) updates.plan = body.plan
  if (body.name) updates.name = String(body.name).slice(0, 100)
  if (body.approvalThreshold !== undefined) {
    const t = Math.max(1, Math.min(20, parseInt(String(body.approvalThreshold), 10)))
    updates.settings = { ...org.settings, approvalThreshold: t }
  }
  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400)
  await db.update(schema.orgs).set(updates).where(eq(schema.orgs.id, org.id))
  return c.json({ ok: true })
})

// ── Skills ────────────────────────────────────────────────────────────────────

admin.get('/skills', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit
  const status = c.req.query('status')
  const visibility = c.req.query('visibility')
  const orgId = c.req.query('orgId')
  const search = c.req.query('search')?.trim()

  const filters: ReturnType<typeof eq>[] = []
  if (search) filters.push(or(like(schema.skills.name, `%${search}%`), like(schema.skills.description, `%${search}%`)) as ReturnType<typeof eq>)
  if (status && ['pending', 'approved', 'draft', 'deprecated'].includes(status))
    filters.push(eq(schema.skills.status, status as 'pending' | 'approved' | 'draft' | 'deprecated'))
  if (visibility && ['public', 'private', 'shared'].includes(visibility))
    filters.push(eq(schema.skills.visibility, visibility as 'public' | 'private' | 'shared'))
  if (orgId)
    filters.push(eq(schema.skills.orgId, orgId))

  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters as Parameters<typeof and>)

  const [skills, [{ value: total }]] = await Promise.all([
    db.select().from(schema.skills).where(where).orderBy(desc(schema.skills.createdAt)).limit(limit).offset(offset).all(),
    db.select({ value: count() }).from(schema.skills).where(where),
  ])

  // Batch org lookup
  const orgIds = [...new Set(skills.map(s => s.orgId))]
  const orgs = orgIds.length
    ? await db.select({ id: schema.orgs.id, name: schema.orgs.name, slug: schema.orgs.slug, plan: schema.orgs.plan })
        .from(schema.orgs).where(inArray(schema.orgs.id, orgIds)).all()
    : []
  const orgMap = Object.fromEntries(orgs.map(o => [o.id, o]))

  return c.json({ skills: skills.map(s => ({ ...s, org: orgMap[s.orgId] ?? null })), total, page, limit })
})

// Delete skills and all FK-dependent rows (D1 enforces FK constraints)
async function deleteSkillsCascade(db: ReturnType<typeof createDb>, ids: string[]) {
  if (ids.length === 0) return
  await db.delete(schema.skillEvalRuns).where(inArray(schema.skillEvalRuns.skillId, ids))
  await db.delete(schema.skillTestCases).where(inArray(schema.skillTestCases.skillId, ids))
  await db.delete(schema.skillChunks).where(inArray(schema.skillChunks.skillId, ids))
  await db.delete(schema.skillAssets).where(inArray(schema.skillAssets.skillId, ids))
  await db.delete(schema.approvals).where(inArray(schema.approvals.skillId, ids))
  await db.delete(schema.ciChecks).where(inArray(schema.ciChecks.skillId, ids))
  await db.delete(schema.skillVersions).where(inArray(schema.skillVersions.skillId, ids))
  await db.delete(schema.orgShares).where(inArray(schema.orgShares.skillId, ids))
  await db.delete(schema.skillVotes).where(inArray(schema.skillVotes.skillId, ids))
  await db.delete(schema.skillDonations).where(inArray(schema.skillDonations.skillId, ids))
  await db.delete(schema.skills).where(inArray(schema.skills.id, ids))
}

// Bulk skill operations
admin.post('/skills/bulk', adminAuth, async (c) => {
  const body = await c.req.json<{ ids: string[]; action: 'approve' | 'reject' | 'delete' | 'set_visibility'; visibility?: string }>()
  if (!Array.isArray(body.ids) || body.ids.length === 0) return c.json({ error: 'ids required' }, 400)
  if (body.ids.length > 100) return c.json({ error: 'Max 100 ids per bulk operation' }, 400)

  const db = createDb(c.env.DB)
  const ids = body.ids.map(id => String(id))

  if (body.action === 'approve') {
    await db.update(schema.skills).set({ status: 'approved', publishedAt: Date.now() }).where(inArray(schema.skills.id, ids))
    return c.json({ ok: true, affected: ids.length, action: 'approved' })
  }
  if (body.action === 'reject') {
    await db.update(schema.skills).set({ status: 'draft' }).where(inArray(schema.skills.id, ids))
    return c.json({ ok: true, affected: ids.length, action: 'rejected' })
  }
  if (body.action === 'delete') {
    await deleteSkillsCascade(db, ids)
    return c.json({ ok: true, affected: ids.length, action: 'deleted' })
  }
  if (body.action === 'set_visibility') {
    const vis = body.visibility
    if (!vis || !['public', 'private', 'shared'].includes(vis)) return c.json({ error: 'Invalid visibility' }, 400)
    await db.update(schema.skills).set({ visibility: vis as 'public' | 'private' | 'shared' }).where(inArray(schema.skills.id, ids))
    return c.json({ ok: true, affected: ids.length, action: `set_visibility:${vis}` })
  }
  return c.json({ error: 'Invalid action' }, 400)
})

admin.post('/skills/:id/approve', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Not found' }, 404)
  await db.update(schema.skills).set({ status: 'approved', publishedAt: Date.now() }).where(eq(schema.skills.id, skill.id))
  return c.json({ ok: true })
})

admin.post('/skills/:id/reject', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, c.req.param('id'))).get()
  if (!skill) return c.json({ error: 'Not found' }, 404)
  const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }))
  await db.update(schema.skills).set({ status: 'draft' }).where(eq(schema.skills.id, skill.id))
  return c.json({ ok: true, reason: body.reason ?? null })
})

admin.delete('/skills/:id', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  await deleteSkillsCascade(db, [c.req.param('id')])
  return c.json({ ok: true })
})

// ── Users ─────────────────────────────────────────────────────────────────────

admin.get('/users', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const page = Math.max(1, parseInt(c.req.query('page') ?? '1'))
  const limit = 50
  const offset = (page - 1) * limit
  const users = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name, orgId: schema.users.orgId, role: schema.users.role, lastActiveAt: schema.users.lastActiveAt })
    .from(schema.users).orderBy(desc(schema.users.lastActiveAt)).limit(limit).offset(offset).all()
  const [[{ value: total }]] = [await db.select({ value: count() }).from(schema.users)]
  return c.json({ users, total, page, limit })
})

// ── Campaigns v2 — CSV-based digital marketing ─────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n')
  if (lines.length < 1) throw new Error('Empty CSV')
  function parseLine(line: string): string[] {
    const fields: string[] = []; let current = ''; let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = '' }
      else current += ch
    }
    fields.push(current.trim())
    return fields
  }
  const headers = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim())
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  })
  return { headers, rows }
}

function mergeTpl(template: string, row: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => row[k] ?? '')
}

function extractVars(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))]
}

function csvEscape(s: string): string {
  return `"${String(s ?? '').replace(/"/g, '""')}"`
}

// POST /sa/csv/upload — parse + store CSV in KV (5-day TTL)
admin.post('/csv/upload', adminAuth, async (c) => {
  let form: FormData
  try { form = await c.req.formData() } catch { return c.json({ error: 'Expected multipart/form-data' }, 400) }
  const file = form.get('file') as File | null
  if (!file) return c.json({ error: 'file field required' }, 400)
  if (file.size > 5 * 1024 * 1024) return c.json({ error: 'CSV must be under 5 MB' }, 400)
  const text = await file.text()
  let parsed: { headers: string[]; rows: Record<string, string>[] }
  try { parsed = parseCSV(text) } catch (e) { return c.json({ error: `CSV parse error: ${(e as Error).message}` }, 400) }
  if (!parsed.headers.some(h => h.toLowerCase() === 'email')) return c.json({ error: 'CSV must have an "email" column' }, 400)
  if (parsed.rows.length === 0) return c.json({ error: 'CSV has no data rows' }, 400)
  const fileKey = `sa:csv:${crypto.randomUUID()}`
  await c.env.KV.put(fileKey, text, { expirationTtl: 5 * 24 * 3600 })
  return c.json({ fileKey, headers: parsed.headers, preview: parsed.rows.slice(0, 5), totalRows: parsed.rows.length })
})

// GET /sa/templates
admin.get('/templates', adminAuth, async (c) => {
  const { keys } = await c.env.KV.list({ prefix: 'sa:tpl:' })
  const templates = (await Promise.all(keys.map(k => c.env.KV.get(k.name, 'json')))).filter(Boolean)
  return c.json({ templates })
})

// POST /sa/templates
admin.post('/templates', adminAuth, async (c) => {
  const body = await c.req.json<{ name: string; transport: string; subject?: string; body: string }>()
  if (!body.name?.trim() || !body.body?.trim()) return c.json({ error: 'name and body required' }, 400)
  if (!['email', 'sms', 'whatsapp'].includes(body.transport)) return c.json({ error: 'transport must be email, sms, or whatsapp' }, 400)
  const id = crypto.randomUUID()
  const tpl = { id, name: body.name.trim(), transport: body.transport, subject: body.subject?.trim() ?? '', body: body.body.trim(), variables: extractVars((body.subject ?? '') + body.body), createdAt: Date.now() }
  await c.env.KV.put(`sa:tpl:${id}`, JSON.stringify(tpl))
  return c.json({ template: tpl }, 201)
})

// PUT /sa/templates/:id
admin.put('/templates/:id', adminAuth, async (c) => {
  const existing = await c.env.KV.get(`sa:tpl:${c.req.param('id')}`, 'json') as any
  if (!existing) return c.json({ error: 'Template not found' }, 404)
  const body = await c.req.json<{ name?: string; subject?: string; body?: string }>()
  const updated = { ...existing, ...(body.name && { name: body.name.trim() }), ...(body.subject !== undefined && { subject: body.subject.trim() }), ...(body.body && { body: body.body.trim() }) }
  updated.variables = extractVars((updated.subject ?? '') + updated.body)
  await c.env.KV.put(`sa:tpl:${existing.id}`, JSON.stringify(updated))
  return c.json({ template: updated })
})

// DELETE /sa/templates/:id
admin.delete('/templates/:id', adminAuth, async (c) => {
  await c.env.KV.delete(`sa:tpl:${c.req.param('id')}`)
  return c.json({ ok: true })
})

// GET /sa/campaigns
admin.get('/campaigns', adminAuth, async (c) => {
  const { keys } = await c.env.KV.list({ prefix: 'sa:cmp:' })
  const campaigns = (await Promise.all(keys.map(k => c.env.KV.get(k.name, 'json')))).filter(Boolean)
  campaigns.sort((a: any, b: any) => b.createdAt - a.createdAt)
  return c.json({ campaigns })
})

// GET /sa/campaigns/:id
admin.get('/campaigns/:id', adminAuth, async (c) => {
  const campaign = await c.env.KV.get(`sa:cmp:${c.req.param('id')}`, 'json')
  if (!campaign) return c.json({ error: 'Not found' }, 404)
  return c.json({ campaign })
})

// DELETE /sa/campaigns/:id
admin.delete('/campaigns/:id', adminAuth, async (c) => {
  const campaign = await c.env.KV.get(`sa:cmp:${c.req.param('id')}`, 'json') as any
  if (!campaign) return c.json({ error: 'Not found' }, 404)
  await Promise.all([
    c.env.KV.delete(`sa:cmp:${c.req.param('id')}`),
    campaign.csvKey ? c.env.KV.delete(campaign.csvKey).catch(() => {}) : Promise.resolve(),
    campaign.reportKey ? c.env.KV.delete(campaign.reportKey).catch(() => {}) : Promise.resolve(),
  ])
  return c.json({ ok: true })
})

// GET /sa/campaigns/:id/report — download report CSV
admin.get('/campaigns/:id/report', adminAuth, async (c) => {
  const campaign = await c.env.KV.get(`sa:cmp:${c.req.param('id')}`, 'json') as any
  if (!campaign) return c.json({ error: 'Not found' }, 404)
  if (!campaign.reportKey) return c.json({ error: 'Report not ready' }, 404)
  const csv = await c.env.KV.get(campaign.reportKey)
  if (!csv) return c.json({ error: 'Report expired (5-day retention). Re-run the campaign.' }, 404)
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="report-${campaign.name.replace(/[^a-z0-9]/gi, '-')}.csv"` } })
})

// POST /sa/campaigns — create and run campaign
admin.post('/campaigns', adminAuth, async (c) => {
  const body = await c.req.json<{ name: string; transport: string; fileKey: string; templateId?: string; subject?: string; htmlBody?: string; fromName?: string }>()
  if (!body.name?.trim()) return c.json({ error: 'name required' }, 400)
  if (!body.fileKey) return c.json({ error: 'fileKey required — upload a CSV first' }, 400)
  if (body.transport !== 'email') return c.json({ error: 'Only email transport is supported right now' }, 400)
  if (!c.env.RESEND_API_KEY) return c.json({ error: 'RESEND_API_KEY not configured' }, 500)

  const csvText = await c.env.KV.get(body.fileKey)
  if (!csvText) return c.json({ error: 'CSV not found or expired — please upload again' }, 400)

  let parsed: { headers: string[]; rows: Record<string, string>[] }
  try { parsed = parseCSV(csvText) } catch (e) { return c.json({ error: (e as Error).message }, 400) }

  // Resolve subject + body from template or direct input
  let subject = body.subject?.trim() ?? ''
  let htmlBody = body.htmlBody?.trim() ?? ''
  if (body.templateId) {
    const tpl = await c.env.KV.get(`sa:tpl:${body.templateId}`, 'json') as any
    if (!tpl) return c.json({ error: 'Template not found' }, 404)
    if (!subject) subject = tpl.subject
    if (!htmlBody) htmlBody = tpl.body
  }
  if (!subject) return c.json({ error: 'subject required for email campaigns' }, 400)
  if (!htmlBody) return c.json({ error: 'email body required' }, 400)

  const emailCol = parsed.headers.find(h => h.toLowerCase() === 'email') ?? 'email'
  const nameCol = parsed.headers.find(h => h.toLowerCase() === 'name') ?? 'name'
  const fromName = body.fromName?.trim() || 'RaxTeam'
  const campaignId = crypto.randomUUID()
  const reportKey = `sa:rpt:${campaignId}`

  // Save campaign as running
  const campaign: Record<string, unknown> = {
    id: campaignId, name: body.name.trim(), transport: 'email', status: 'running',
    subject, fromName, templateId: body.templateId ?? null,
    csvKey: body.fileKey, headers: parsed.headers,
    totalRows: parsed.rows.length, sentCount: 0, failedCount: 0,
    createdAt: Date.now(), startedAt: Date.now(), completedAt: null, reportKey,
  }
  await c.env.KV.put(`sa:cmp:${campaignId}`, JSON.stringify(campaign))

  // Send via Resend batch API (100 per batch)
  const reportRows: string[] = ['name,email,status,error']
  let sentCount = 0; let failedCount = 0
  const BATCH = 100

  for (let i = 0; i < parsed.rows.length; i += BATCH) {
    const batch = parsed.rows.slice(i, i + BATCH)
    const validEmails: typeof batch = []
    for (const row of batch) {
      const email = row[emailCol]?.trim()
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validEmails.push(row)
      else { reportRows.push([csvEscape(row[nameCol] ?? ''), csvEscape(row[emailCol] ?? ''), 'failed', 'invalid email'].join(',')); failedCount++ }
    }
    if (validEmails.length === 0) continue

    const payload = validEmails.map(row => ({
      from: `${fromName} <noreply@raxteam.com>`,
      to: [row[emailCol].trim()],
      subject: mergeTpl(subject, row),
      html: mergeTpl(htmlBody, row),
    }))

    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.env.RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      validEmails.forEach(row => { reportRows.push([csvEscape(row[nameCol] ?? ''), csvEscape(row[emailCol]), 'sent', ''].join(',')); sentCount++ })
    } else {
      const errText = (await res.text()).slice(0, 120)
      validEmails.forEach(row => { reportRows.push([csvEscape(row[nameCol] ?? ''), csvEscape(row[emailCol]), 'failed', csvEscape(errText)].join(',')); failedCount++ })
    }
  }

  // Store report (5-day TTL)
  await c.env.KV.put(reportKey, reportRows.join('\n'), { expirationTtl: 5 * 24 * 3600 })

  // Update campaign status
  campaign.status = failedCount === parsed.rows.length ? 'failed' : 'completed'
  campaign.sentCount = sentCount; campaign.failedCount = failedCount; campaign.completedAt = Date.now()
  await c.env.KV.put(`sa:cmp:${campaignId}`, JSON.stringify(campaign))

  return c.json({ ok: true, campaignId, sentCount, failedCount, totalRows: parsed.rows.length }, 201)
})

// ── Payments ──────────────────────────────────────────────────────────────────

function rzpAuth(keyId: string, keySecret: string) {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

// GET /sa/payments — list all orgs with payment info
admin.get('/payments', adminAuth, async (c) => {
  const db = createDb(c.env.DB)
  const paid = await db.select({
    id: schema.orgs.id,
    name: schema.orgs.name,
    slug: schema.orgs.slug,
    plan: schema.orgs.plan,
    paymentId: schema.orgs.stripeCustomerId,
    orderId: schema.orgs.stripeSubscriptionId,
  }).from(schema.orgs)
    .where(sql`${schema.orgs.stripeCustomerId} IS NOT NULL`)
    .orderBy(desc(schema.orgs.id))
    .all()

  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ payments: paid.map(o => ({ ...o, rzp: null })) })
  }

  // Fetch payment details from Razorpay for each paid org
  const payments = await Promise.all(paid.map(async (o) => {
    if (!o.paymentId) return { ...o, rzp: null }
    try {
      const res = await fetch(`https://api.razorpay.com/v1/payments/${o.paymentId}`, {
        headers: { Authorization: rzpAuth(c.env.RAZORPAY_KEY_ID, c.env.RAZORPAY_KEY_SECRET) },
      })
      const rzp = await res.json() as Record<string, unknown>
      return {
        ...o,
        rzp: {
          amount: rzp.amount as number,
          currency: rzp.currency as string,
          status: rzp.status as string,
          method: rzp.method as string,
          email: rzp.email as string,
          contact: rzp.contact as string,
          createdAt: rzp.created_at as number,
          refundStatus: rzp.refund_status as string | null,
          amountRefunded: rzp.amount_refunded as number,
        },
      }
    } catch {
      return { ...o, rzp: null }
    }
  }))

  return c.json({ payments })
})

// POST /sa/payments/:paymentId/refund — issue full or partial refund
admin.post('/payments/:paymentId/refund', adminAuth, async (c) => {
  const paymentId = c.req.param('paymentId')
  const body = await c.req.json<{ amount?: number; reason?: string }>()

  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured' }, 503)
  }

  const refundBody: Record<string, unknown> = {}
  if (body.amount) refundBody.amount = Math.round(body.amount)
  if (body.reason) refundBody.notes = { reason: body.reason }

  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: rzpAuth(c.env.RAZORPAY_KEY_ID, c.env.RAZORPAY_KEY_SECRET),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(refundBody),
  })
  const rzp = await res.json() as Record<string, unknown>

  if (rzp.error) {
    const err = rzp.error as Record<string, string>
    return c.json({ error: err.description ?? 'Refund failed' }, 502)
  }

  // Check if full refund — downgrade org to free
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs)
    .where(eq(schema.orgs.stripeCustomerId, paymentId)).get()

  if (org) {
    const payment = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
      headers: { Authorization: rzpAuth(c.env.RAZORPAY_KEY_ID, c.env.RAZORPAY_KEY_SECRET) },
    }).then(r => r.json()) as Record<string, unknown>

    // If fully refunded, downgrade to free
    if (payment.amount_refunded === payment.amount) {
      await db.update(schema.orgs)
        .set({ plan: 'free', stripeCustomerId: null, stripeSubscriptionId: null })
        .where(eq(schema.orgs.id, org.id))
    }
  }

  return c.json({ ok: true, refundId: rzp.id, amount: rzp.amount })
})

export default admin
