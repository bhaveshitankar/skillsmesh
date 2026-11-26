import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, desc, sql } from 'drizzle-orm'
import { assignSlugs, publicSkill } from '../lib/seo-slug'

type PublicEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    RAZORPAY_KEY_ID: string
    RAZORPAY_KEY_SECRET: string
    RESEND_API_KEY: string
  }
}

const pub = new Hono<PublicEnv>()

// ── IP rate limiter helper ───────────────────────────────────────────────────
async function checkRateLimit(kv: KVNamespace, ip: string, limit: number, windowSecs: number): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `rl:p:${ip}:${Math.floor(Date.now() / (windowSecs * 1000))}`
  const current = parseInt((await kv.get(key)) ?? '0')
  if (current >= limit) {
    return { allowed: false, remaining: 0, resetIn: windowSecs - (Date.now() / 1000 % windowSecs) }
  }
  await kv.put(key, String(current + 1), { expirationTtl: windowSecs * 2 })
  return { allowed: true, remaining: limit - current - 1, resetIn: windowSecs - (Date.now() / 1000 % windowSecs) }
}

// ── Injection guard ──────────────────────────────────────────────────────────
// FIX #17: expanded pattern list
const INJECTION_PATTERNS = [
  /ignore (all |previous |prior |above )?instructions/i,
  /disregard (all |previous |prior |above )?instructions/i,
  /forget (all |previous |prior |above )?instructions/i,
  /override (all |previous |prior |above )?instructions/i,
  /you are now/i,
  /you must now/i,
  /act as (a |an )?/i,
  /pretend (you are|to be)/i,
  /roleplay as/i,
  /jailbreak/i,
  /prompt injection/i,
  /system prompt/i,
  /new instructions/i,
  /<\/?[a-z][\s\S]*>/i,  // HTML/XML tags — potential template injection
]
function hasInjection(text: string): boolean {
  return INJECTION_PATTERNS.some(p => p.test(text))
}

// GET /public/p?q=wish+happy+birthday — open rate-limited skill lookup, no auth required
// 10 requests per minute per IP, public approved skills only
pub.get('/p', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q || q.length < 2) {
    return c.json({ error: 'q parameter required (min 2 chars)', docs: 'https://api.raxteam.com/openapi.json' }, 400)
  }
  if (q.length > 200) {
    return c.json({ error: 'q must be under 200 characters' }, 400)
  }

  // Rate limit: 10/min per IP
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed, remaining, resetIn } = await checkRateLimit(c.env.KV, ip, 10, 60)
  if (!allowed) {
    return c.json(
      { error: 'Rate limit exceeded. 10 requests per minute allowed.', resetInSeconds: Math.ceil(resetIn) },
      429,
      {
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '0',
        'Retry-After': String(Math.ceil(resetIn)),
      }
    )
  }

  const db = createDb(c.env.DB)
  const lower = q.toLowerCase()

  // Fetch all public approved skills and score them by trigger/name/description match
  const skills = await db
    .select({
      id: schema.skills.id,
      name: schema.skills.name,
      description: schema.skills.description,
      promptTemplate: schema.skills.promptTemplate,
      triggers: schema.skills.triggers,
      tags: schema.skills.tags,
      tokenEstimate: schema.skills.tokenEstimate,
      useCount: schema.skills.useCount,
      upvotes: schema.skills.upvotes,
    })
    .from(schema.skills)
    .where(and(eq(schema.skills.visibility, 'public'), eq(schema.skills.status, 'approved')))
    .limit(500)
    .all()

  if (skills.length === 0) {
    return c.text('No public skills available yet.', 200, { 'X-RateLimit-Remaining': String(remaining) })
  }

  // Score each skill against the query
  function score(skill: typeof skills[0]): number {
    let s = 0
    const triggers = (skill.triggers as string[]) ?? []
    const tags = (skill.tags as string[]) ?? []
    // Exact trigger match = strongest signal
    for (const t of triggers) {
      if (lower.includes(t.toLowerCase())) s += 10
      if (t.toLowerCase().includes(lower)) s += 5
    }
    // Name match
    const nameLower = skill.name.toLowerCase()
    if (lower.includes(nameLower) || nameLower.includes(lower)) s += 8
    // Word overlap on name
    const qWords = lower.split(/\s+/).filter(w => w.length > 3)
    for (const w of qWords) {
      if (nameLower.includes(w)) s += 3
      if (skill.description.toLowerCase().includes(w)) s += 1
      for (const t of tags) { if (t.toLowerCase().includes(w)) s += 2 }
    }
    // Boost by community signal
    s += Math.min((skill.upvotes ?? 0) * 0.1, 2)
    s += Math.min((skill.useCount ?? 0) * 0.01, 1)
    return s
  }

  const scored = skills
    .map(s => ({ ...s, _score: score(s) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)

  if (scored.length === 0) {
    return c.text(
      'No matching public skill found for your query. Try different keywords or browse all skills at https://raxteam.com',
      200,
      { 'X-RateLimit-Remaining': String(remaining) }
    )
  }

  const top = scored[0]

  // Safety check on the returned template
  if (hasInjection(top.promptTemplate)) {
    return c.text('Matched skill flagged for review.', 200)
  }

  // Increment use count fire-and-forget
  void db.update(schema.skills)
    .set({ useCount: sql`${schema.skills.useCount} + 1` })
    .where(eq(schema.skills.id, top.id))

  const text = `${top.name}\n${top.description}\n\n${top.promptTemplate}`

  return c.text(text, 200, {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Limit': '10',
  })
})

