import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and, desc, like, count, or } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { callLLM, type Message, type LLMConfig } from '../lib/llm'
import { nrLog, nrMetric } from '../lib/newrelic'
import { decrypt, deriveKey } from './secrets'

type WorkflowEnv = {
  Bindings: { DB: D1Database; AI: Ai; KV: KVNamespace; VECTORIZE_384: VectorizeIndex; VECTORIZE_768: VectorizeIndex; SESSION_SECRET: string; NR_LICENSE_KEY?: string; NR_REGION?: string }
  Variables: { userId: string; orgId: string; role: string }
}

const workflows = new Hono<WorkflowEnv>()

// ── Types matching schema ─────────────────────────────────────────────────────

type WorkflowNodeData = {
  label?: string
  description?: string
  skillId?: string
  skillName?: string
  condition?: string
  mcpServerUrl?: string
  mcpTool?: string
  mcpHeaders?: Record<string, string>
  mcpInput?: string
  workflowId?: string
  workflowName?: string
  promptTemplate?: string
}

type WorkflowNode = {
  id: string
  type: 'input' | 'output' | 'skill' | 'condition' | 'mcp_tool' | 'sub_workflow' | 'note'
  position: { x: number; y: number }
  data: WorkflowNodeData
}

type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
}

type WorkflowDefinition = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputSchema?: Array<{ name: string; description: string; required: boolean }>
}

type StepRecord = {
  nodeId: string
  nodeType: string
  label: string
  status: 'running' | 'completed' | 'failed' | 'skipped'
  output?: string
  error?: string
  startedAt: number
  completedAt?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeWorkflow(w: Record<string, unknown>) {
  return {
    id: w.id,
    orgId: w.orgId,
    authorId: w.authorId,
    name: w.name,
    description: w.description,
    type: w.type,
    status: w.status,
    version: w.version,
    tags: w.tags,
    runCount: w.runCount,
    createdAt: w.createdAt,
    publishedAt: w.publishedAt,
  }
}

function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '')
}

async function resolveSecrets(
  template: string,
  orgId: string,
  userId: string,
  db: ReturnType<typeof createDb>,
  sessionSecret: string
): Promise<string> {
  const refs = [...template.matchAll(/\{\{secret:([A-Z][A-Z0-9_]*)\}\}/g)]
  if (refs.length === 0) return template

  let resolved = template
  const key = await deriveKey(sessionSecret, orgId)

  for (const [full, name] of refs) {
    const row = await db.select().from(schema.orgSecrets).where(
      and(
        eq(schema.orgSecrets.orgId, orgId),
        eq(schema.orgSecrets.name, name),
        or(
          eq(schema.orgSecrets.scope, 'org'),
          eq(schema.orgSecrets.userId, userId)
        )
      )
    ).get()
    if (row) {
      const plaintext = await decrypt(row.encryptedValue, key)
      resolved = resolved.replaceAll(full, plaintext)
    }
  }

  return resolved
}

function safeEval(expression: string, context: Record<string, string>): boolean {
  // Replace {{varName}} references with their values, then evaluate simple conditions
  const rendered = renderTemplate(expression, context)
  // Only allow simple truthy checks — no arbitrary code execution
  // Supported: "value == other", "value != other", "value", non-empty string
  try {
    const trimmed = rendered.trim()
    if (trimmed === 'true' || trimmed === '1') return true
    if (trimmed === 'false' || trimmed === '0' || trimmed === '') return false
    // Simple equality/inequality
    const eqMatch = trimmed.match(/^(.+?)\s*==\s*(.+)$/)
    if (eqMatch) return eqMatch[1].trim() === eqMatch[2].trim()
    const neqMatch = trimmed.match(/^(.+?)\s*!=\s*(.+)$/)
    if (neqMatch) return neqMatch[1].trim() !== neqMatch[2].trim()
    // Truthy: non-empty string
    return trimmed.length > 0
  } catch {
    return false
  }
}

// ── Execution Engine ──────────────────────────────────────────────────────────

