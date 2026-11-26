import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import auth from './routes/auth'
import orgs from './routes/orgs'
import skills from './routes/skills'
import resolve from './routes/resolve'
import approvals from './routes/approvals'
import usage from './routes/usage'
import members from './routes/members'
import assets from './routes/assets'
import billing from './routes/billing'
import pub from './routes/public'
import superadmin from './routes/admin'
import versions from './routes/versions'
import evals from './routes/evals'
import chat from './routes/chat'
import { handlePublicChat, getPublicChatConfig } from './routes/chat'
import playground from './routes/playground'
import workflows from './routes/workflows'
import secrets from './routes/secrets'
import skillBuilder from './routes/skill-builder'
import chatEndpoints from './routes/chat-endpoints'
import { nrLog, nrMetric } from './lib/newrelic'

type Env = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    VECTORIZE_384: VectorizeIndex
    VECTORIZE_768: VectorizeIndex
    AI: Ai
    ASSETS: R2Bucket
    EMBED_QUEUE: Queue | undefined
    GITHUB_CLIENT_ID: string
    GITHUB_CLIENT_SECRET: string
    SESSION_SECRET: string
    RAZORPAY_KEY_ID: string
    RAZORPAY_KEY_SECRET: string
    RAZORPAY_WEBHOOK_SECRET: string
    ADMIN_SECRET: string
    JINA_API_KEY?: string
    NR_LICENSE_KEY?: string
    NR_REGION?: string
  }
  Variables: {
    userId: string
    orgId: string
    role: string
  }
}

const app = new Hono<Env>()

const CORS_ORIGINS = ['https://raxteam.com', 'https://app.raxteam.com']
app.use('*', cors({ origin: CORS_ORIGINS, allowHeaders: ['Authorization', 'Content-Type'], credentials: true }))

// Request logging and metrics middleware
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const duration = Date.now() - start
  const method = c.req.method
  const path = new URL(c.req.url).pathname
  const status = c.res.status
  c.executionCtx.waitUntil(nrMetric(c.env, 'skillmesh.api.requests', 1, { method, path, status, duration_ms: duration }))
  c.executionCtx.waitUntil(nrLog(c.env, 'info', 'request', { method, path, status, duration_ms: duration }))
})

// Security headers on every response
app.use('*', async (c, next) => {
  await next()
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
  c.res.headers.set('X-Frame-Options', 'DENY')
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.res.headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
})

app.get('/health', (c) => c.json({ ok: true }))

