import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { generateEmbedding } from '../lib/embed'
import { searchSkills } from '../lib/vectorize'
import { executeWorkflow } from './workflows'
import { callLLM, type Message, type LLMConfig } from '../lib/llm'
import { nrLog, nrMetric } from '../lib/newrelic'

type ChatConfig = {
  provider?: 'cloudflare' | 'openai' | 'anthropic' | 'gemini' | 'groq'
  model?: string
  apiKey?: string
  systemPrompt?: string
  widgetEnabled?: boolean
  widgetToken?: string
  widgetAllowedOrigins?: string
  // Workflow mode
  workflowId?: string
  workflowName?: string
  // Personalization
  chatTitle?: string
  botName?: string
  welcomeMessage?: string
  inputPlaceholder?: string
  accentColor?: string
  showPoweredBy?: boolean
}

type ChatEnv = {
  Bindings: {
    DB: D1Database
    KV: KVNamespace
    VECTORIZE_384: VectorizeIndex
    VECTORIZE_768: VectorizeIndex
    AI: Ai
    NR_LICENSE_KEY?: string
    NR_REGION?: string
  }
  Variables: { userId: string; orgId: string; role: string }
}

const chat = new Hono<ChatEnv>()

// ── Build context from a workflow ─────────────────────────────────────────────

async function buildWorkflowContext(
  db: ReturnType<typeof createDb>,
  workflowId: string,
  orgId: string,
  message: string,
  customSystemPrompt?: string,
  env?: { AI: Ai },
  llmConfig?: LLMConfig,
): Promise<{ systemPrompt: string; skillsUsed: string[] }> {
  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, workflowId)).get()
  if (!workflow || workflow.orgId !== orgId) throw new Error('Workflow not found')
  if (workflow.status !== 'published') throw new Error('Workflow is not published')

  const { output } = await executeWorkflow(
    workflow.definition as import('./workflows').WorkflowDefinition,
    { input: message },
    db,
    0,
    env,
    llmConfig,
  )

  const base = customSystemPrompt?.trim()
    || 'You are a helpful AI assistant for this organization.'

  return {
    systemPrompt: output
      ? `${base}\n\n## Workflow Context\n\n${output}\n\nUse the above context to answer the user's question.`
      : base,
    skillsUsed: [workflow.name],
  }
}

// ── Build system prompt with skill context ────────────────────────────────────

