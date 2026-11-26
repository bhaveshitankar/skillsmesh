# Free Tier Fixes & UX Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Cloudflare free-tier breakages (Queue unavailable, dual Vectorize waste, KV write pressure) and simplify the dashboard UX by merging the Orchestrator and Supervisor builders into one "Workflow Builder" flow with clearer naming.

**Architecture:** The API gets a sync-embed fallback path guarded by `env.EMBED_QUEUE` availability; the Vectorize 768-dim index is written only for Pro orgs. The dashboard collapses `OrchestratorBuilderPage` and `SupervisorBuilderPage` into a single `WorkflowBuilderPage` with a two-step type selector, and sidebar labels are updated to match. KV rate-limit writes for the resolver are moved to a `waitUntil` fire-and-forget so they don't block the response and reduce per-request latency.

**Tech Stack:** Cloudflare Workers (Hono), Cloudflare D1/KV/Vectorize/AI, React 18 + Vite + Tailwind CSS, Turborepo monorepo.

## Global Constraints

- Never introduce new npm dependencies — use only what is already in the project.
- All Hono route changes must keep existing request/response shapes (no breaking API changes).
- TypeScript strict mode — no `any` unless already present in the file being edited.
- Dashboard pages use the existing `api` client from `apps/dashboard/src/lib/api.ts` — do not add new client methods for existing API routes.
- Test commands: `cd apps/api && npx tsc --noEmit` (API type-check), `cd apps/dashboard && npx tsc --noEmit` (dashboard type-check).

---

## File Map

| File | Change |
|------|--------|
| `apps/api/src/lib/embed.ts` | Add `embedSkillSync()` helper that runs embedding + vectorize upsert inline |
| `apps/api/src/routes/approvals.ts` | Replace `EMBED_QUEUE.send()` with `embedSkillSync()` when Queue is unavailable |
| `apps/api/src/routes/resolve.ts` | Move KV rate-limit write into `waitUntil` |
| `apps/api/src/index.ts` | Make `EMBED_QUEUE` optional in `Env.Bindings` type |
| `apps/dashboard/src/pages/WorkflowBuilderPage.tsx` | New unified builder (replaces both Orchestrator + Supervisor pages) |
| `apps/dashboard/src/pages/OrchestratorBuilderPage.tsx` | Replace with redirect to `/workflow-builder` |
| `apps/dashboard/src/pages/SupervisorBuilderPage.tsx` | Replace with redirect to `/workflow-builder` |
| `apps/dashboard/src/components/Layout.tsx` | Merge two sidebar entries into one "Workflow Builder" entry |
| `apps/dashboard/src/App.tsx` | Add `/workflow-builder` route, keep old routes as redirects |

---

### Task 1: Sync-embed fallback in `embed.ts`

**Files:**
- Modify: `apps/api/src/lib/embed.ts`

**Interfaces:**
- Produces: `embedSkillSync(env: EmbedEnv, skill: EmbedSkill): Promise<void>` — embeds the skill and upserts to VECTORIZE_384. Called by Task 2.

- [ ] **Step 1: Open the file and read current content**

  Read `apps/api/src/lib/embed.ts`. Current exports: `generateEmbedding`, `buildEmbeddingText`.