app.get('/openapi.json', (c) => c.json({
  openapi: '3.1.0',
  info: { title: 'SkillMesh API', version: '1.0.0', description: 'Shared AI prompt templates (skills) for teams. Resolve the best skill for any task, list skills, or submit new ones.' },
  servers: [{ url: 'https://api.raxteam.com' }],
  paths: {
    '/resolve': {
      post: {
        operationId: 'resolveSkill',
        summary: 'Find the best matching skill for a task',
        description: 'Given a natural-language query, returns the best matching approved prompt template using vector similarity. Call this before any complex task.',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Short description of the task you need to do' }, topK: { type: 'integer', default: 5 } } } } } },
        responses: { '200': { description: 'Skill resolution result', content: { 'application/json': { schema: { type: 'object', properties: { found: { type: 'boolean' }, match: { type: 'object', properties: { skill: { '$ref': '#/components/schemas/Skill' }, score: { type: 'number' } } }, topCandidates: { type: 'array' }, ragContext: { type: 'array', description: 'Relevant document chunks (Pro plan)' } } } } } } },
      },
    },
    '/skills': {
      get: {
        operationId: 'listSkills',
        summary: 'List approved skills',
        description: 'Returns approved skills. Without auth returns public skills. With auth returns own org skills plus shared skills.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'visibility', in: 'query', schema: { type: 'string', enum: ['private', 'shared', 'public', 'all'] } }],
        responses: { '200': { description: 'Skills list', content: { 'application/json': { schema: { type: 'object', properties: { skills: { type: 'array', items: { '$ref': '#/components/schemas/Skill' } } } } } } } },
      },
      post: {
        operationId: 'submitSkill',
        summary: 'Create a new skill (starts as draft)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { '$ref': '#/components/schemas/SkillInput' } } } },
        responses: { '201': { description: 'Created skill' } },
      },
    },
    '/public/skills': {
      get: {
        operationId: 'listPublicSkills',
        summary: 'Browse public approved skills (no auth required)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 24 } },
        ],
        responses: { '200': { description: 'Public skills feed sorted by upvotes' } },
      },
    },
    '/public/p': {
      get: {
        operationId: 'findPublicSkill',
        summary: 'Open skill lookup — no API key required',
        description: 'Find the best matching public approved skill for a query using keyword scoring. Rate limited to 10 requests per minute per IP. Returns promptTemplate ready to use. For vector search and private skills, get an API key at https://raxteam.com',
        parameters: [
          { name: 'q', in: 'query', required: true, description: 'Natural language query, e.g. "wish happy birthday"', schema: { type: 'string', maxLength: 200 } },
        ],
        responses: {
          '200': { description: 'Plain text: skill name, description, then prompt template separated by newlines. If no match found, returns a plain-text message instead.', content: { 'text/plain': { schema: { type: 'string', example: 'Happy Birthday Wish\nWrite a warm, personalized birthday message\n\nWrite a heartfelt birthday message for {{name}}...' } } } },
          '429': { description: 'Rate limit exceeded — 10 req/min per IP' },
        },
      },
    },
    '/chat/config': {
      get: {
        operationId: 'getChatConfig',
        summary: 'Get org chatbot configuration (Pro)',
        description: 'Returns the current LLM provider, model, system prompt, and widget settings for the authenticated org. API key is never returned — only whether one is set.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Chat configuration', content: { 'application/json': { schema: { '$ref': '#/components/schemas/ChatConfig' } } } },
          '402': { description: 'Pro plan required' },
        },
      },
      patch: {
        operationId: 'updateChatConfig',
        summary: 'Update org chatbot configuration (Pro, admin only)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { '$ref': '#/components/schemas/ChatConfigInput' } } },
        },
        responses: {
          '200': { description: 'Updated config', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, widgetToken: { type: 'string', nullable: true }, widgetEnabled: { type: 'boolean' } } } } } },
          '402': { description: 'Pro plan required' },
          '403': { description: 'Admin role required' },
        },
      },
    },
    '/chat': {
      post: {
        operationId: 'orgChat',
        summary: 'Send a message to the org AI assistant (Pro)',
        description: 'Sends a message to the org chatbot. The assistant uses the org\'s approved skills as context for its reply. Supports multi-turn conversation via the history array.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', maxLength: 4000, description: 'The user message' },
                  history: {
                    type: 'array',
                    maxItems: 10,
                    description: 'Previous turns to maintain context (last 10 used)',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'AI reply with skill context metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reply: { type: 'string', description: 'The assistant\'s response' },
                    skillsUsed: { type: 'array', items: { type: 'string' }, description: 'Names of skills used as context' },
                    provider: { type: 'string', description: 'LLM provider that generated the reply' },
                  },
                },
              },
            },
          },
          '402': { description: 'Pro plan required' },
        },
      },
    },
    '/public/chat/{orgSlug}': {
      post: {
        operationId: 'publicWidgetChat',
        summary: 'Public widget chat endpoint (no auth header needed)',
        description: 'Used by the embeddable chat widget. Requires a valid widget token (generated in Chat Settings). The token must be sent in the request body. The widget URL passes it via the URL hash (#token=...) so it never appears in server logs or Referer headers.',
        parameters: [
          { name: 'orgSlug', in: 'path', required: true, schema: { type: 'string' }, description: 'Your org slug (e.g. "acme-corp")' },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'message'],
                properties: {
                  token: { type: 'string', description: 'Widget token from Chat Settings' },
                  message: { type: 'string', maxLength: 2000 },
                  history: {
                    type: 'array',
                    maxItems: 6,
                    items: {
                      type: 'object',
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'AI reply',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    reply: { type: 'string' },
                    skillsUsed: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid token or widget disabled' },
        },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Your SkillMesh API key (sk-...)' } },
    schemas: {
      Skill: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, promptTemplate: { type: 'string', description: 'Prompt with {{variable}} placeholders' }, triggers: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, visibility: { type: 'string', enum: ['private', 'shared', 'public'] }, status: { type: 'string', enum: ['draft', 'pending', 'approved', 'deprecated'] }, useCount: { type: 'integer' }, upvotes: { type: 'integer' } } },
      SkillInput: { type: 'object', required: ['name', 'description', 'promptTemplate', 'triggers'], properties: { name: { type: 'string' }, description: { type: 'string' }, promptTemplate: { type: 'string' }, triggers: { type: 'array', items: { type: 'string' } }, tags: { type: 'array', items: { type: 'string' } }, visibility: { type: 'string', enum: ['private', 'shared', 'public'], default: 'private' }, tokenEstimate: { type: 'integer' } } },
      ChatConfig: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['cloudflare', 'openai', 'anthropic', 'gemini', 'groq'], description: 'Active LLM provider' },
          model: { type: 'string', description: 'Model identifier for the selected provider' },
          hasApiKey: { type: 'boolean', description: 'Whether a provider API key is stored (key itself is never returned)' },
          systemPrompt: { type: 'string', description: 'Custom system prompt prepended before skill context' },
          widgetEnabled: { type: 'boolean', description: 'Whether the public embeddable widget is active' },
          widgetToken: { type: 'string', nullable: true, description: 'Widget auth token — pass via URL hash #token=... never in query params' },
          widgetAllowedOrigins: { type: 'string', description: 'Comma-separated list of allowed iframe origins (empty = allow all)' },
        },
      },
      ChatConfigInput: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['cloudflare', 'openai', 'anthropic', 'gemini', 'groq'] },
          model: { type: 'string' },
          apiKey: { type: 'string', description: 'New API key for the selected provider. Omit to keep the existing key.' },
          systemPrompt: { type: 'string' },
          widgetEnabled: { type: 'boolean' },
          widgetAllowedOrigins: { type: 'string' },
          regenerateToken: { type: 'boolean', description: 'Set true to rotate the widget token. Existing embeds using the old token will stop working.' },
        },
      },
    },
  },
}))

