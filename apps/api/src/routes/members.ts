import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { API_KEY_PREFIX, FREE_TIER_MAX_USERS } from '@skillmesh/shared'

type MembersEnv = {
  Bindings: { DB: D1Database; RESEND_API_KEY: string; DASHBOARD_URL: string }
  Variables: { userId: string; orgId: string; role: string }
}

const members = new Hono<MembersEnv>()

// GET /members — list all members in org
members.get('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const rows = await db.select().from(schema.users).where(eq(schema.users.orgId, c.get('orgId'))).all()
  return c.json({ members: rows.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, lastActiveAt: u.lastActiveAt })) })
})

// PATCH /members/:id — change role (admin only)
members.patch('/:id', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)
  const db = createDb(c.env.DB)
  const target = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param('id'))).get()
  if (!target || target.orgId !== c.get('orgId')) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  if (target.id === c.get('userId')) return c.json({ error: 'Cannot change your own role', code: 'BAD_REQUEST' }, 400)
  const body = await c.req.json<{ role: unknown }>()
  // FIX #18: runtime validation of role value
  const VALID_ROLES = ['member', 'curator', 'admin']
  if (!VALID_ROLES.includes(String(body.role))) {
    return c.json({ error: 'Invalid role. Must be member, curator, or admin', code: 'BAD_REQUEST' }, 400)
  }
  const role = body.role as 'member' | 'curator' | 'admin'
  await db.update(schema.users).set({ role }).where(eq(schema.users.id, target.id))
  return c.json({ ok: true })
})

// DELETE /members/:id — remove from org (admin only)
members.delete('/:id', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)
  const db = createDb(c.env.DB)
  const target = await db.select().from(schema.users).where(eq(schema.users.id, c.req.param('id'))).get()
  if (!target || target.orgId !== c.get('orgId')) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)
  if (target.id === c.get('userId')) return c.json({ error: 'Cannot remove yourself', code: 'BAD_REQUEST' }, 400)
  await db.delete(schema.users).where(eq(schema.users.id, target.id))
  return c.json({ ok: true })
})

// GET /members/invites — list pending invites (admin only)
members.get('/invites', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)
  const db = createDb(c.env.DB)
  const now = Date.now()
  const rows = await db.select().from(schema.invites)
    .where(and(eq(schema.invites.orgId, c.get('orgId'))))
    .all()
  return c.json({ invites: rows.filter(i => !i.acceptedAt && i.expiresAt > now) })
})