async function executeWorkflow(
  definition: WorkflowDefinition,
  inputVars: Record<string, string>,
  db: ReturnType<typeof createDb>,
  depth = 0,
  env?: { AI: Ai },
  llmConfig?: LLMConfig,
  secretsCtx?: { sessionSecret: string; orgId: string; userId: string },
): Promise<{ output: string; steps: StepRecord[] }> {
  if (depth > 5) throw new Error('Workflow recursion limit exceeded')

  const context: Record<string, string> = { ...inputVars }
  const steps: StepRecord[] = []
  const { nodes, edges } = definition

  // Build adjacency: nodeId → edges out of it
  const edgesFrom: Record<string, WorkflowEdge[]> = {}
  for (const edge of edges) {
    if (!edgesFrom[edge.source]) edgesFrom[edge.source] = []
    edgesFrom[edge.source].push(edge)
  }

  // Find input node
  const startNode = nodes.find(n => n.type === 'input')
  if (!startNode) throw new Error('No input node found in workflow definition')

  // Walk DAG iteratively (BFS-like, respecting condition branches)
  const visited = new Set<string>()
  const queue: string[] = [startNode.id]

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)

    const node = nodes.find(n => n.id === nodeId)
    if (!node) continue

    const step: StepRecord = {
      nodeId: node.id,
      nodeType: node.type,
      label: node.data.label ?? node.type,
      status: 'running',
      startedAt: Date.now(),
    }
    steps.push(step)

    try {
      switch (node.type) {
        case 'input': {
          // Merge inputVars into context (already done above)
          step.output = 'Input vars loaded'
          step.status = 'completed'
          break
        }

        case 'skill': {
          const skillId = node.data.skillId
          if (!skillId) {
            step.status = 'failed'
            step.error = 'No skillId on skill node'
            break
          }
          const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
          if (!skill) {
            step.status = 'failed'
            step.error = `Skill ${skillId} not found`
            break
          }

          // Call each MCP tool first if skill has them
          const mcpOutputParts: string[] = []
          if (skill.mcpTools && skill.mcpTools.length > 0) {
            for (const mcpTool of skill.mcpTools) {
              try {
                const mcpInput = renderTemplate(node.data.mcpInput ?? '', context)
                const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                if (mcpTool.authHeader) headers['Authorization'] = mcpTool.authHeader
                const mcpRes = await fetch(mcpTool.serverUrl, {
                  method: 'POST',
                  headers,
                  body: JSON.stringify({ tool: mcpTool.toolName, input: mcpInput }),
                })
                const mcpData = await mcpRes.text()
                mcpOutputParts.push(`[${mcpTool.name}]: ${mcpData}`)
                context[`mcp_${mcpTool.name}`] = mcpData
              } catch (e: unknown) {
                mcpOutputParts.push(`[${mcpTool.name}] error: ${(e as Error).message}`)
              }
            }
          }

          const rendered = renderTemplate(skill.promptTemplate, context)
          const userContent = mcpOutputParts.length > 0
            ? `${rendered}\n\nMCP Results:\n${mcpOutputParts.join('\n')}`
            : rendered

          let fullOutput = userContent
          if (env) {
            const systemParts: string[] = []
            if (skill.description) systemParts.push(skill.description)
            if (node.data.description) systemParts.push(`Node instructions: ${node.data.description}`)
            const systemContent = systemParts.length > 0 ? systemParts.join('\n\n') : 'You are a helpful AI assistant.'
            const msgs: Message[] = [
              { role: 'system', content: systemContent },
              { role: 'user', content: userContent },
            ]
            const llmResult = await callLLM(env.AI, msgs, llmConfig ?? {})
            if (llmResult.outputType === 'image') {
              fullOutput = JSON.stringify({ outputType: 'image', content: llmResult.content })
            } else {
              fullOutput = llmResult.content
            }
          }

          context[`node_${node.id}_output`] = fullOutput
          step.output = fullOutput
          step.status = 'completed'
          break
        }

        case 'condition': {
          const condition = node.data.condition ?? ''
          const result = safeEval(condition, context)
          context[`node_${node.id}_output`] = String(result)
          step.output = `condition: ${condition} → ${result}`
          step.status = 'completed'

          // Only follow the matching handle branch
          const outEdges = edgesFrom[node.id] ?? []
          const matchHandle = result ? 'true' : 'false'
          const matchedEdge = outEdges.find(e => e.sourceHandle === matchHandle)
          if (matchedEdge && !visited.has(matchedEdge.target)) {
            queue.unshift(matchedEdge.target)
          }
          // Skip default edge processing below
          step.completedAt = Date.now()
          continue
        }

        case 'mcp_tool': {
          const serverUrl = node.data.mcpServerUrl
          const toolName = node.data.mcpTool
          if (!serverUrl || !toolName) {
            step.status = 'failed'
            step.error = 'Missing mcpServerUrl or mcpTool'
            break
          }
          let mcpInput = renderTemplate(node.data.mcpInput ?? '', context)
          const rawHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...(node.data.mcpHeaders ?? {}) }
          const headers: Record<string, string> = {}
          for (const [hk, hv] of Object.entries(rawHeaders)) {
            headers[hk] = secretsCtx
              ? await resolveSecrets(hv, secretsCtx.orgId, secretsCtx.userId, db, secretsCtx.sessionSecret)
              : hv
          }
          if (secretsCtx) {
            mcpInput = await resolveSecrets(mcpInput, secretsCtx.orgId, secretsCtx.userId, db, secretsCtx.sessionSecret)
          }
          const mcpRes = await fetch(serverUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ tool: toolName, input: mcpInput }),
          })
          const mcpData = await mcpRes.text()
          context[`node_${node.id}_output`] = mcpData
          step.output = mcpData
          step.status = 'completed'
          break
        }

        case 'sub_workflow': {
          const subWorkflowId = node.data.workflowId
          if (!subWorkflowId) {
            step.status = 'failed'
            step.error = 'No workflowId on sub_workflow node'
            break
          }
          const subWf = await db.select().from(schema.workflows).where(eq(schema.workflows.id, subWorkflowId)).get()
          if (!subWf) {
            step.status = 'failed'
            step.error = `Sub-workflow ${subWorkflowId} not found`
            break
          }
          const subResult = await executeWorkflow(subWf.definition as WorkflowDefinition, context, db, depth + 1, env, llmConfig)
          context[`node_${node.id}_output`] = subResult.output
          step.output = subResult.output
          step.status = 'completed'
          break
        }

        case 'output': {
          // Collect all skill outputs and join
          const outputs = Object.entries(context)
            .filter(([k]) => k.startsWith('node_') && k.endsWith('_output'))
            .map(([, v]) => v)
          step.output = outputs.join('\n\n')
          context['__final_output__'] = step.output
          step.status = 'completed'
          break
        }

        case 'note': {
          step.status = 'skipped'
          break
        }

        default: {
          step.status = 'skipped'
        }
      }
    } catch (e: unknown) {
      step.status = 'failed'
      step.error = (e as Error).message
    }

    step.completedAt = Date.now()

    // Enqueue outgoing edges (unless condition node handled it above)
    const outEdges = edgesFrom[node.id] ?? []
    for (const edge of outEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }

  const finalOutput = context['__final_output__'] ??
    Object.entries(context)
      .filter(([k]) => k.startsWith('node_') && k.endsWith('_output'))
      .map(([, v]) => v)
      .join('\n\n')

  return { output: finalOutput, steps }
}