- [ ] **Step 2: Add the sync helper**

  Replace the full content of `apps/api/src/lib/embed.ts` with:

  ```typescript
  import { EMBEDDING_MODEL_FREE } from '@skillmesh/shared'

  export async function generateEmbedding(
    ai: Ai,
    text: string,
    model: string,
  ): Promise<number[]> {
    const result = await ai.run(model as Parameters<Ai['run']>[0], { text: [text] } as never) as { data: number[][] }
    if (!result.data?.[0]) throw new Error('No embedding returned from Workers AI')
    return result.data[0]
  }

  export function buildEmbeddingText(skill: {
    description: string
    triggers: string[]
    tags: string[]
  }): string {
    return [skill.description, ...skill.triggers, ...skill.tags].join(' ')
  }

  export interface EmbedSkill {
    id: string
    orgId: string
    name: string
    visibility: string
    description: string
    triggers: unknown
    tags: unknown
  }

  export interface EmbedEnv {
    AI: Ai
    VECTORIZE_384: VectorizeIndex
  }

  // Runs embedding synchronously — used when EMBED_QUEUE is unavailable (free tier).
  export async function embedSkillSync(env: EmbedEnv, skill: EmbedSkill): Promise<void> {
    const triggers = Array.isArray(skill.triggers) ? (skill.triggers as string[]) : []
    const tags = Array.isArray(skill.tags) ? (skill.tags as string[]) : []
    const text = [skill.description, ...triggers, ...tags].join(' ')
    const vector = await generateEmbedding(env.AI, text, EMBEDDING_MODEL_FREE)
    await env.VECTORIZE_384.upsert([{
      id: skill.id,
      values: vector,
      metadata: { orgId: skill.orgId, name: skill.name, visibility: skill.visibility },
    }])
  }
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/api/tsconfig.json --noEmit 2>&1 | head -30
  ```

  Expected: no errors in `lib/embed.ts`.

- [ ] **Step 4: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/api/src/lib/embed.ts
  git -C /Users/bitankar/EAA/skillmesh commit -m "feat: add embedSkillSync helper for free-tier fallback"
  ```

---

### Task 2: Queue fallback in `approvals.ts`

**Files:**
- Modify: `apps/api/src/routes/approvals.ts`

**Interfaces:**
- Consumes: `embedSkillSync(env, skill): Promise<void>` from `../lib/embed` (Task 1)
- The approval route currently calls `c.env.EMBED_QUEUE.send(...)` for free-tier skills. Replace this with a try/catch that falls back to `embedSkillSync` when the Queue binding throws or is absent.

- [ ] **Step 1: Read current approvals route**

  Open `apps/api/src/routes/approvals.ts`. Find the block around line 165:
  ```typescript
  await c.env.EMBED_QUEUE.send({ skillId, orgId: skill.orgId })
  ```
  Note the surrounding `if (isPro) { ... } else { ... }` structure.

- [ ] **Step 2: Update the import**

  At the top of `apps/api/src/routes/approvals.ts`, change:
  ```typescript
  import { generateEmbedding, buildEmbeddingText } from '../lib/embed'
  ```
  to:
  ```typescript
  import { generateEmbedding, buildEmbeddingText, embedSkillSync } from '../lib/embed'
  ```

- [ ] **Step 3: Replace the queue send with a fallback**

  Find:
  ```typescript
      } else {
        await c.env.EMBED_QUEUE.send({ skillId, orgId: skill.orgId })
      }
  ```

  Replace with:
  ```typescript
      } else {
        try {
          await c.env.EMBED_QUEUE.send({ skillId, orgId: skill.orgId })
        } catch {
          // Queue unavailable on Cloudflare free tier — embed synchronously instead.
          const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
          if (skill) {
            await embedSkillSync(c.env, skill as import('../lib/embed').EmbedSkill)
          }
        }
      }
  ```

- [ ] **Step 4: Make `EMBED_QUEUE` optional in the route's env type**

  Find the `ApprovalEnv` type in `approvals.ts`:
  ```typescript
    EMBED_QUEUE: Queue
  ```
  Change to:
  ```typescript
    EMBED_QUEUE: Queue | undefined
  ```

- [ ] **Step 5: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/api/tsconfig.json --noEmit 2>&1 | head -30
  ```

  Expected: no new errors.

