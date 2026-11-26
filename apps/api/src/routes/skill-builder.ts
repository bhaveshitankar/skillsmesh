import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { isPro } from '../lib/plan'
import { callLLM } from '../lib/llm'
import { nrLog } from '../lib/newrelic'

type Env = {
  Bindings: { DB: D1Database; KV: KVNamespace; AI: Ai; VECTORIZE_384: VectorizeIndex; SESSION_SECRET: string }
  Variables: { userId: string; orgId: string; role: string }
}

const skillBuilder = new Hono<Env>()

skillBuilder.use('*', authMiddleware)

const MAX_FILE_BYTES = 5 * 1024 * 1024
const DAILY_LIMIT = 10

function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function chunkText(text: string, maxChars = 3000): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + maxChars))
    i += maxChars
  }
  return chunks
}

async function checkRateLimit(kv: KVNamespace, orgId: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10)
  const key = `skillbuilder:daily:${orgId}:${today}`
  const count = parseInt((await kv.get(key)) ?? '0')
  if (count >= DAILY_LIMIT) return false
  await kv.put(key, String(count + 1), { expirationTtl: 90000 })
  return true
}

async function getOrg(c: Parameters<typeof skillBuilder.get>[1]) {
  const db = createDb(c.env.DB)
  return db.select().from(schema.orgs).where(eq(schema.orgs.id, c.get('orgId'))).get()
}

skillBuilder.post('/upload', async (c) => {
  const org = await getOrg(c)
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)
  if (!(await checkRateLimit(c.env.KV, c.get('orgId')))) {
    return c.json({ error: 'Daily limit of 10 jobs reached' }, 429)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'No file provided' }, 400)

  const allowed = ['.txt', '.md', '.csv', '.html']
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!allowed.includes(ext)) return c.json({ error: 'Unsupported file type. Allowed: .txt, .md, .csv, .html' }, 400)
  if (file.size > MAX_FILE_BYTES) return c.json({ error: 'File too large (max 5MB)' }, 400)

  const raw = await file.text()
  const text = ext === '.html' ? extractTextFromHtml(raw) : raw

  const jobId = crypto.randomUUID()
  await c.env.KV.put(`skillbuilder:text:${jobId}`, text, { expirationTtl: 3600 })

  nrLog(c.env as never, 'info', 'skillbuilder.upload', { orgId: c.get('orgId'), charCount: text.length })

  return c.json({ jobId, text: text.slice(0, 5000), charCount: text.length })
})

skillBuilder.post('/url', async (c) => {
  const org = await getOrg(c)
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)
  if (!(await checkRateLimit(c.env.KV, c.get('orgId')))) {
    return c.json({ error: 'Daily limit of 10 jobs reached' }, 429)
  }

  const { url } = await c.req.json<{ url: string }>()
  if (!url) return c.json({ error: 'url is required' }, 400)

  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 10000)
  let html: string
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SkillMesh-Builder/1.0' } })
    html = await res.text()
  } catch (e: unknown) {
    return c.json({ error: `Failed to fetch URL: ${(e as Error).message}` }, 400)
  } finally {
    clearTimeout(timeout)
  }

  const text = extractTextFromHtml(html)
  const jobId = crypto.randomUUID()
  await c.env.KV.put(`skillbuilder:text:${jobId}`, text, { expirationTtl: 3600 })

  nrLog(c.env as never, 'info', 'skillbuilder.url', { orgId: c.get('orgId'), url, charCount: text.length })

  return c.json({ jobId, text: text.slice(0, 5000), charCount: text.length })
})