// ── CRUD Routes ───────────────────────────────────────────────────────────────

// GET /workflows — list org's workflows (paginated, searchable)
workflows.get('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const search = c.req.query('search')?.trim() ?? ''
  const page = Math.max(0, parseInt(c.req.query('page') ?? '0', 10))
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10)))
  const typeParam = c.req.query('type')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const searchFilter = search
    ? or(like(schema.workflows.name, `%${search}%`), like(schema.workflows.description, `%${search}%`))
    : undefined
  const typeFilter = typeParam && ['orchestrator', 'supervisor'].includes(typeParam)
    ? eq(schema.workflows.type, typeParam as 'orchestrator' | 'supervisor')
    : undefined

  const baseWhere = eq(schema.workflows.orgId, orgId)
  let whereClause = baseWhere as ReturnType<typeof and>
  if (searchFilter) whereClause = and(whereClause, searchFilter)!
  if (typeFilter) whereClause = and(whereClause, typeFilter)!

  const [{ value: total }] = await db.select({ value: count() }).from(schema.workflows).where(whereClause)
  const rows = await db.select().from(schema.workflows).where(whereClause)
    .orderBy(desc(schema.workflows.createdAt))
    .limit(limit).offset(page * limit).all()
  return c.json({ workflows: rows.map(w => safeWorkflow(w as unknown as Record<string, unknown>)), total, page, limit })
})

