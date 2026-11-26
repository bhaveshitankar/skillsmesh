import { createMiddleware } from 'hono/factory'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { API_KEY_PREFIX } from '@skillmesh/shared'

type AuthEnv = {
  Bindings: { DB: D1Database }
  Variables: { userId: string; orgId: string; role: string }
}

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing authorization', code: 'UNAUTHORIZED' }, 401)
  }

  const apiKey = header.slice(7)
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return c.json({ error: 'Invalid API key format', code: 'UNAUTHORIZED' }, 401)
  }

  const db = createDb(c.env.DB)
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.apiKey, apiKey))
    .get()

  if (!user) {
    return c.json({ error: 'Invalid API key', code: 'UNAUTHORIZED' }, 401)
  }

  c.set('userId', user.id)
  c.set('orgId', user.orgId)
  c.set('role', user.role)
  await next()
})