app.get('/me', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const user = await db.select().from(schema.users).where(eq(schema.users.id, c.get('userId'))).get()
  if (!user) return c.json({ error: 'User not found', code: 'NOT_FOUND' }, 404)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, user.orgId)).get()
  const { apiKey: _k, githubId: _gh, googleId: _g, ...safeUser } = user
  return c.json({ user: safeUser, org })
})

app.patch('/me', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const body = await c.req.json<{ name?: string }>()
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400)
  await db.update(schema.users).set({ name: body.name.trim() }).where(eq(schema.users.id, c.get('userId')))
  return c.json({ ok: true })
})

app.get('/me/apikey', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const user = await db.select({ apiKey: schema.users.apiKey }).from(schema.users).where(eq(schema.users.id, c.get('userId'))).get()
  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ apiKey: user.apiKey })
})

app.route('/public', pub)


app.route('/auth', auth)
app.route('/orgs', orgs)
app.route('/skills', skills)
app.route('/skills', approvals)
app.route('/resolve', resolve)
app.route('/usage', usage)
app.route('/members', members)
app.route('/skills', assets)
app.route('/skills', versions)
app.route('/skills', evals)
app.route('/billing', billing)
app.route('/chat', chat)
app.route('/playground', playground)
app.route('/workflows', workflows)
app.route('/secrets', secrets)
app.route('/skill-builder', skillBuilder)
app.route('/chat-endpoints', chatEndpoints)

// Public widget config — GET /public/chat/:orgSlug/config (no auth, safe fields only)
app.get('/public/chat/:orgSlug/config', async (c) => {
  const config = await getPublicChatConfig(c.req.param('orgSlug'), c.env as Parameters<typeof getPublicChatConfig>[1])
  if (!config) return c.json({ error: 'Not found' }, 404)
  return c.json(config)
})

// Public widget chat endpoint — POST /public/chat/:orgSlug
app.post('/public/chat/:orgSlug', async (c) => {
  const body = await c.req.json<{ message: string; history?: Array<{ role: string; content: string }>; token: string }>().catch(() => null)
  if (!body) return c.json({ error: 'Invalid request body' }, 400)
  const result = await handlePublicChat(c.req.param('orgSlug'), body as Parameters<typeof handlePublicChat>[1], c.env as Parameters<typeof handlePublicChat>[2])
  if ('error' in result && !('reply' in result)) return c.json(result, 400)
  return c.json(result)
})

// Public chat endpoint by token — GET /public/endpoint/:token/config
app.get('/public/endpoint/:token/config', async (c) => {
  const db = createDb(c.env.DB)
  const ep = await db.select().from(schema.chatEndpoints)
    .where(eq(schema.chatEndpoints.token, c.req.param('token')))
    .get()
  if (!ep) return c.json({ error: 'Not found' }, 404)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, ep.orgId)).get()
  if (!org || org.plan === 'free') return c.json({ error: 'Not available' }, 403)
  const cfg = ep.config ?? {}
  return c.json({
    chatTitle: cfg.chatTitle || ep.name || 'AI Assistant',
    botName: cfg.botName || 'Assistant',
    welcomeMessage: cfg.welcomeMessage || 'Hi! How can I help you?',
    inputPlaceholder: cfg.inputPlaceholder || 'Type a message…',
    accentColor: cfg.accentColor || '#4f46e5',
    showPoweredBy: cfg.showPoweredBy ?? true,
    orgName: org.name,
    endpointName: ep.name,
  })
})

// Super-admin routes — all return 404 on any auth failure (route existence not revealed)
app.route('/sa', superadmin)

export default app