// ── SEO library ──────────────────────────────────────────────────────────────
async function loadLibrary(db: ReturnType<typeof createDb>) {
  const rows = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.visibility, 'public'), eq(schema.skills.status, 'approved')))
    .orderBy(desc(schema.skills.upvotes))
    .limit(1000)
    .all()
  return { rows, slugs: assignSlugs(rows) }
}

// GET /public/library — every public approved skill (no prompt body) with its SEO slug
pub.get('/library', async (c) => {
  const db = createDb(c.env.DB)
  const { rows, slugs } = await loadLibrary(db)
  const skills = rows.map(s => ({
    seoSlug: slugs.get(s.id)!,
    name: s.name,
    description: s.description,
    tags: s.tags,
    upvotes: s.upvotes,
    useCount: s.useCount,
    updatedAt: s.publishedAt ?? s.createdAt,
  }))
  return c.json({ skills }, 200, { 'Cache-Control': 'public, max-age=300' })
})

// GET /public/library/:slug — one public approved skill by SEO slug, plus related skills
pub.get('/library/:slug', async (c) => {
  const db = createDb(c.env.DB)
  const slug = c.req.param('slug').toLowerCase()
  const { rows, slugs } = await loadLibrary(db)
  const skill = rows.find(s => slugs.get(s.id) === slug)
  if (!skill) return c.json({ error: 'Skill not found' }, 404)

  const tags = new Set(skill.tags)
  const related = rows
    .filter(s => s.id !== skill.id)
    .map(s => ({ s, overlap: s.tags.filter(t => tags.has(t)).length }))
    .filter(x => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.s.upvotes - a.s.upvotes)
    .slice(0, 4)
    .map(x => ({ seoSlug: slugs.get(x.s.id)!, name: x.s.name, description: x.s.description }))

  const { orgId: _o, ...safe } = publicSkill(skill) as Record<string, unknown>
  return c.json({ skill: { ...safe, seoSlug: slug }, related }, 200, { 'Cache-Control': 'public, max-age=300' })
})

// GET /public/skills — paginated public approved skills with vote counts
pub.get('/skills', async (c) => {
  const db = createDb(c.env.DB)
  const page = parseInt(c.req.query('page') ?? '1')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '24'), 48)
  const offset = (page - 1) * limit
  const tag = c.req.query('tag')
  const search = c.req.query('search')

  let query = db
    .select()
    .from(schema.skills)
    .where(
      and(
        eq(schema.skills.visibility, 'public'),
        eq(schema.skills.status, 'approved'),
        tag ? sql`EXISTS (SELECT 1 FROM json_each(${schema.skills.tags}) WHERE value = ${tag})` : undefined,
      )
    )
    .orderBy(desc(schema.skills.upvotes))
    .limit(limit)
    .offset(offset)

  // Simple search by name/description if provided
  if (search) {
    const rows = await db
      .select()
      .from(schema.skills)
      .where(
        and(
          eq(schema.skills.visibility, 'public'),
          eq(schema.skills.status, 'approved'),
          sql`(lower(${schema.skills.name}) LIKE ${'%' + search.toLowerCase() + '%'} OR lower(${schema.skills.description}) LIKE ${'%' + search.toLowerCase() + '%'})`
        )
      )
      .orderBy(desc(schema.skills.upvotes))
      .limit(limit)
      .offset(offset)
      .all()
    return c.json({ skills: rows.map(publicSkill), page, limit })
  }

  const rows = await query.all()
  return c.json({ skills: rows.map(publicSkill), page, limit })
})