skillBuilder.post('/generate', async (c) => {
  try {
    const org = await getOrg(c)
    if (!org) return c.json({ error: 'Org not found' }, 404)
    if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

    const body = await c.req.json<{ jobId: string; topicFocus?: string }>()
    const { jobId, topicFocus } = body
    if (!jobId) return c.json({ error: 'jobId is required' }, 400)

    const text = await c.env.KV.get(`skillbuilder:text:${jobId}`)
    if (!text) return c.json({ skills: [], error: 'Job not found or expired. Please re-upload your content.' }, 200)

    const chunk = text.slice(0, 2000)
    const focusLine = topicFocus ? ` Focus specifically on: ${topicFocus}.` : ''

    // Strict JSON-only prompt — example in prompt helps the model stay on format
    const prompt = `You are a JSON API. Output ONLY a JSON object, nothing else. No prose, no markdown.

Task: Analyze the content below and return 3 reusable AI skill definitions.${focusLine}

Content:
${chunk}

Output this exact JSON (replace values, keep structure):
{"skills":[{"name":"Skill Name","description":"One sentence.","promptTemplate":"You are an expert. {{instruction}}","triggers":["trigger 1","trigger 2"],"tags":["tag1","tag2"]},{"name":"Skill Name 2","description":"One sentence.","promptTemplate":"You are an expert. {{instruction}}","triggers":["trigger 1","trigger 2"],"tags":["tag1","tag2"]},{"name":"Skill Name 3","description":"One sentence.","promptTemplate":"You are an expert. {{instruction}}","triggers":["trigger 1","trigger 2"],"tags":["tag1","tag2"]}]}`

    let raw = ''
    try {
      // Use llama-3.3-70b with a user-only message — system role causes issues on some CF models
      const result = await callLLM(c.env.AI, [{ role: 'user', content: prompt }], { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' })
      raw = result.content.trim()
    } catch (llmErr) {
      nrLog(c.env as never, 'error', 'skillbuilder.generate.llm_error', { error: String(llmErr) })
      return c.json({ skills: [], error: `LLM error: ${String(llmErr)}` }, 200)
    }

    nrLog(c.env as never, 'info', 'skillbuilder.generate.raw', { orgId: c.get('orgId'), rawSlice: raw.slice(0, 400) })

    // Clean up KV regardless of parse outcome
    await c.env.KV.delete(`skillbuilder:text:${jobId}`).catch(() => {})

    // Extract JSON — strip markdown fences if present
    let jsonStr = raw
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) jsonStr = fenceMatch[1].trim()
    const start = jsonStr.indexOf('{')
    const end = jsonStr.lastIndexOf('}')

    if (start === -1 || end === -1 || end <= start) {
      return c.json({ skills: [], error: `Model did not return JSON. Raw output: ${raw.slice(0, 300)}` }, 200)
    }

    type Skill = { name: string; description: string; promptTemplate: string; triggers: string[]; tags: string[] }
    let parsed: { skills?: Skill[] }
    try {
      parsed = JSON.parse(jsonStr.slice(start, end + 1)) as { skills?: Skill[] }
    } catch (parseErr) {
      return c.json({ skills: [], error: `JSON parse failed: ${String(parseErr)}. Raw: ${raw.slice(0, 200)}` }, 200)
    }

    const skills = (parsed.skills ?? []).filter(s => s.name?.trim() && s.promptTemplate?.trim())
    if (skills.length === 0) {
      return c.json({ skills: [], error: `Parsed JSON had no valid skills. Raw: ${raw.slice(0, 200)}` }, 200)
    }

    return c.json({ skills })
  } catch (err) {
    // Safety net — never let an unhandled error produce a 500 with no body
    return c.json({ skills: [], error: `Unexpected error: ${String(err)}` }, 200)
  }
})

// Creates skills only — workflow generation is handled by /orchestrator-builder and /supervisor-builder
skillBuilder.post('/create', async (c) => {
  const org = await getOrg(c)
  if (!org) return c.json({ error: 'Org not found' }, 404)
  if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

  const body = await c.req.json<{
    skills: Array<{ name: string; description: string; promptTemplate: string; triggers: string[]; tags: string[] }>
  }>()

  const db = createDb(c.env.DB)
  const now = Date.now()
  const createdSkills: Array<{ id: string; name: string; slug: string; description: string; status: string }> = []

  for (const s of body.skills) {
    if (!s.name?.trim() || !s.promptTemplate?.trim()) continue
    const id = crypto.randomUUID()
    const slug = s.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 80)
    await db.insert(schema.skills).values({
      id, orgId: c.get('orgId'), authorId: c.get('userId'),
      name: s.name.trim(), slug, description: s.description ?? '',
      promptTemplate: s.promptTemplate, triggers: s.triggers ?? [], tags: s.tags ?? [],
      status: 'draft', visibility: 'private',
      createdAt: now,
    })
    createdSkills.push({ id, name: s.name, slug, description: s.description, status: 'draft' })
  }

  nrLog(c.env as never, 'info', 'skillbuilder.create', { orgId: c.get('orgId'), skillCount: createdSkills.length })
  return c.json({ skills: createdSkills })
})