- [ ] **Step 6: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/api/src/routes/approvals.ts
  git -C /Users/bitankar/EAA/skillmesh commit -m "fix: fall back to sync embed when Queue is unavailable (free tier)"
  ```

---

### Task 3: Make `EMBED_QUEUE` optional in global `Env` type

**Files:**
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- The global `Env` type is used by all routes via context. Marking `EMBED_QUEUE` optional prevents TypeScript errors when it's absent at runtime.

- [ ] **Step 1: Edit the Bindings type**

  In `apps/api/src/index.ts`, find:
  ```typescript
    EMBED_QUEUE: Queue
  ```
  Change to:
  ```typescript
    EMBED_QUEUE: Queue | undefined
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/api/tsconfig.json --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/api/src/index.ts
  git -C /Users/bitankar/EAA/skillmesh commit -m "fix: mark EMBED_QUEUE as optional for free-tier compatibility"
  ```

---

### Task 4: Move resolver KV write into `waitUntil`

**Files:**
- Modify: `apps/api/src/routes/resolve.ts`

**Goal:** The resolver currently writes the monthly rate-limit counter synchronously before generating the embedding. Moving the write to `waitUntil` means the actual AI call starts immediately, reducing P50 latency by one KV round-trip (~10–30ms). It also reduces sequential KV writes during bursty free-tier usage.

- [ ] **Step 1: Read the rate-limit block**

  In `apps/api/src/routes/resolve.ts`, lines ~47–52:
  ```typescript
    const monthKey = `rate:resolve:${orgId}:${new Date().toISOString().slice(0, 7)}`
    const current = parseInt((await c.env.KV.get(monthKey)) ?? '0')
    if (current >= FREE_TIER_MAX_RESOLVER_CALLS_PER_MONTH) {
      return c.json({ error: 'Monthly resolver limit reached. Upgrade to Pro for unlimited calls.', code: 'PLAN_LIMIT' }, 402)
    }
    await c.env.KV.put(monthKey, String(current + 1), { expirationTtl: 60 * 60 * 24 * 35 })
  ```

- [ ] **Step 2: Move the write to `waitUntil`**

  Replace those lines with:
  ```typescript
    const monthKey = `rate:resolve:${orgId}:${new Date().toISOString().slice(0, 7)}`
    const current = parseInt((await c.env.KV.get(monthKey)) ?? '0')
    if (current >= FREE_TIER_MAX_RESOLVER_CALLS_PER_MONTH) {
      return c.json({ error: 'Monthly resolver limit reached. Upgrade to Pro for unlimited calls.', code: 'PLAN_LIMIT' }, 402)
    }
    // Write the incremented count after the check passes, without blocking the embedding call.
    c.executionCtx.waitUntil(
      c.env.KV.put(monthKey, String(current + 1), { expirationTtl: 60 * 60 * 24 * 35 })
    )
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/api/tsconfig.json --noEmit 2>&1 | head -30
  ```

  Expected: no errors. (`c.executionCtx` is already available in Hono's Cloudflare Workers context.)

- [ ] **Step 4: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/api/src/routes/resolve.ts
  git -C /Users/bitankar/EAA/skillmesh commit -m "perf: defer resolver KV rate-limit write to waitUntil"
  ```

---

### Task 5: Unified `WorkflowBuilderPage` in the dashboard

**Files:**
- Create: `apps/dashboard/src/pages/WorkflowBuilderPage.tsx`

**Goal:** One page replaces both `OrchestratorBuilderPage` and `SupervisorBuilderPage`. Step 1 asks "What kind of workflow?" (Chain skills → Orchestrator / Route between workflows → Supervisor/Router). Steps 2 and 3 mirror the existing builder steps for the selected type. The page calls the same existing API methods (`api.skillBuilder.buildOrchestrator` / `api.skillBuilder.buildSupervisor`).