// POST /public/skills/:id/vote
pub.post('/skills/:id/vote', async (c) => {
  // FIX #15: rate limit votes — 5 per minute per IP
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkRateLimit(c.env.KV, `vote:${ip}`, 5, 60)
  if (!allowed) return c.json({ error: 'Too many votes. Try again in a minute.' }, 429)

  const db = createDb(c.env.DB)
  const skillId = c.req.param('id')
  const body = await c.req.json<{ direction: 'up' | 'down' }>()
  if (!body.direction || !['up', 'down'].includes(body.direction)) {
    return c.json({ error: 'direction must be up or down' }, 400)
  }

  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, skillId), eq(schema.skills.visibility, 'public'), eq(schema.skills.status, 'approved')))
    .get()
  if (!skill) return c.json({ error: 'Skill not found' }, 404)

  // Fingerprint voter by IP + User-Agent (no login required)
  const ua = c.req.header('User-Agent') ?? ''
  const raw = ip + ua + skillId
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  const voterId = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)

  // Check for existing vote
  const existing = await db.select().from(schema.skillVotes)
    .where(and(eq(schema.skillVotes.skillId, skillId), eq(schema.skillVotes.voterId, voterId)))
    .get()

  if (existing) {
    if (existing.direction === body.direction) {
      // Undo vote
      await db.delete(schema.skillVotes).where(eq(schema.skillVotes.id, existing.id))
      const field = body.direction === 'up' ? schema.skills.upvotes : schema.skills.downvotes
      await db.update(schema.skills).set({ [field.name]: sql`${field} - 1` }).where(eq(schema.skills.id, skillId))
      return c.json({ action: 'removed', direction: body.direction })
    } else {
      // Flip vote
      await db.update(schema.skillVotes).set({ direction: body.direction }).where(eq(schema.skillVotes.id, existing.id))
      if (body.direction === 'up') {
        await db.update(schema.skills).set({ upvotes: sql`${schema.skills.upvotes} + 1`, downvotes: sql`${schema.skills.downvotes} - 1` }).where(eq(schema.skills.id, skillId))
      } else {
        await db.update(schema.skills).set({ upvotes: sql`${schema.skills.upvotes} - 1`, downvotes: sql`${schema.skills.downvotes} + 1` }).where(eq(schema.skills.id, skillId))
      }
      return c.json({ action: 'flipped', direction: body.direction })
    }
  }

  // New vote
  await db.insert(schema.skillVotes).values({
    id: crypto.randomUUID(),
    skillId,
    voterId,
    direction: body.direction,
    createdAt: Date.now(),
  })
  const field = body.direction === 'up' ? schema.skills.upvotes : schema.skills.downvotes
  await db.update(schema.skills).set({ [field.name]: sql`${field} + 1` }).where(eq(schema.skills.id, skillId))
  return c.json({ action: 'added', direction: body.direction })
})

// ── Share link endpoints ─────────────────────────────────────────────────────

// POST /public/skills/:id/share — generate or return share token (no auth — skill owner uses their token via query param or auth)
// But share token generation requires auth, so we put it in skills routes. Here we just expose the reader.

// GET /public/s/:token — view any skill by share token, or by pub-<id> for public approved skills
pub.get('/s/:token', async (c) => {
  const db = createDb(c.env.DB)
  const token = c.req.param('token')

  // pub-<id> shortcut: any public approved skill is shareable by ID
  if (token.startsWith('pub-')) {
    const id = token.slice(4)
    const skill = await db.select().from(schema.skills)
      .where(and(eq(schema.skills.id, id), eq(schema.skills.visibility, 'public'), eq(schema.skills.status, 'approved')))
      .get()
    if (!skill) return c.json({ error: 'Skill not found or not public' }, 404)
    const { shareToken: _t, ...safe } = skill
    return c.json({ skill: safe })
  }

  const skill = await db.select().from(schema.skills).where(eq(schema.skills.shareToken, token)).get()
  if (!skill) return c.json({ error: 'Share link not found or expired' }, 404)
  const { shareToken: _t, ...safe } = skill
  // Public approved skills have a canonical /library/<seoSlug> page; share links point there.
  let seoSlug: string | undefined
  if (skill.visibility === 'public' && skill.status === 'approved') {
    seoSlug = (await loadLibrary(db)).slugs.get(skill.id)
  }
  return c.json({ skill: { ...safe, seoSlug } })
})