// ── Orchestrator Builder: skills + goal → orchestrator workflow ───────────────

skillBuilder.post('/orchestrator', async (c) => {
  try {
    const org = await getOrg(c)
    if (!org) return c.json({ error: 'Org not found' }, 404)
    if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

    const { skillIds, goal, name } = await c.req.json<{ skillIds: string[]; goal: string; name: string }>()
    if (!skillIds?.length || !goal?.trim()) return c.json({ error: 'skillIds and goal are required' }, 400)

    const db = createDb(c.env.DB)
    const orgId = c.get('orgId')

    const skills = await db.select().from(schema.skills)
      .where(eq(schema.skills.orgId, orgId))
      .all()
    const selectedSkills = skills.filter(s => skillIds.includes(s.id))
    if (selectedSkills.length === 0) return c.json({ error: 'No matching skills found' }, 404)

    const skillList = selectedSkills.map(s => `- "${s.name}" (id: ${s.id}): ${s.description}`).join('\n')

    const systemPrompt = `You are a workflow architect. Respond ONLY with valid JSON — no markdown, no explanation, no code fences.`
    const userPrompt = `Goal: ${goal}

Available skills:
${skillList}

Design an orchestrator workflow that uses these skills to achieve the goal.
Return this exact JSON structure:
{"nodes":[{"id":"n1","type":"input","position":{"x":100,"y":100},"data":{"label":"Input"}},{"id":"n2","type":"skill","position":{"x":300,"y":100},"data":{"label":"skill name","skillId":"SKILL_ID_HERE","description":"what this step does"}},{"id":"nout","type":"output","position":{"x":500,"y":100},"data":{"label":"Output"}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"nout"}],"inputSchema":[{"name":"input","description":"The user request","required":true}]}`

    let definition: object = { nodes: [], edges: [], inputSchema: [{ name: 'input', description: 'The user request', required: true }] }
    try {
      const result = await callLLM(c.env.AI, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {})

      const raw = result.content.trim()
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = fenceMatch ? fenceMatch[1].trim() : raw
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')

      if (start !== -1 && end > start) {
        definition = JSON.parse(jsonStr.slice(start, end + 1))
      }
    } catch (llmErr) {
      nrLog(c.env as never, 'warn', 'orchestrator.llm_failed', { error: String(llmErr) })
      // Continue with empty definition — user can edit in workflow editor
    }

    const wfId = crypto.randomUUID()
    const now = Date.now()
    await db.insert(schema.workflows).values({
      id: wfId, orgId, authorId: c.get('userId'),
      name: name || `${goal.slice(0, 40)} Orchestrator`,
      description: `Orchestrates: ${selectedSkills.map(s => s.name).join(', ')} — Goal: ${goal}`,
      type: 'orchestrator', status: 'draft', version: '1.0.0',
      definition: definition as never, tags: ['auto-generated', 'orchestrator'],
      createdAt: now,
    })

    nrLog(c.env as never, 'info', 'orchestrator.create', { orgId, skillCount: selectedSkills.length })
    return c.json({ workflow: { id: wfId, name, type: 'orchestrator', status: 'draft' } })
  } catch (err) {
    return c.json({ error: `Unexpected error: ${String(err)}` }, 500)
  }
})