// POST /workflows — create workflow
workflows.post('/', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const body = await c.req.json<Record<string, unknown>>()
  const name = String(body.name ?? '').trim()
  const description = String(body.description ?? '').trim()

  if (!name || name.length > 200) return c.json({ error: 'name: 1–200 characters required', code: 'BAD_REQUEST' }, 400)
  if (!description || description.length > 2000) return c.json({ error: 'description: 1–2000 characters required', code: 'BAD_REQUEST' }, 400)

  const VALID_TYPES = ['orchestrator', 'supervisor']
  const type = VALID_TYPES.includes(String(body.type)) ? String(body.type) as 'orchestrator' | 'supervisor' : 'orchestrator'
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).slice(0, 20).map(t => String(t).slice(0, 50)) : []
  const definition = (body.definition && typeof body.definition === 'object')
    ? body.definition as WorkflowDefinition
    : { nodes: [], edges: [] }

  const id = crypto.randomUUID()
  await db.insert(schema.workflows).values({
    id, orgId, authorId: userId,
    name, description, type, status: 'draft',
    version: '1.0.0', definition, tags,
    runCount: 0, createdAt: Date.now(),
  })

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, id)).get()
  return c.json(safeWorkflow(workflow as unknown as Record<string, unknown>), 201)
})

// GET /workflows/:id — get full workflow
workflows.get('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  return c.json(workflow)
})

// PATCH /workflows/:id — update (author or admin, draft only)
workflows.patch('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const role = c.get('role')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (workflow.authorId !== userId && role !== 'admin') return c.json({ error: 'Only the author or admin can edit', code: 'FORBIDDEN' }, 403)
  if (workflow.status !== 'draft') return c.json({ error: 'Only draft workflows can be edited', code: 'BAD_REQUEST' }, 400)

  const body = await c.req.json<Record<string, unknown>>()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const n = String(body.name).trim()
    if (!n || n.length > 200) return c.json({ error: 'name: 1–200 characters required', code: 'BAD_REQUEST' }, 400)
    updates.name = n
  }
  if (body.description !== undefined) updates.description = String(body.description).slice(0, 2000)
  if (body.tags !== undefined && Array.isArray(body.tags)) updates.tags = (body.tags as unknown[]).slice(0, 20).map(t => String(t).slice(0, 50))
  if (body.definition !== undefined && typeof body.definition === 'object') updates.definition = body.definition

  if (Object.keys(updates).length === 0) return c.json({ error: 'No valid fields to update', code: 'BAD_REQUEST' }, 400)

  await db.update(schema.workflows).set(updates).where(eq(schema.workflows.id, workflow.id))
  const updated = await db.select().from(schema.workflows).where(eq(schema.workflows.id, workflow.id)).get()
  return c.json(safeWorkflow(updated as unknown as Record<string, unknown>))
})

// DELETE /workflows/:id — author or admin
workflows.delete('/:id', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const role = c.get('role')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (workflow.authorId !== userId && role !== 'admin') return c.json({ error: 'Only the author or admin can delete', code: 'FORBIDDEN' }, 403)

  await db.delete(schema.workflowVersions).where(eq(schema.workflowVersions.workflowId, workflow.id))
  await db.delete(schema.workflowRuns).where(eq(schema.workflowRuns.workflowId, workflow.id))
  await db.delete(schema.workflows).where(eq(schema.workflows.id, workflow.id))
  return c.json({ ok: true })
})