// PATCH /public/s/:token — collab edit (draft skills only), IP rate limited 10/min
pub.patch('/s/:token', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkRateLimit(c.env.KV, `collab:${ip}`, 10, 60)
  if (!allowed) return c.json({ error: 'Too many edits. Try again in a minute.' }, 429)

  const db = createDb(c.env.DB)
  const token = c.req.param('token')
  const skill = await db.select().from(schema.skills).where(eq(schema.skills.shareToken, token)).get()
  if (!skill) return c.json({ error: 'Share link not found' }, 404)
  if (skill.status !== 'draft') return c.json({ error: 'Collab editing is only available for draft skills' }, 403)
  // Public skills are visible to everyone, so anonymous link-edits are not allowed: sign in first.
  if (skill.visibility === 'public') return c.json({ error: 'Sign in to edit a public skill', code: 'SIGN_IN_REQUIRED' }, 401)

  const body = await c.req.json<{ name?: string; description?: string; promptTemplate?: string; tags?: string[]; triggers?: string[] }>()

  const allowed_fields: Record<string, unknown> = {}
  if (body.name?.trim()) allowed_fields.name = body.name.trim().slice(0, 120)
  if (body.description?.trim()) allowed_fields.description = body.description.trim().slice(0, 1000)
  if (body.promptTemplate?.trim()) {
    if (hasInjection(body.promptTemplate)) return c.json({ error: 'Content flagged for review' }, 400)
    allowed_fields.promptTemplate = body.promptTemplate.trim()
  }
  if (Array.isArray(body.tags)) allowed_fields.tags = body.tags.slice(0, 10).map((t: string) => t.trim()).filter(Boolean)
  if (Array.isArray(body.triggers)) allowed_fields.triggers = body.triggers.slice(0, 20).map((t: string) => t.trim()).filter(Boolean)

  if (Object.keys(allowed_fields).length === 0) return c.json({ error: 'No valid fields to update' }, 400)

  await db.update(schema.skills).set(allowed_fields).where(eq(schema.skills.shareToken, token))
  const updated = await db.select().from(schema.skills).where(eq(schema.skills.shareToken, token)).get()
  const { shareToken: _t, ...safe } = updated!
  return c.json({ skill: safe })
})

// POST /public/submit — anonymous skill submission, IP rate limited 3/hour
pub.post('/submit', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkRateLimit(c.env.KV, `anon_submit:${ip}`, 3, 3600)
  if (!allowed) return c.json({ error: 'Submission limit reached (3 per hour per IP). Sign up for unlimited submissions.' }, 429)

  const body = await c.req.json<{ name: string; description: string; promptTemplate: string; tags?: string[]; triggers?: string[] }>()
  if (!body.name?.trim() || !body.description?.trim() || !body.promptTemplate?.trim()) {
    return c.json({ error: 'name, description, and promptTemplate are required' }, 400)
  }
  if (hasInjection(body.name) || hasInjection(body.description) || hasInjection(body.promptTemplate)) {
    return c.json({ error: 'Content flagged for review' }, 400)
  }
  if (body.name.length > 120 || body.description.length > 1000 || body.promptTemplate.length > 8000) {
    return c.json({ error: 'Content exceeds max length' }, 400)
  }

  const db = createDb(c.env.DB)

  // Find or create an "anonymous" org to hold these submissions
  let anonOrg = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, '__anon__')).get()
  if (!anonOrg) {
    const orgId = crypto.randomUUID()
    await db.insert(schema.orgs).values({
      id: orgId,
      name: 'Anonymous Submissions',
      slug: '__anon__',
      plan: 'free',
      settings: { approvalThreshold: 1, embeddingDim: 384 },
      createdAt: Date.now(),
    })
    anonOrg = (await db.select().from(schema.orgs).where(eq(schema.orgs.slug, '__anon__')).get())!
  }

  // Find or create a system user for anonymous submissions
  let anonUser = await db.select().from(schema.users).where(eq(schema.users.email, 'anon@raxteam.internal')).get()
  if (!anonUser) {
    const userId = crypto.randomUUID()
    await db.insert(schema.users).values({
      id: userId,
      email: 'anon@raxteam.internal',
      name: 'Anonymous',
      orgId: anonOrg.id,
      role: 'member',
      apiKey: `sk-anon-${crypto.randomUUID().replace(/-/g, '')}`,
      lastActiveAt: Date.now(),
    })
    anonUser = (await db.select().from(schema.users).where(eq(schema.users.email, 'anon@raxteam.internal')).get())!
  }

  const id = crypto.randomUUID()
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)

  await db.insert(schema.skills).values({
    id,
    orgId: anonOrg.id,
    authorId: anonUser.id,
    name: body.name.trim(),
    slug: `${slug}-${id.slice(0, 8)}`,
    description: body.description.trim(),
    promptTemplate: body.promptTemplate.trim(),
    tags: body.tags?.slice(0, 10) ?? [],
    triggers: body.triggers?.slice(0, 10) ?? [],
    toolsRequired: [],
    visibility: 'public',
    status: 'pending',
    tokenEstimate: Math.ceil(body.promptTemplate.split(/\s+/).length * 1.3),
    avgTokenSavings: 0,
    useCount: 0,
    upvotes: 0,
    downvotes: 0,
    createdAt: Date.now(),
  })

  return c.json({ ok: true, id, message: 'Skill submitted for review. It will appear publicly after approval.' }, 201)
})