async function buildContext(
  env: ChatEnv['Bindings'],
  orgId: string,
  query: string,
  isPaid: boolean,
  customSystemPrompt?: string,
): Promise<{ systemPrompt: string; skillsUsed: string[] }> {
  const db = createDb(env.DB)
  const skillsUsed: string[] = []

  try {
    const model = isPaid ? 'baai/bge-large-en-v1.5' : 'baai/bge-small-en-v1.5'
    const index = isPaid ? env.VECTORIZE_768 : env.VECTORIZE_384
    const queryVec = await generateEmbedding(env.AI, query, model)
    const matches = await searchSkills(index, queryVec, 5)

    const skillIds = matches.filter(m => !m.id.startsWith('chunk_')).map(m => m.id)
    if (skillIds.length > 0) {
      const { inArray } = await import('drizzle-orm')
      const skills = await db.select({
        id: schema.skills.id,
        name: schema.skills.name,
        description: schema.skills.description,
        promptTemplate: schema.skills.promptTemplate,
        orgId: schema.skills.orgId,
        visibility: schema.skills.visibility,
      }).from(schema.skills).where(inArray(schema.skills.id, skillIds)).all()

      const accessible = skills.filter(s =>
        s.orgId === orgId || s.visibility === 'public' || s.visibility === 'shared'
      )

      if (accessible.length > 0) {
        const skillContext = accessible.map(s =>
          `### Skill: ${s.name}\n${s.description}\n\nPrompt template:\n${s.promptTemplate}`
        ).join('\n\n---\n\n')

        accessible.forEach(s => skillsUsed.push(s.name))

        const base = customSystemPrompt?.trim()
          || 'You are a helpful AI assistant for this organization. Use the organization\'s skills and knowledge to answer questions accurately.'

        return {
          systemPrompt: `${base}\n\n## Organization Skills Context\n\nThe following skills are available and relevant to this conversation:\n\n${skillContext}\n\nUse these skills to inform your responses when relevant.`,
          skillsUsed,
        }
      }
    }
  } catch { /* best-effort context */ }

  return {
    systemPrompt: customSystemPrompt?.trim() || 'You are a helpful AI assistant for this organization.',
    skillsUsed,
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /chat/config
chat.get('/config', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Chat is a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const cfg: ChatConfig = org.settings?.chat ?? {}
  // Never expose raw API key — just signal whether one is set
  return c.json({
    provider: cfg.provider ?? 'cloudflare',
    model: cfg.model ?? '',
    hasApiKey: !!cfg.apiKey,
    systemPrompt: cfg.systemPrompt ?? '',
    widgetEnabled: cfg.widgetEnabled ?? false,
    widgetToken: cfg.widgetToken ?? null,
    widgetAllowedOrigins: cfg.widgetAllowedOrigins ?? '',
    workflowId: cfg.workflowId ?? null,
    workflowName: cfg.workflowName ?? null,
    chatTitle: cfg.chatTitle ?? '',
    botName: cfg.botName ?? '',
    welcomeMessage: cfg.welcomeMessage ?? '',
    inputPlaceholder: cfg.inputPlaceholder ?? '',
    accentColor: cfg.accentColor ?? '',
    showPoweredBy: cfg.showPoweredBy ?? true,
  })
})

// PATCH /chat/config
chat.patch('/config', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Chat is a Pro feature', code: 'PLAN_LIMIT' }, 402)
  if (c.get('role') !== 'admin') return c.json({ error: 'Admin only', code: 'FORBIDDEN' }, 403)

  const body = await c.req.json<{
    provider?: string
    model?: string
    apiKey?: string
    systemPrompt?: string
    widgetEnabled?: boolean
    widgetAllowedOrigins?: string
    regenerateToken?: boolean
    workflowId?: string | null
    workflowName?: string | null
    chatTitle?: string
    botName?: string
    welcomeMessage?: string
    inputPlaceholder?: string
    accentColor?: string
    showPoweredBy?: boolean
  }>()

  const existing: ChatConfig = org.settings?.chat ?? {}
  const validProviders = ['cloudflare', 'openai', 'anthropic', 'gemini', 'groq']

  const updated: ChatConfig = {
    ...existing,
    ...(body.provider && validProviders.includes(body.provider) ? { provider: body.provider as 'cloudflare' | 'openai' | 'anthropic' | 'gemini' | 'groq' } : {}),
    ...(body.model !== undefined ? { model: body.model } : {}),
    ...(body.apiKey !== undefined ? { apiKey: body.apiKey || undefined } : {}),
    ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
    ...(body.widgetEnabled !== undefined ? { widgetEnabled: body.widgetEnabled } : {}),
    ...(body.widgetAllowedOrigins !== undefined ? { widgetAllowedOrigins: body.widgetAllowedOrigins } : {}),
    ...(body.regenerateToken ? { widgetToken: crypto.randomUUID().replace(/-/g, '') } : {}),
    ...(body.workflowId !== undefined ? { workflowId: body.workflowId ?? undefined, workflowName: body.workflowName ?? undefined } : {}),
    ...(body.chatTitle !== undefined ? { chatTitle: body.chatTitle.slice(0, 80) } : {}),
    ...(body.botName !== undefined ? { botName: body.botName.slice(0, 60) } : {}),
    ...(body.welcomeMessage !== undefined ? { welcomeMessage: body.welcomeMessage.slice(0, 300) } : {}),
    ...(body.inputPlaceholder !== undefined ? { inputPlaceholder: body.inputPlaceholder.slice(0, 100) } : {}),
    ...(body.accentColor !== undefined ? { accentColor: /^#[0-9a-fA-F]{6}$/.test(body.accentColor) ? body.accentColor : '' } : {}),
    ...(body.showPoweredBy !== undefined ? { showPoweredBy: body.showPoweredBy } : {}),
  }

  // Auto-generate widget token if enabling widget for first time
  if (updated.widgetEnabled && !updated.widgetToken) {
    updated.widgetToken = crypto.randomUUID().replace(/-/g, '')
  }

  const chatToSave = { provider: 'cloudflare' as const, ...updated }
  await db.update(schema.orgs)
    .set({ settings: { ...org.settings, chat: chatToSave } })
    .where(eq(schema.orgs.id, org.id))

  return c.json({
    ok: true,
    widgetToken: updated.widgetToken ?? null,
    widgetEnabled: updated.widgetEnabled ?? false,
  })
})

// POST /chat — authenticated chat for org members
chat.post('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
  if (!org) return c.json({ error: 'Not found' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Chat is a Pro feature. Upgrade to use the org chatbot.', code: 'PLAN_LIMIT' }, 402)

  const body = await c.req.json<{ message: string; history?: Message[] }>()
  if (!body.message?.trim()) return c.json({ error: 'message is required' }, 400)
  if (body.message.length > 4000) return c.json({ error: 'Message too long' }, 400)

  const cfg: ChatConfig = org.settings?.chat ?? {}
  const provider = cfg.provider ?? 'cloudflare'
  const db2 = createDb(c.env.DB)

  const { systemPrompt, skillsUsed } = cfg.workflowId
    ? await buildWorkflowContext(db2, cfg.workflowId, org.id, body.message, cfg.systemPrompt, c.env, cfg).catch(() =>
        buildContext(c.env, org.id, body.message, true, cfg.systemPrompt))
    : await buildContext(c.env, org.id, body.message, true, cfg.systemPrompt)

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...(body.history ?? []).slice(-10),
    { role: 'user', content: body.message },
  ]

  let reply = ''
  let outputType: string = 'text'
  try {
    const result = await callLLM(c.env.AI, messages, cfg)
    reply = result.content
    outputType = result.outputType
  } catch (e: unknown) {
    return c.json({ error: 'LLM call failed: ' + (e as Error).message }, 502)
  }

  if (!reply) return c.json({ error: 'No response from LLM' }, 502)

  c.executionCtx.waitUntil(nrLog(c.env, 'info', 'chat_reply', { provider, org_id: org.id, has_workflow: cfg.workflowId ? 1 : 0 }))
  c.executionCtx.waitUntil(nrMetric(c.env, 'skillmesh.chat.messages', 1, { provider }))

  return c.json({ reply, skillsUsed, provider, outputType })
})

export default chat

// ── Public config endpoint (no auth — safe fields only) ──────────────────────
export async function getPublicChatConfig(
  orgSlug: string,
  env: ChatEnv['Bindings'],
): Promise<Record<string, unknown> | null> {
  const db = createDb(env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, orgSlug)).get()
  if (!org || org.plan === 'free') return null
  const cfg: ChatConfig = org.settings?.chat ?? {}
  if (!cfg.widgetEnabled) return null
  return {
    chatTitle: cfg.chatTitle || 'AI Assistant',
    botName: cfg.botName || 'Assistant',
    welcomeMessage: cfg.welcomeMessage || 'Hi! How can I help you?',
    inputPlaceholder: cfg.inputPlaceholder || 'Type a message…',
    accentColor: cfg.accentColor || '#4f46e5',
    showPoweredBy: cfg.showPoweredBy ?? true,
    orgName: org.name,
  }
}

// ── Public widget handler (exported separately, mounted at /public/chat) ──────

export async function handlePublicChat(
  orgSlug: string,
  body: { message: string; history?: Message[]; token: string },
  env: ChatEnv['Bindings'],
): Promise<{ reply: string; skillsUsed: string[]; outputType?: string; error?: string } | { error: string }> {
  const db = createDb(env.DB)
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.slug, orgSlug)).get()

  if (!org) return { error: 'Organization not found' }
  if (org.plan === 'free') return { error: 'Chat not available' }

  const cfg: ChatConfig = org.settings?.chat ?? {}
  if (!cfg.widgetEnabled) return { error: 'Widget not enabled for this organization' }
  if (!cfg.widgetToken || cfg.widgetToken !== body.token) return { error: 'Invalid widget token' }

  if (!body.message?.trim()) return { error: 'message is required' }
  if (body.message.length > 2000) return { error: 'Message too long' }

  const dbPub = createDb(env.DB)
  const { systemPrompt, skillsUsed } = cfg.workflowId
    ? await buildWorkflowContext(dbPub, cfg.workflowId, org.id, body.message, cfg.systemPrompt, env, cfg).catch(() =>
        buildContext(env, org.id, body.message, true, cfg.systemPrompt))
    : await buildContext(env, org.id, body.message, true, cfg.systemPrompt)

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    ...(body.history ?? []).slice(-6),
    { role: 'user', content: body.message },
  ]

  let reply = ''
  let outputType: string = 'text'

  try {
    const result = await callLLM(env.AI, messages, cfg)
    reply = result.content
    outputType = result.outputType
  } catch (e: unknown) {
    return { error: 'LLM error: ' + (e as Error).message }
  }

  if (!reply) return { error: 'No response from the AI model. Please try again.' }
  return { reply, skillsUsed, outputType }
}