// POST /workflows/:id/ai-build — generate a full workflow definition from a text prompt
workflows.post('/:id/ai-build', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const body = await c.req.json<{ prompt: string }>()
  const prompt = String(body.prompt ?? '').trim()
  if (!prompt || prompt.length > 2000) return c.json({ error: 'prompt: 1–2000 characters required', code: 'BAD_REQUEST' }, 400)

  // Gather available skills for context
  const orgSkills = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.orgId, orgId)))
    .limit(40)
    .all()

  const skillsContext = orgSkills.length > 0
    ? orgSkills.map(s => `  {"id":"${s.id}","name":"${s.name}","desc":"${(s.description ?? '').slice(0, 120).replace(/"/g, "'")}"}`).join(',\n')
    : '  (none available)'

  const systemMsg = `You are a workflow definition generator. Output ONLY a valid JSON object — no markdown, no commentary.`

  const userMsg = `Build a workflow that: "${prompt}"

Available skills you can reference by id:
[
${skillsContext}
]

Return JSON with this exact shape:
{
  "nodes": [
    {"id":"input-1","type":"input","position":{"x":250,"y":50},"data":{"label":"Start"}},
    {"id":"step-1","type":"skill","position":{"x":250,"y":200},"data":{"label":"Step Name","skillId":"SKILL_ID","skillName":"SKILL_NAME","description":"what this step does"}},
    {"id":"output-1","type":"output","position":{"x":250,"y":500},"data":{"label":"End"}}
  ],
  "edges":[
    {"id":"e1","source":"input-1","target":"step-1"},
    {"id":"e2","source":"step-1","target":"output-1"}
  ]
}

Rules:
- Exactly one "input" node and one "output" node
- Only use skillIds from the list; omit skillId if none match
- Node types: input, output, skill, condition, note
- Condition nodes get two outgoing edges: sourceHandle "true" and sourceHandle "false"
- Layout vertically: input y=50, each step adds 150, output last
- For branches: x=100 (true path) and x=400 (false path)
- Max 10 nodes total
- Reply with ONLY the raw JSON object`

  const chatCfg = (org.settings as Record<string, unknown>)?.chat as LLMConfig | undefined

  let raw = ''
  try {
    const llmResult = await callLLM(c.env.AI, [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg },
    ], chatCfg ?? {})
    raw = llmResult.content
  } catch (e: unknown) {
    return c.json({ error: 'LLM call failed: ' + (e as Error).message }, 502)
  }

  try {
    // Extract the outermost JSON object from the response, ignoring markdown/prose
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object found')
    const cleaned = raw.slice(start, end + 1)
    const def = JSON.parse(cleaned) as WorkflowDefinition
    if (!Array.isArray(def.nodes) || !Array.isArray(def.edges)) throw new Error('bad shape')
    const ids = new Set(def.nodes.map(n => n.id))
    if (ids.size !== def.nodes.length) throw new Error('duplicate node ids')
    return c.json({ definition: def })
  } catch {
    return c.json({ error: 'AI returned invalid JSON. Please rephrase your prompt and try again.', raw: raw.slice(0, 500) }, 422)
  }
})

// POST /workflows/:id/publish — admin/curator only
workflows.post('/:id/publish', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const role = c.get('role')

  if (!['admin', 'curator'].includes(role)) {
    return c.json({ error: 'Only admins and curators can publish workflows', code: 'FORBIDDEN' }, 403)
  }

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const now = Date.now()
  await db.update(schema.workflows).set({ status: 'published', publishedAt: now }).where(eq(schema.workflows.id, workflow.id))

  // Save version snapshot
  await db.insert(schema.workflowVersions).values({
    id: crypto.randomUUID(),
    workflowId: workflow.id,
    version: workflow.version,
    definition: workflow.definition as WorkflowDefinition,
    changelog: 'Published',
    createdAt: now,
  })

  return c.json({ ok: true })
})

// ── Version Routes ────────────────────────────────────────────────────────────

// GET /workflows/:id/versions
workflows.get('/:id/versions', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const versions = await db.select().from(schema.workflowVersions)
    .where(eq(schema.workflowVersions.workflowId, workflow.id))
    .orderBy(desc(schema.workflowVersions.createdAt))
    .all()
  return c.json({ versions })
})