// POST /members/invites — create invite (admin only)
members.post('/invites', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)
  const db = createDb(c.env.DB)
  const { email, role } = await c.req.json<{ email: string; role: 'member' | 'curator' | 'admin' }>()
  if (!email) return c.json({ error: 'email required', code: 'BAD_REQUEST' }, 400)

  // Enforce free tier user cap
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (org?.plan === 'free') {
    const { count } = await import('drizzle-orm')
    const [result] = await db.select({ value: count() }).from(schema.users).where(eq(schema.users.orgId, c.get('orgId')))
    if (result.value >= FREE_TIER_MAX_USERS) {
      return c.json({ error: `Free tier limit: ${FREE_TIER_MAX_USERS} members per org. Upgrade to Pro for unlimited seats.`, code: 'PLAN_LIMIT' }, 402)
    }
  }

  const token = `inv-${crypto.randomUUID().replace(/-/g, '')}`
  await db.insert(schema.invites).values({
    id: crypto.randomUUID(),
    orgId: c.get('orgId'),
    email,
    role: role ?? 'member',
    token,
    invitedBy: c.get('userId'),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    acceptedAt: null,
  })

  const dashboardUrl = (c.env.DASHBOARD_URL ?? '').replace(/\/$/, '')
  const inviteUrl = `${dashboardUrl}/join?token=${token}`

  // Look up inviter name for the email (org already fetched above)
  const inviter = await db.select().from(schema.users).where(eq(schema.users.id, c.get('userId'))).get()

  if (c.env.RESEND_API_KEY) {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'RaxTeam <noreply@raxteam.com>',
        to: [email],
        subject: `You've been invited to join ${org?.name ?? 'an organization'} on RaxTeam`,
        html: inviteEmailHtml({
          orgName: org?.name ?? 'the team',
          inviterName: inviter?.name ?? 'A team admin',
          role,
          inviteUrl,
        }),
      }),
    })
    if (!resendRes.ok) {
      const resendErr = await resendRes.json().catch(() => ({}))
      console.error('Resend invite error:', resendRes.status, JSON.stringify(resendErr))
      // Still return the invite URL — user can share it manually
      return c.json({ token, inviteUrl, emailWarning: 'Invite created but email delivery failed. Share the link manually.' }, 201)
    }
  }

  return c.json({ token, inviteUrl }, 201)
})

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function inviteEmailHtml({ orgName, inviterName, role, inviteUrl }: {
  orgName: string
  inviterName: string
  role: string
  inviteUrl: string
}): string {
  const safeOrg = escHtml(orgName)
  const safeInviter = escHtml(inviterName)
  const safeRole = escHtml(role)
  const safeUrl = inviteUrl.startsWith('http') ? inviteUrl : `https://raxteam.com/join?token=${escHtml(inviteUrl.split('token=')[1] ?? '')}`

  const roleDesc: Record<string, string> = {
    member: 'Create and use AI skills',
    curator: 'Create, use, and approve AI skills',
    admin: 'Full access including team management',
  }
  const safeRoleDesc = escHtml(roleDesc[role] ?? 'Access team AI skills')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You're invited to RaxTeam</title>
</head>
<body style="margin:0;padding:0;background:#0a0b10;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#0a0b10;padding:40px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px">

        <!-- Logo bar -->
        <tr><td style="padding-bottom:28px;text-align:center">
          <table cellpadding="0" cellspacing="0" role="presentation" style="display:inline-table">
            <tr>
              <td style="vertical-align:middle;padding-right:10px">
                <!-- RaxTeam "R" logomark -->
                <div style="width:40px;height:40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:10px;text-align:center;line-height:40px;font-size:20px;font-weight:900;color:#fff;letter-spacing:-1px;display:inline-block">R</div>
              </td>
              <td style="vertical-align:middle">
                <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">RaxTeam</span>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#13141c;border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden">

          <!-- Gradient hero strip -->
          <tr><td style="background:linear-gradient(135deg,#312e81 0%,#4c1d95 50%,#1e1b4b 100%);padding:40px 40px 48px;position:relative">
            <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:rgba(167,139,250,0.9);letter-spacing:0.5px;text-transform:uppercase">Team Invitation</p>
            <h1 style="margin:0 0 12px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.2">You're invited! 🎉</h1>
            <p style="margin:0;font-size:16px;color:rgba(255,255,255,0.65);line-height:1.6">
              <strong style="color:#c4b5fd">${safeInviter}</strong> has invited you to join the
              <strong style="color:#ffffff">${safeOrg}</strong> workspace on RaxTeam.
            </p>
          </td></tr>

          <!-- Body -->
          <tr><td style="padding:36px 40px">

            <!-- Role pill -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:28px">
              <tr>
                <td style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:14px 20px">
                  <table cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td style="vertical-align:top;padding-right:14px">
                        <div style="width:36px;height:36px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:8px;text-align:center;line-height:36px;font-size:16px;display:inline-block">🏷️</div>
                      </td>
                      <td style="vertical-align:middle">
                        <p style="margin:0 0 3px;font-size:11px;font-weight:700;color:rgba(167,139,250,0.8);text-transform:uppercase;letter-spacing:0.5px">Your role</p>
                        <p style="margin:0 0 2px;font-size:16px;font-weight:700;color:#e0e7ff;text-transform:capitalize">${safeRole}</p>
                        <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35)">${safeRoleDesc}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Feature list -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:32px;width:100%">
              <tr><td>
                <p style="margin:0 0 14px;font-size:13px;font-weight:600;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px">What you'll get access to</p>
              </td></tr>
              ${[
                ['⚡', 'MCP-native skill resolution', 'Works directly with Claude, Cursor, and any MCP client'],
                ['✦', 'Community skill library', 'Browse and use hundreds of peer-reviewed prompt templates'],
                ['🔒', 'Private team workspace', 'Your org\'s skills stay private and versioned'],
              ].map(([icon, title, desc]) => `
              <tr><td style="padding-bottom:12px">
                <table cellpadding="0" cellspacing="0" role="presentation">
                  <tr>
                    <td style="vertical-align:top;padding-right:12px;font-size:18px;line-height:1">${icon}</td>
                    <td style="vertical-align:middle">
                      <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#e2e8f0">${escHtml(title)}</p>
                      <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5">${escHtml(desc)}</p>
                    </td>
                  </tr>
                </table>
              </td></tr>`).join('')}
            </table>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;margin-bottom:24px">
              <tr><td style="border-radius:12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);text-align:center">
                <a href="${safeUrl}" style="display:block;padding:16px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:-0.2px">
                  Accept Invitation →
                </a>
              </td></tr>
            </table>

            <!-- Fallback URL -->
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.25);text-align:center">Or copy this link into your browser:</p>
            <p style="margin:0;font-size:11px;color:#6366f1;text-align:center;word-break:break-all">${safeUrl}</p>

          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:20px 40px 28px;border-top:1px solid rgba(255,255,255,0.06);text-align:center">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.2)">This invite expires in <strong style="color:rgba(255,255,255,0.35)">7 days</strong>. If you weren't expecting this, you can safely ignore it.</p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.15)">© RaxTeam · <a href="https://raxteam.com" style="color:#6366f1;text-decoration:none">raxteam.com</a></p>
          </td></tr>

        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// DELETE /members/invites/:token — revoke invite (admin only)
members.delete('/invites/:token', authMiddleware, async (c) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)
  const db = createDb(c.env.DB)
  await db.delete(schema.invites).where(and(
    eq(schema.invites.token, c.req.param('token')),
    eq(schema.invites.orgId, c.get('orgId'))
  ))
  return c.json({ ok: true })
})

// GET /members/invites/lookup/:token — public: validate invite token
members.get('/invites/lookup/:token', async (c) => {
  const db = createDb(c.env.DB)
  const invite = await db.select().from(schema.invites).where(eq(schema.invites.token, c.req.param('token'))).get()
  if (!invite) return c.json({ error: 'Invalid invite', code: 'NOT_FOUND' }, 404)
  if (invite.acceptedAt) return c.json({ error: 'Invite already used', code: 'GONE' }, 410)
  if (invite.expiresAt < Date.now()) return c.json({ error: 'Invite expired', code: 'GONE' }, 410)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, invite.orgId)).get()
  return c.json({ role: invite.role, orgName: org?.name, token: invite.token })
})

export default members