// ── Supervisor Builder: orchestrators + rules → supervisor workflow ───────────

skillBuilder.post('/supervisor', async (c) => {
  try {
    const org = await getOrg(c)
    if (!org) return c.json({ error: 'Org not found' }, 404)
    if (!isPro(org)) return c.json({ error: 'Pro plan required', code: 'PLAN_LIMIT' }, 402)

    const body = await c.req.json<{ orchestratorIds: string[]; name: string; description: string }>()
    const { orchestratorIds, name, description } = body
    if (!orchestratorIds?.length) return c.json({ error: 'orchestratorIds required' }, 400)
    if (!name?.trim()) return c.json({ error: 'name is required' }, 400)

    const db = createDb(c.env.DB)
    const orgId = c.get('orgId')

    const allWorkflows = await db.select().from(schema.workflows)
      .where(eq(schema.workflows.orgId, orgId))
      .all()
    const orchestrators = allWorkflows.filter(w => orchestratorIds.includes(w.id))
    if (orchestrators.length === 0) return c.json({ error: 'No matching orchestrators found' }, 404)

    const orchList = orchestrators.map(o => `- "${o.name}" (id: ${o.id}): ${o.description || 'No description'}`).join('\n')

    const prompt = `You are a JSON API. Output ONLY a JSON object, nothing else.

Design a supervisor workflow that routes requests to the correct orchestrator, validates inputs/outputs, and standardises responses.

Orchestrators available:
${orchList}

Output this exact JSON structure (use sub_workflow nodes for orchestrators):
{"nodes":[{"id":"n1","type":"input","position":{"x":100,"y":200},"data":{"label":"User Request","description":"Validate and classify incoming request"}},{"id":"n2","type":"condition","position":{"x":300,"y":200},"data":{"label":"Route Request","condition":"{{input}} != ''","description":"Classify intent and route to correct orchestrator"}},{"id":"n3","type":"sub_workflow","position":{"x":500,"y":100},"data":{"label":"${orchestrators[0]?.name || 'Orchestrator'}","workflowId":"${orchestrators[0]?.id || 'ID'}","description":"Handles specific domain"}},{"id":"nout","type":"output","position":{"x":700,"y":200},"data":{"label":"Standardised Response","description":"Validate and format final response"}}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3","sourceHandle":"true"},{"id":"e3","source":"n3","target":"nout"}],"inputSchema":[{"name":"input","description":"User request","required":true}]}`

    let definition: object = { nodes: [], edges: [], inputSchema: [{ name: 'input', description: 'User request', required: true }] }
    try {
      const result = await callLLM(c.env.AI, [{ role: 'user', content: prompt }], { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' })
      const raw = result.content.trim()
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = fenceMatch ? fenceMatch[1].trim() : raw
      const start = jsonStr.indexOf('{')
      const end = jsonStr.lastIndexOf('}')
      if (start !== -1 && end > start) {
        definition = JSON.parse(jsonStr.slice(start, end + 1))
      }
    } catch (llmErr) {
      nrLog(c.env as never, 'warn', 'supervisor.llm_failed', { error: String(llmErr) })
      // Continue with empty definition — user can edit in workflow editor
    }

    const wfId = crypto.randomUUID()
    const now = Date.now()
    await db.insert(schema.workflows).values({
      id: wfId,
      orgId,
      authorId: c.get('userId'),
      name: name.trim(),
      description: description?.trim() || `Supervises: ${orchestrators.map(o => o.name).join(', ')}`,
      type: 'supervisor',
      status: 'draft',
      version: '1.0.0',
      definition: definition as never,
      tags: ['auto-generated', 'supervisor'],
      createdAt: now,
    })

    nrLog(c.env as never, 'info', 'supervisor.create', { orgId, orchCount: orchestrators.length })
    return c.json({ workflow: { id: wfId, name: name.trim(), type: 'supervisor', status: 'draft' } })
  } catch (err) {
    return c.json({ error: `Unexpected error: ${String(err)}` }, 500)
  }
})

export default skillBuilder
