import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'

type BillingEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    RAZORPAY_KEY_ID: string
    RAZORPAY_KEY_SECRET: string
    RAZORPAY_PLAN_PRO_MONTHLY: string
    RAZORPAY_PLAN_PRO_ANNUAL: string
    RAZORPAY_WEBHOOK_SECRET: string
    DASHBOARD_URL: string
  }
  Variables: { userId: string; orgId: string; role: string }
}

const billing = new Hono<BillingEnv>()

// ── Razorpay helpers ────────────────────────────────────────────────────────

function rzpAuth(keyId: string, keySecret: string) {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

function rzpPost(path: string, keyId: string, keySecret: string, body: Record<string, unknown>) {
  return fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: rzpAuth(keyId, keySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then(r => r.json()) as Promise<Record<string, unknown>>
}

// Constant-time string comparison to prevent timing attacks
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false
  const ka = await crypto.subtle.importKey('raw', new TextEncoder().encode('cmp'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', ka, new TextEncoder().encode(a)),
    crypto.subtle.sign('HMAC', ka, new TextEncoder().encode(b)),
  ])
  const ua = new Uint8Array(sa), ub = new Uint8Array(sb)
  let diff = 0
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i]
  return diff === 0
}

// Verify Razorpay payment signature: HMAC-SHA256(key_secret, order_id + "|" + payment_id)
async function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const payload = `${orderId}|${paymentId}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature)
}

// Verify Razorpay webhook signature: HMAC-SHA256(webhook_secret, raw_body)
async function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature)
}

// ── Routes ──────────────────────────────────────────────────────────────────

// POST /billing/order — create Razorpay order for pro plan upgrade
billing.post('/order', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan !== 'free') return c.json({ error: 'Already on a paid plan', code: 'BAD_REQUEST' }, 400)

  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Payment not configured', code: 'UNAVAILABLE' }, 503)
  }

  const body = await c.req.json<{ plan: string }>()
  const plan = body.plan === 'pro_annual' ? 'pro_annual' : 'pro_monthly'

  const amountPaise = plan === 'pro_annual' ? 2399900 : 299900
  const durationDays = plan === 'pro_annual' ? 365 : 30

  const order = await rzpPost('/orders', c.env.RAZORPAY_KEY_ID, c.env.RAZORPAY_KEY_SECRET, {
    amount: amountPaise,
    currency: 'INR',
    receipt: `upgrade_${org.id.slice(0, 10)}_${Date.now()}`,
    notes: { orgId: org.id, plan, durationDays: String(durationDays) },
  })

  if (order.error) {
    const err = order.error as Record<string, string>
    return c.json({ error: err.description ?? 'Razorpay error', code: 'PAYMENT_ERROR' }, 502)
  }

  // FIX #3: store order→org binding in KV to prevent cross-org replay
  await c.env.KV.put(`billing:order:${order.id}`, c.get('orgId'), { expirationTtl: 3600 })

  const user = await db.select().from(schema.users).where(eq(schema.users.id, c.get('userId'))).get()

  return c.json({
    orderId: order.id as string,
    amount: amountPaise,
    currency: 'INR',
    keyId: c.env.RAZORPAY_KEY_ID,
    plan,
    prefill: { name: user?.name ?? org.name, email: user?.email ?? '' },
  })
})

// POST /billing/verify — verify payment after Razorpay popup success, upgrade plan
billing.post('/verify', authMiddleware, async (c) => {
  const body = await c.req.json<{
    razorpay_payment_id: string
    razorpay_order_id: string
    razorpay_signature: string
    plan: string
  }>()
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return c.json({ error: 'Missing payment proof', code: 'BAD_REQUEST' }, 400)
  }

  // FIX #3: verify order was created by this org, prevent cross-org replay
  const expectedOrgId = await c.env.KV.get(`billing:order:${razorpay_order_id}`)
  if (!expectedOrgId || expectedOrgId !== c.get('orgId')) {
    return c.json({ error: 'Order not associated with your account', code: 'FORBIDDEN' }, 403)
  }

  // FIX #3: prevent replay — delete binding immediately
  await c.env.KV.delete(`billing:order:${razorpay_order_id}`)

  // FIX #1: constant-time HMAC comparison
  const valid = await verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, c.env.RAZORPAY_KEY_SECRET)
  if (!valid) return c.json({ error: 'Invalid payment signature', code: 'FORBIDDEN' }, 403)

  const plan = body.plan === 'pro_annual' ? 'pro_annual' : 'pro_monthly'
  const durationDays = plan === 'pro_annual' ? 365 : 30
  const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000

  const db = createDb(c.env.DB)
  await db.update(schema.orgs)
    .set({
      plan: 'pro',
      stripeCustomerId: razorpay_payment_id,
      stripeSubscriptionId: razorpay_order_id,
    })
    .where(eq(schema.orgs.id, c.get('orgId')))

  return c.json({ ok: true, plan: 'pro', expiresAt })
})

// POST /billing/webhook — Razorpay webhook handler
billing.post('/webhook', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('x-razorpay-signature') ?? ''

  // FIX #2: webhook secret is mandatory — never skip verification
  if (!c.env.RAZORPAY_WEBHOOK_SECRET) {
    return c.json({ error: 'Webhook not configured' }, 503)
  }

  // FIX #1: constant-time HMAC comparison
  const valid = await verifyWebhookSignature(body, sig, c.env.RAZORPAY_WEBHOOK_SECRET)
  if (!valid) return c.json({ error: 'Invalid signature' }, 400)

  const event = JSON.parse(body) as { event: string; payload: Record<string, unknown> }
  const db = createDb(c.env.DB)

  if (event.event === 'payment.captured') {
    const payment = (event.payload.payment as { entity: Record<string, unknown> }).entity
    const notes = payment.notes as Record<string, string>
    const orderId = payment.order_id as string

    if (notes?.orgId && notes?.plan) {
      const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, notes.orgId)).get()
      if (org && org.plan === 'free') {
        await db.update(schema.orgs)
          .set({ plan: 'pro', stripeCustomerId: payment.id as string, stripeSubscriptionId: orderId })
          .where(eq(schema.orgs.id, notes.orgId))
      }
    }
  }

  if (event.event === 'subscription.cancelled') {
    const sub = (event.payload.subscription as { entity: { notes?: Record<string, string> } }).entity
    const orgId = sub.notes?.orgId
    if (orgId) {
      await db.update(schema.orgs)
        .set({ plan: 'free', stripeSubscriptionId: null })
        .where(eq(schema.orgs.id, orgId))
    }
  }

  return c.json({ received: true })
})

// GET /billing/status — current billing info
billing.get('/status', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select({
    plan: schema.orgs.plan,
    stripeCustomerId: schema.orgs.stripeCustomerId,
    stripeSubscriptionId: schema.orgs.stripeSubscriptionId,
  }).from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()

  if (!org) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  return c.json({ plan: org.plan, hasPayment: !!org.stripeCustomerId, renewsAt: null })
})

// POST /billing/start-trial — start 15-day free trial (free plan orgs only, once)
billing.post('/start-trial', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (org.plan !== 'free') return c.json({ error: 'Already on a paid plan' }, 400)
  if (org.trialEndsAt) return c.json({ error: 'Trial already used' }, 400)
  const trialEndsAt = Date.now() + 15 * 24 * 60 * 60 * 1000
  await db.update(schema.orgs).set({ trialEndsAt }).where(eq(schema.orgs.id, org.id))
  return c.json({ ok: true, trialEndsAt })
})

export default billing