- [ ] **Step 1: Create the file**

  Create `apps/dashboard/src/pages/WorkflowBuilderPage.tsx`:

  ```tsx
  import { useState, useEffect } from 'react'
  import { Link, useNavigate } from 'react-router-dom'
  import { api, type Org, type Skill, type Workflow } from '../lib/api'

  type WorkflowType = 'orchestrator' | 'router'

  export default function WorkflowBuilderPage() {
    const navigate = useNavigate()
    const [org, setOrg] = useState<Org | null>(null)
    const [step, setStep] = useState(0) // 0 = type select, 1 = select items, 2 = name+build, 3 = done

    // Type selection
    const [workflowType, setWorkflowType] = useState<WorkflowType | null>(null)

    // Orchestrator inputs
    const [skills, setSkills] = useState<Skill[]>([])
    const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set())
    const [goal, setGoal] = useState('')

    // Router (supervisor) inputs
    const [orchestrators, setOrchestrators] = useState<Workflow[]>([])
    const [selectedOrchestratorIds, setSelectedOrchestratorIds] = useState<Set<string>>(new Set())
    const [description, setDescription] = useState('')

    // Shared
    const [search, setSearch] = useState('')
    const [name, setName] = useState('')
    const [building, setBuilding] = useState(false)
    const [buildError, setBuildError] = useState('')
    const [createdWorkflow, setCreatedWorkflow] = useState<{ id: string; name: string } | null>(null)

    const isPro = !!(org && (
      org.plan === 'pro' || org.plan === 'enterprise' ||
      (org.trialEndsAt && org.trialEndsAt > Date.now())
    ))

    useEffect(() => {
      api.me().then(({ org }) => setOrg(org)).catch(() => {})
      api.skills.list({ limit: 200 }).then(r => setSkills(r.skills)).catch(() => {})
      api.workflows.list({ type: 'orchestrator', limit: 200 }).then(r => setOrchestrators(r.workflows)).catch(() => {})
    }, [])

    function toggleSkill(id: string) {
      setSelectedSkillIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    }

    function toggleOrchestrator(id: string) {
      setSelectedOrchestratorIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    }

    async function handleBuild() {
      setBuildError(''); setBuilding(true)
      try {
        let res: { workflow: { id: string; name: string } }
        if (workflowType === 'orchestrator') {
          if (selectedSkillIds.size === 0 || !goal.trim()) return
          res = await api.skillBuilder.buildOrchestrator({
            skillIds: [...selectedSkillIds],
            goal,
            name: name || `${goal.slice(0, 40)} Orchestrator`,
          })
        } else {
          if (selectedOrchestratorIds.size === 0 || !name.trim()) return
          res = await api.skillBuilder.buildSupervisor({
            orchestratorIds: [...selectedOrchestratorIds],
            name,
            description,
          })
        }
        setCreatedWorkflow(res.workflow)
        setStep(3)
      } catch (err: unknown) {
        setBuildError((err as Error).message || 'Build failed')
      } finally {
        setBuilding(false)
      }
    }

    if (!isPro) {
      return (
        <div className="p-8 max-w-lg mx-auto text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow Builder</h1>
          <p className="text-gray-500 mb-6">Workflow Builder is a Pro feature.</p>
          <Link to="/upgrade" className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-500 transition">
            Upgrade to Pro
          </Link>
        </div>
      )
    }

    // Step 0: Choose type
    if (step === 0) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow Builder</h1>
          <p className="text-gray-500 mb-8">What kind of workflow do you want to build?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => { setWorkflowType('orchestrator'); setStep(1) }}
              className="text-left p-6 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition group"
            >
              <div className="text-2xl mb-3">⛓️</div>
              <h2 className="font-semibold text-gray-900 text-lg mb-1">Chain Skills</h2>
              <p className="text-sm text-gray-500">Pick a set of skills and describe a goal — AI wires them into a workflow.</p>
            </button>
            <button
              onClick={() => { setWorkflowType('router'); setStep(1) }}
              className="text-left p-6 border-2 border-gray-200 rounded-xl hover:border-brand-500 hover:bg-brand-50 transition group"
            >
              <div className="text-2xl mb-3">🔀</div>
              <h2 className="font-semibold text-gray-900 text-lg mb-1">Route Between Workflows</h2>
              <p className="text-sm text-gray-500">Pick existing workflows — AI builds a router that classifies requests and sends them to the right one.</p>
            </button>
          </div>
        </div>
      )
    }

    // Step 1: Select skills or orchestrators
    if (step === 1) {
      const isOrchestrator = workflowType === 'orchestrator'
      const filteredSkills = skills.filter(s =>
        !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description?.toLowerCase().includes(search.toLowerCase())
      )
      const filteredOrchestrators = orchestrators.filter(w =>
        !search || w.name.toLowerCase().includes(search.toLowerCase())
      )
      const items = isOrchestrator ? filteredSkills : filteredOrchestrators
      const selectedIds = isOrchestrator ? selectedSkillIds : selectedOrchestratorIds
      const toggle = isOrchestrator ? toggleSkill : toggleOrchestrator

      return (
        <div className="p-8 max-w-2xl mx-auto">
          <button onClick={() => setStep(0)} className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 mb-1">
            {isOrchestrator ? 'Select skills to chain' : 'Select workflows to route between'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isOrchestrator ? 'Choose skills that work together toward your goal.' : 'Choose the orchestrator workflows this router will direct requests to.'}
          </p>
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
            {items.map((item) => {
              const checked = selectedIds.has(item.id)
              return (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id)}
                  className={`w-full text-left p-3 rounded-lg border transition text-sm ${checked ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="font-medium text-gray-900">{item.name}</span>
                  {'description' in item && item.description && (
                    <span className="text-gray-400 ml-2">{(item.description as string).slice(0, 80)}</span>
                  )}
                </button>
              )
            })}
            {items.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">
                {isOrchestrator ? 'No approved skills found. Create and approve a skill first.' : 'No orchestrators found. Build a "Chain Skills" workflow first.'}
              </p>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">{selectedIds.size} selected</span>
            <button
              onClick={() => setStep(2)}
              disabled={selectedIds.size === 0}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-brand-500 transition"
            >
              Next →
            </button>
          </div>
        </div>
      )
    }

    // Step 2: Name + build
    if (step === 2) {
      const isOrchestrator = workflowType === 'orchestrator'
      const canBuild = isOrchestrator
        ? (selectedSkillIds.size > 0 && goal.trim())
        : (selectedOrchestratorIds.size > 0 && name.trim())

      return (
        <div className="p-8 max-w-2xl mx-auto">
          <button onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 mb-6 flex items-center gap-1">
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900 mb-6">
            {isOrchestrator ? 'Describe the goal' : 'Name your router'}
          </h1>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workflow name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={isOrchestrator ? 'e.g. PR Review Pipeline' : 'e.g. Support Router'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {isOrchestrator && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Goal <span className="text-red-400">*</span></label>
                <textarea
                  value={goal}
                  onChange={e => setGoal(e.target.value)}
                  placeholder="Describe what this workflow should accomplish in plain English..."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            )}
            {!isOrchestrator && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What kinds of requests will this router handle?"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
            )}
          </div>
          {buildError && <p className="text-red-500 text-sm mt-4">{buildError}</p>}
          <div className="mt-6">
            <button
              onClick={handleBuild}
              disabled={!canBuild || building}
              className="w-full px-5 py-3 bg-brand-600 text-white rounded-lg font-semibold disabled:opacity-40 hover:bg-brand-500 transition"
            >
              {building ? 'Building…' : '✨ Build with AI'}
            </button>
          </div>
        </div>
      )
    }

    // Step 3: Done
    return (
      <div className="p-8 max-w-2xl mx-auto text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Workflow built!</h1>
        <p className="text-gray-500 mb-6">Your workflow is saved as a draft. Open it in the editor to review and publish.</p>
        {createdWorkflow && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate(`/workflows/${createdWorkflow.id}`)}
              className="px-5 py-2.5 bg-brand-600 text-white rounded-lg font-semibold hover:bg-brand-500 transition"
            >
              Open in editor
            </button>
            <Link to="/workflows" className="px-5 py-2.5 border border-gray-200 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition">
              All workflows
            </Link>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/dashboard/tsconfig.json --noEmit 2>&1 | head -40
  ```

  Expected: no errors in `WorkflowBuilderPage.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/dashboard/src/pages/WorkflowBuilderPage.tsx
  git -C /Users/bitankar/EAA/skillmesh commit -m "feat: add unified WorkflowBuilderPage replacing separate orchestrator/supervisor builders"
  ```

---

### Task 6: Wire the new page into the router and redirect old pages

**Files:**
- Modify: `apps/dashboard/src/App.tsx`
- Modify: `apps/dashboard/src/pages/OrchestratorBuilderPage.tsx`
- Modify: `apps/dashboard/src/pages/SupervisorBuilderPage.tsx`

- [ ] **Step 1: Add the new route in `App.tsx`**

  In `apps/dashboard/src/App.tsx`, find the existing import for `OrchestratorBuilderPage` and add the new import next to it:

  ```tsx
  import WorkflowBuilderPage from './pages/WorkflowBuilderPage'
  ```

  Then find the route for `/orchestrator-builder` and add a new route before it:

  ```tsx
  <Route path="/workflow-builder" element={<WorkflowBuilderPage />} />
  ```

- [ ] **Step 2: Replace `OrchestratorBuilderPage` with a redirect**

  Replace the entire content of `apps/dashboard/src/pages/OrchestratorBuilderPage.tsx` with:

  ```tsx
  import { Navigate } from 'react-router-dom'
  export default function OrchestratorBuilderPage() {
    return <Navigate to="/workflow-builder" replace />
  }
  ```

- [ ] **Step 3: Replace `SupervisorBuilderPage` with a redirect**

  Replace the entire content of `apps/dashboard/src/pages/SupervisorBuilderPage.tsx` with:

  ```tsx
  import { Navigate } from 'react-router-dom'
  export default function SupervisorBuilderPage() {
    return <Navigate to="/workflow-builder" replace />
  }
  ```

- [ ] **Step 4: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/dashboard/tsconfig.json --noEmit 2>&1 | head -40
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/dashboard/src/App.tsx apps/dashboard/src/pages/OrchestratorBuilderPage.tsx apps/dashboard/src/pages/SupervisorBuilderPage.tsx
  git -C /Users/bitankar/EAA/skillmesh commit -m "feat: route /workflow-builder, redirect old orchestrator/supervisor builder URLs"
  ```

---

### Task 7: Update the sidebar to consolidate nav entries

**Files:**
- Modify: `apps/dashboard/src/components/Layout.tsx`

- [ ] **Step 1: Read the current sidebar nav**

  In `apps/dashboard/src/components/Layout.tsx`, find the Pro nav section. Lines around 79–80:
  ```tsx
  { to: '/orchestrator-builder', end: false, label: 'Orchestrator', badge: 'PRO', icon: <path ... /> },
  { to: '/supervisor-builder', end: false, label: 'Supervisor', badge: 'PRO', icon: <path ... /> },
  ```

- [ ] **Step 2: Replace two entries with one**

  Replace those two lines with a single entry:
  ```tsx
  { to: '/workflow-builder', end: false, label: 'Workflow Builder', badge: 'PRO', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" /> },
  ```

- [ ] **Step 3: Type-check**

  ```bash
  cd /Users/bitankar/EAA/skillmesh && npx tsc -p apps/dashboard/tsconfig.json --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git -C /Users/bitankar/EAA/skillmesh add apps/dashboard/src/components/Layout.tsx
  git -C /Users/bitankar/EAA/skillmesh commit -m "ux: merge Orchestrator and Supervisor nav items into Workflow Builder"
  ```

---

## Self-Review Checklist

### Spec coverage

| Requirement | Task |
|-------------|------|
| Queue fallback for free tier | Tasks 1, 2 |
| `EMBED_QUEUE` optional in types | Task 3 |
| KV write non-blocking | Task 4 |
| Unified Workflow Builder page | Task 5 |
| Old URLs redirect to new | Task 6 |
| Sidebar consolidated | Task 7 |

### Placeholder scan
- No TBDs, TODOs, or placeholder strings present.

### Type consistency
- `embedSkillSync(env: EmbedEnv, skill: EmbedSkill)` defined in Task 1, imported in Task 2.
- `WorkflowBuilderPage` uses `api.skillBuilder.buildOrchestrator` and `api.skillBuilder.buildSupervisor` — both exist in `apps/dashboard/src/lib/api.ts` lines 559, 561.
- `api.workflows.list({ type: 'orchestrator' })` matches existing signature at line 579.

---
