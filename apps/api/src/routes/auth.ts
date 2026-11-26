import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { API_KEY_PREFIX, DEFAULT_APPROVAL_THRESHOLD, EMBEDDING_DIM_FREE } from '@skillmesh/shared'

type AuthEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    GITHUB_CLIENT_ID: string
    GITHUB_CLIENT_SECRET: string
    GITHUB_CALLBACK_URL: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    GOOGLE_CALLBACK_URL: string
    DASHBOARD_URL: string
    SESSION_SECRET: string
  }
}

const ALLOWED_DASHBOARD_ORIGINS = ['https://raxteam.com', 'https://app.raxteam.com', 'https://skillmesh-dashboard.pages.dev']

const auth = new Hono<AuthEnv>()

// Store apiKey in KV under a one-time code (60s TTL), return just the code
async function issueCode(kv: KVNamespace, apiKey: string): Promise<string> {
  const code = crypto.randomUUID().replace(/-/g, '')
  await kv.put(`auth:code:${code}`, apiKey, { expirationTtl: 60 })
  return code
}

const STATE_TTL_MS = 900_000 // 15 minutes

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// Builds a self-verifying HMAC-signed state — no KV write needed.
// Uses URL-safe base64 (no +//) so the value survives URL query param encoding round-trips.
async function buildState(secret: string, invite: string): Promise<string> {
  const payload = JSON.stringify({ invite, ts: Date.now() })
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return btoa(`${sigHex}.${payload}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// Verifies HMAC signature and checks the state hasn't expired.
async function consumeNonce(secret: string, state: string): Promise<{ valid: boolean; invite: string }> {
  try {
    // Restore URL-safe base64 back to standard base64 before decoding
    const padded = state.replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(padded + '=='.slice(0, (4 - padded.length % 4) % 4))
    const dotIdx = raw.indexOf('.')
    if (dotIdx === -1) return { valid: false, invite: '' }
    const sigHex = raw.slice(0, dotIdx)
    const payload = raw.slice(dotIdx + 1)
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map(h => parseInt(h, 16)))
    const key = await hmacKey(secret)
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
    if (!valid) return { valid: false, invite: '' }
    const { invite, ts } = JSON.parse(payload)
    if (Date.now() - ts > STATE_TTL_MS) return { valid: false, invite: '' }
    return { valid: true, invite: invite ?? '' }
  } catch {
    return { valid: false, invite: '' }
  }
}

// ── GitHub OAuth ─────────────────────────────────────────────────────────────

auth.get('/github', async (c) => {
  const invite = c.req.query('invite') ?? ''
  const state = await buildState(c.env.SESSION_SECRET, invite)
  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    scope: 'user:email',
    redirect_uri: c.env.GITHUB_CALLBACK_URL,
    state,
  })
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

auth.get('/github/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'Missing code', code: 'BAD_REQUEST' }, 400)

  // FIX #6: verify CSRF nonce
  const state = c.req.query('state') ?? ''
  const { valid, invite: inviteToken } = await consumeNonce(c.env.SESSION_SECRET, state)
  if (!valid) return c.json({ error: 'Invalid or expired OAuth state', code: 'BAD_REQUEST' }, 400)

  const dashboardUrl = (c.env.DASHBOARD_URL ?? '').replace(/\/$/, '')
  if (!ALLOWED_DASHBOARD_ORIGINS.some(o => dashboardUrl.startsWith(o))) {
    return c.redirect(`https://raxteam.com/login?error=${encodeURIComponent('Login configuration error. Please contact support.')}`)
  }

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  })
  const tokenData = await tokenRes.json<{ access_token?: string; error?: string }>()
  if (!tokenData.access_token) return c.json({ error: 'GitHub OAuth failed', code: 'OAUTH_ERROR' }, 400)

  const ghUserRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'SkillMesh' },
  })
  const ghUser = await ghUserRes.json<{ id: number; login: string; email?: string; name?: string }>()

  const emailRes = await fetch('https://api.github.com/user/emails', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'SkillMesh' },
  })
  const emails = await emailRes.json<Array<{ email: string; primary: boolean }>>()
  const primaryEmail = emails.find((e) => e.primary)?.email ?? ghUser.email ?? `${ghUser.login}@github.local`

  const db = createDb(c.env.DB)
  const now = Date.now()

  async function redirectWithCode(apiKey: string) {
    const authCode = await issueCode(c.env.KV, apiKey)
    return c.redirect(`${dashboardUrl}/auth/callback?code=${authCode}`)
  }

  // Returning user
  let user = await db.select().from(schema.users).where(eq(schema.users.githubId, String(ghUser.id))).get()
  if (user) {
    await db.update(schema.users).set({ lastActiveAt: now }).where(eq(schema.users.id, user.id))
    return redirectWithCode(user.apiKey)
  }

  // New user with invite
  if (inviteToken) {
    const invite = await db.select().from(schema.invites).where(eq(schema.invites.token, inviteToken)).get()
    if (invite && !invite.acceptedAt && invite.expiresAt > now) {
      const apiKey = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`
      const userId = crypto.randomUUID()
      await db.insert(schema.users).values({
        id: userId, email: primaryEmail, name: ghUser.name ?? ghUser.login,
        orgId: invite.orgId, role: invite.role, apiKey,
        githubId: String(ghUser.id), lastActiveAt: now,
      })
      await db.update(schema.invites).set({ acceptedAt: now }).where(eq(schema.invites.token, inviteToken))
      return redirectWithCode(apiKey)
    }
  }

  // New user — create personal org
  const orgSlug = ghUser.login.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  let org = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, orgSlug)).get()
  if (!org) {
    const orgId = crypto.randomUUID()
    await db.insert(schema.orgs).values({
      id: orgId, name: ghUser.login, slug: orgSlug, plan: 'free',
      settings: { approvalThreshold: DEFAULT_APPROVAL_THRESHOLD, embeddingDim: EMBEDDING_DIM_FREE },
      trialEndsAt: now + 15 * 24 * 60 * 60 * 1000,
      createdAt: now,
    })
    org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  }

  const apiKey = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`
  const userId = crypto.randomUUID()
  await db.insert(schema.users).values({
    id: userId, email: primaryEmail, name: ghUser.name ?? ghUser.login,
    orgId: org!.id, role: 'admin', apiKey,
    githubId: String(ghUser.id), lastActiveAt: now,
  })

  return redirectWithCode(apiKey)
})