// POST /public/contact — rate limited contact form (3/hour per IP)
pub.post('/contact', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const { allowed } = await checkRateLimit(c.env.KV, `contact:${ip}`, 3, 3600)
  if (!allowed) return c.json({ error: 'Too many messages. Please try again later.' }, 429)

  const body = await c.req.json<{ name?: string; email?: string; message?: string }>().catch(() => ({ name: '', email: '', message: '' }))
  const name = body.name?.trim().slice(0, 120) ?? ''
  const email = body.email?.trim().slice(0, 200) ?? ''
  const message = body.message?.trim().slice(0, 2000) ?? ''

  if (!name || !email || !message) return c.json({ error: 'name, email and message are required' }, 400)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Invalid email address' }, 400)

  if (c.env.RESEND_API_KEY) {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'RaxTeam Contact <noreply@raxteam.com>',
        to: ['hello@raxteam.com'],
        reply_to: email,
        subject: `Contact from ${name}`,
        html: contactEmailHtml({ name, email, message }),
      }),
    })
    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('Resend error:', resendRes.status, JSON.stringify(resendErr))
      return c.json({ error: 'Failed to send message. Please try again or email us directly at hello@raxteam.com.' }, 502)
    }
  }

  return c.json({ ok: true, message: "Thanks! We'll get back to you soon." })
})

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function contactEmailHtml({ name, email, message }: { name: string; email: string; message: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>New Contact Message — RaxTeam</title>
</head>
<body style="margin:0;padding:0;background:#0a0b10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a0b10;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px">

        <!-- Logo bar -->
        <tr><td style="padding-bottom:24px;text-align:center">
          <table cellpadding="0" cellspacing="0" role="presentation" style="display:inline-table">
            <tr>
              <td style="vertical-align:middle;padding-right:10px">
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:10px;text-align:center;line-height:40px;font-size:20px;font-weight:900;color:#fff;display:inline-block">R</div>
              </td>
              <td style="vertical-align:middle">
                <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">RaxTeam</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#13141c;border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden">

          <!-- Hero strip -->
          <tr><td style="background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#1e1b4b 100%);padding:32px 40px">
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:rgba(167,139,250,0.9);letter-spacing:0.5px;text-transform:uppercase">Contact Form</p>
            <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">New message received 📬</h1>
          </td></tr>

          <!-- Body -->
          <tr><td style="padding:32px 40px">

            <!-- Sender info -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-bottom:24px;background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:12px">
              <tr>
                <td style="padding:16px 20px">
                  <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%">
                    <tr>
                      <td style="padding-bottom:10px">
                        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:rgba(167,139,250,0.7);text-transform:uppercase;letter-spacing:0.5px">From</p>
                        <p style="margin:0;font-size:15px;font-weight:700;color:#e0e7ff">${escHtml(name)}</p>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:rgba(167,139,250,0.7);text-transform:uppercase;letter-spacing:0.5px">Reply to</p>
                        <a href="mailto:${escHtml(email)}" style="font-size:14px;color:#818cf8;text-decoration:none">${escHtml(email)}</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Message -->
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.5px">Message</p>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;margin-bottom:28px">
              <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.7);line-height:1.7;white-space:pre-wrap">${escHtml(message)}</p>
            </div>

            <!-- Reply CTA -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%">
              <tr><td style="border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);text-align:center">
                <a href="mailto:${escHtml(email)}" style="display:block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">
                  Reply to ${escHtml(name)} →
                </a>
              </td></tr>
            </table>

          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:16px 40px 24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.15)">RaxTeam contact form · <a href="https://raxteam.com" style="color:#6366f1;text-decoration:none">raxteam.com</a></p>
          </td></tr>

        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export default pub