// POST /workflows/:id/versions — snapshot current definition
workflows.post('/:id/versions', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')
  const role = c.get('role')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)
  if (workflow.authorId !== userId && role !== 'admin') return c.json({ error: 'Only the author or admin can snapshot versions', code: 'FORBIDDEN' }, 403)

  const body = await c.req.json<{ version?: string; changelog?: string }>()
  const version = String(body.version ?? workflow.version).trim()
  const changelog = String(body.changelog ?? '').trim()

  const id = crypto.randomUUID()
  await db.insert(schema.workflowVersions).values({
    id,
    workflowId: workflow.id,
    version,
    definition: workflow.definition as WorkflowDefinition,
    changelog,
    createdAt: Date.now(),
  })

  const snap = await db.select().from(schema.workflowVersions).where(eq(schema.workflowVersions.id, id)).get()
  return c.json(snap, 201)
})

// ── Run Routes ────────────────────────────────────────────────────────────────

// GET /workflows/:id/runs — last 20 runs
workflows.get('/:id/runs', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflows are a Pro feature', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const runs = await db.select().from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.workflowId, workflow.id))
    .orderBy(desc(schema.workflowRuns.startedAt))
    .limit(20)
    .all()
  return c.json({ runs })
})

// POST /workflows/:id/run — execute the workflow (pro only)
workflows.post('/:id/run', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')
  const userId = c.get('userId')

  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (!org) return c.json({ error: 'Org not found', code: 'NOT_FOUND' }, 404)
  if (org.plan === 'free') return c.json({ error: 'Workflow execution requires Pro plan', code: 'PLAN_LIMIT' }, 402)

  const workflow = await db.select().from(schema.workflows).where(eq(schema.workflows.id, c.req.param('id'))).get()
  if (!workflow) return c.json({ error: 'Workflow not found', code: 'NOT_FOUND' }, 404)
  if (workflow.orgId !== orgId) return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403)

  const body = await c.req.json<{ inputVars?: Record<string, string> }>()
  const inputVars: Record<string, string> = body.inputVars ?? {}

  const runId = crypto.randomUUID()
  const startedAt = Date.now()

  // Create the run row
  await db.insert(schema.workflowRuns).values({
    id: runId,
    workflowId: workflow.id,
    orgId,
    triggeredBy: userId,
    status: 'running',
    inputVars,
    output: null,
    steps: [],
    error: null,
    startedAt,
  })

  let finalStatus: 'completed' | 'failed' = 'completed'
  let finalOutput: string | null = null
  let finalSteps: StepRecord[] = []
  let errorMsg: string | null = null

  try {
    const chatCfg = (org.settings as Record<string, unknown>)?.chat as LLMConfig | undefined
    const secretsCtx = c.env.SESSION_SECRET ? { sessionSecret: c.env.SESSION_SECRET, orgId: c.get('orgId'), userId: c.get('userId') } : undefined
    const result = await executeWorkflow(workflow.definition as WorkflowDefinition, inputVars, db, 0, c.env, chatCfg, secretsCtx)
    finalOutput = result.output
    finalSteps = result.steps
    finalStatus = 'completed'
  } catch (e: unknown) {
    finalStatus = 'failed'
    errorMsg = (e as Error).message
  }

  const completedAt = Date.now()

  // Update run row
  await db.update(schema.workflowRuns).set({
    status: finalStatus,
    output: finalOutput,
    steps: finalSteps,
    error: errorMsg,
    completedAt,
  }).where(eq(schema.workflowRuns.id, runId))

  // Increment workflow runCount
  await db.update(schema.workflows).set({
    runCount: (workflow.runCount ?? 0) + 1,
  }).where(eq(schema.workflows.id, workflow.id))

  c.executionCtx.waitUntil(nrLog(c.env, finalStatus === 'completed' ? 'info' : 'error', 'workflow_run', { workflow_id: workflow.id, org_id: orgId, status: finalStatus }))
  c.executionCtx.waitUntil(nrMetric(c.env, 'skillmesh.workflow.runs', 1, { status: finalStatus }))

  const run = await db.select().from(schema.workflowRuns).where(eq(schema.workflowRuns.id, runId)).get()
  return c.json({ run }, finalStatus === 'completed' ? 200 : 500)
})

export default workflows
export { executeWorkflow }
export type { WorkflowDefinition, StepRecord }