// ── Google OAuth ─────────────────────────────────────────────────────────────

auth.get('/google', async (c) => {
  const invite = c.req.query('invite') ?? ''
  const state = await buildState(c.env.SESSION_SECRET, invite)
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: c.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  })
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

auth.get('/google/callback', async (c) => {
  const code = c.req.query('code')
  if (!code) return c.json({ error: 'Missing code', code: 'BAD_REQUEST' }, 400)

  // FIX #6: verify CSRF nonce
  const state = c.req.query('state') ?? ''
  const { valid, invite: inviteToken } = await consumeNonce(c.env.SESSION_SECRET, state)
  if (!valid) return c.json({ error: 'Invalid or expired OAuth state', code: 'BAD_REQUEST' }, 400)

  // FIX #7: validate redirect target
  const dashboardUrl = (c.env.DASHBOARD_URL ?? '').replace(/\/$/, '')
  if (!ALLOWED_DASHBOARD_ORIGINS.some(o => dashboardUrl.startsWith(o))) {
    return c.redirect(`https://raxteam.com/login?error=${encodeURIComponent('Login configuration error. Please contact support.')}`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: c.env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json<{ access_token?: string; error?: string }>()
  if (!tokenData.access_token) return c.json({ error: 'Google OAuth failed', code: 'OAUTH_ERROR' }, 400)

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const gUser = await userRes.json<{ id: string; email: string; name?: string }>()
  if (!gUser.id || !gUser.email) return c.json({ error: 'Failed to fetch Google user', code: 'OAUTH_ERROR' }, 400)

  const db = createDb(c.env.DB)
  const now = Date.now()

  async function redirectWithCode(apiKey: string) {
    const authCode = await issueCode(c.env.KV, apiKey)
    return c.redirect(`${dashboardUrl}/auth/callback?code=${authCode}`)
  }

  // Returning user — match by googleId only (not email to prevent takeover)
  const user = await db.select().from(schema.users).where(eq(schema.users.googleId, gUser.id)).get()
  if (user) {
    await db.update(schema.users).set({ lastActiveAt: now }).where(eq(schema.users.id, user.id))
    return redirectWithCode(user.apiKey)
  }

  // If an account exists with this email (e.g. signed up via GitHub), auto-link Google and sign in
  const emailMatch = await db.select().from(schema.users).where(eq(schema.users.email, gUser.email)).get()
  if (emailMatch) {
    await db.update(schema.users)
      .set({ googleId: gUser.id, lastActiveAt: now })
      .where(eq(schema.users.id, emailMatch.id))
    return redirectWithCode(emailMatch.apiKey)
  }

  // New user with invite
  if (inviteToken) {
    const invite = await db.select().from(schema.invites).where(eq(schema.invites.token, inviteToken)).get()
    if (invite && !invite.acceptedAt && invite.expiresAt > now) {
      const apiKey = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`
      const userId = crypto.randomUUID()
      await db.insert(schema.users).values({
        id: userId, email: gUser.email, name: gUser.name ?? gUser.email,
        orgId: invite.orgId, role: invite.role, apiKey,
        googleId: gUser.id, lastActiveAt: now,
      })
      await db.update(schema.invites).set({ acceptedAt: now }).where(eq(schema.invites.token, inviteToken))
      return redirectWithCode(apiKey)
    }
  }

  // New user — create personal org
  const baseSlug = gUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9-]/g, '-')
  let org = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, baseSlug)).get()
  if (!org) {
    const orgId = crypto.randomUUID()
    await db.insert(schema.orgs).values({
      id: orgId, name: gUser.name ?? baseSlug, slug: baseSlug, plan: 'free',
      settings: { approvalThreshold: DEFAULT_APPROVAL_THRESHOLD, embeddingDim: EMBEDDING_DIM_FREE },
      trialEndsAt: now + 15 * 24 * 60 * 60 * 1000,
      createdAt: now,
    })
    org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  }

  const apiKey = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, '')}`
  const userId = crypto.randomUUID()
  await db.insert(schema.users).values({
    id: userId, email: gUser.email, name: gUser.name ?? baseSlug,
    orgId: org!.id, role: 'admin', apiKey,
    googleId: gUser.id, lastActiveAt: now,
  })

  return redirectWithCode(apiKey)
})

// POST /auth/exchange — dashboard calls this to swap one-time code for apiKey
auth.post('/exchange', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  const rlKey = `rl:exchange:${ip}:${Math.floor(Date.now() / 60000)}`
  const attempts = parseInt((await c.env.KV.get(rlKey)) ?? '0')
  if (attempts >= 10) return c.json({ error: 'Too many requests', code: 'RATE_LIMITED' }, 429)
  await c.env.KV.put(rlKey, String(attempts + 1), { expirationTtl: 120 })
  const { code } = await c.req.json<{ code: string }>()
  if (!code) return c.json({ error: 'Missing code', code: 'BAD_REQUEST' }, 400)

  const apiKey = await c.env.KV.get(`auth:code:${code}`)
  if (!apiKey) return c.json({ error: 'Invalid or expired code', code: 'UNAUTHORIZED' }, 401)

  await c.env.KV.delete(`auth:code:${code}`)

  const db = createDb(c.env.DB)
  const user = await db.select().from(schema.users).where(eq(schema.users.apiKey, apiKey)).get()
  if (!user) return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, user.orgId)).get()

  // FIX #20: strip apiKey from the user object — client already gets it at top-level
  const { apiKey: _stripped, githubId: _gh, googleId: _g, ...safeUser } = user

  return c.json({ apiKey, user: safeUser, org })
})

export default auth
