const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export function getToken(): string | null {
  return localStorage.getItem('raxteam_token')
}

export function setToken(token: string) {
  localStorage.setItem('raxteam_token', token)
}

export function clearToken() {
  localStorage.removeItem('raxteam_token')
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

// Where to send the user after sign-in (survives the OAuth round trip in this tab).
const RETURN_KEY = 'raxteam_return_to'

export function setReturnTo(path: string) {
  sessionStorage.setItem(RETURN_KEY, path)
}

/** One-shot read. Only same-site absolute paths are accepted (no open redirects). */
export function popReturnTo(): string | null {
  const p = sessionStorage.getItem(RETURN_KEY)
  sessionStorage.removeItem(RETURN_KEY)
  return p && p.startsWith('/') && !p.startsWith('//') ? p : null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export type LibraryItem = {
  seoSlug: string
  name: string
  description: string
  tags: string[]
  upvotes: number
  useCount: number
  updatedAt: number
}

export type Skill = {
  id: string
  name: string
  slug: string
  description: string
  promptTemplate: string
  triggers: string[]
  tags: string[]
  visibility: 'private' | 'shared' | 'public'
  status: 'draft' | 'pending' | 'approved' | 'deprecated'
  tokenEstimate: number
  avgTokenSavings: number
  useCount: number
  upvotes: number
  downvotes: number
  version?: string
  authorId?: string
  authorName?: string | null
  createdAt: number
  publishedAt: number | null
}

export type User = {
  id: string
  name: string
  email: string
  role: 'member' | 'curator' | 'admin'
  orgId: string
  lastActiveAt?: number
}

export type Org = {
  id: string
  name: string
  slug: string
  plan: 'free' | 'pro' | 'enterprise'
  trialEndsAt?: number | null
  settings: { approvalThreshold: number; embeddingDim: 384 | 768 }
}

export type ChatEndpointConfig = {
  provider?: 'cloudflare' | 'openai' | 'anthropic' | 'gemini' | 'groq'
  model?: string
  apiKey?: string
  systemPrompt?: string
  chatTitle?: string
  botName?: string
  welcomeMessage?: string
  inputPlaceholder?: string
  accentColor?: string
  showPoweredBy?: boolean
  allowedOrigins?: string
}

export type ChatEndpoint = {
  id: string
  orgId: string
  workflowId?: string | null
  name: string
  token: string
  config: ChatEndpointConfig
  createdAt: number
}

export type OrgSecret = {
  id: string
  name: string
  scope: 'org' | 'user'
  createdAt: number
}

export type SkillAsset = {
  id: string
  skillId: string
  orgId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  r2Key: string
  assetType: 'document' | 'image' | 'script' | 'data'
  chunkCount: number
  createdAt: number
}

export type Invite = {
  id: string
  email: string
  role: string
  token: string
  expiresAt: number
}

export type SkillVersion = {
  id: string
  skillId: string
  version: string
  promptTemplate: string
  changelog: string
  createdAt: number
}

export type SkillTestCase = {
  id: string
  skillId: string
  description: string
  inputVars: Record<string, string>
  expectedOutput: string
  createdAt: number
  lastRun?: EvalResult | null
}

export type EvalResult = {
  id: string
  skillId: string
  testCaseId: string
  skillVersion: string
  rendered: string
  passed: boolean
  score: number | null
  ranAt: number
  description?: string
}

export type ResolveResult =
  | { found: false }
  | { found: true; skill: Skill; score: number }

export type WorkflowNodeData = {
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
}

export type WorkflowNode = {
  id: string
  type: 'input' | 'output' | 'skill' | 'condition' | 'mcp_tool' | 'sub_workflow' | 'note'
  position: { x: number; y: number }
  data: WorkflowNodeData
}

export type WorkflowEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
}

export type WorkflowDefinition = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputSchema?: Array<{ name: string; description: string; required: boolean }>
}

export type Workflow = {
  id: string
  name: string
  description: string
  type: 'orchestrator' | 'supervisor'
  status: 'draft' | 'published'
  version: string
  tags: string[]
  runCount: number
  authorId: string
  definition?: WorkflowDefinition
  createdAt: number
  publishedAt: number | null
}

export type WorkflowVersion = {
  id: string
  workflowId: string
  version: string
  definition: WorkflowDefinition
  changelog: string
  createdAt: number
}

export type WorkflowRun = {
  id: string
  workflowId: string
  status: 'running' | 'completed' | 'failed'
  inputVars: Record<string, string>
  output?: string
  steps: Array<{
    nodeId: string
    nodeType: string
    label: string
    status: 'running' | 'completed' | 'failed' | 'skipped'
    output?: string
    outputType?: 'text' | 'image' | 'audio'
    error?: string
    startedAt: number
    completedAt?: number
  }>
  error?: string
  startedAt: number
  completedAt?: number
}

export const api = {
  me(): Promise<{ user: User; org: Org }> {
    return request('/me')
  },

  updateMe(data: { name: string }): Promise<{ ok: boolean }> {
    return request('/me', { method: 'PATCH', body: JSON.stringify(data) })
  },

  myApiKey(): Promise<{ apiKey: string }> {
    return request('/me/apikey')
  },

  skills: {
    list(params?: { visibility?: string; search?: string; page?: number; limit?: number }): Promise<{ skills: Skill[]; total: number; page: number; limit: number }> {
      const q = new URLSearchParams()
      if (params?.visibility) q.set('visibility', params.visibility)
      if (params?.search) q.set('search', params.search)
      if (params?.page != null) q.set('page', String(params.page))
      if (params?.limit != null) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request(`/skills${qs ? '?' + qs : ''}`)
    },
    get(id: string): Promise<Skill> {
      return request(`/skills/${id}`)
    },
    create(data: Partial<Skill>): Promise<Skill> {
      return request('/skills', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id: string, data: Partial<Skill>): Promise<Skill> {
      return request(`/skills/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/skills/${id}`, { method: 'DELETE' })
    },
    submit(id: string): Promise<{ message: string; skillId: string }> {
      return request(`/skills/${id}/submit`, { method: 'POST' })
    },
    approve(id: string, comment: string): Promise<{ published: boolean; approvalCount: number; threshold: number }> {
      return request(`/skills/${id}/approve`, { method: 'POST', body: JSON.stringify({ comment }) })
    },
    reject(id: string, comment: string): Promise<{ rejected: boolean; comment: string }> {
      return request(`/skills/${id}/reject`, { method: 'POST', body: JSON.stringify({ comment }) })
    },
    revert(id: string): Promise<{ ok: boolean }> {
      return request(`/skills/${id}/revert`, { method: 'POST' })
    },
    unapprove(id: string): Promise<{ ok: boolean; approvalCount: number }> {
      return request(`/skills/${id}/approvals`, { method: 'DELETE' })
    },
    approvalStatus(id: string): Promise<{
      approvalCount: number
      threshold: number
      hasVoted: boolean
      myVote: 'approved' | 'rejected' | null
      votes: Array<{ verdict: string; comment: string; reviewerName: string; isCurrentUser: boolean; createdAt: number }>
    }> {
      return request(`/skills/${id}/approvals`)
    },
  },

  assets: {
    list(skillId: string): Promise<{ assets: SkillAsset[] }> {
      return request(`/skills/${skillId}/assets`)
    },
    upload(skillId: string, file: File): Promise<{ asset: SkillAsset }> {
      const token = getToken()
      const form = new FormData()
      form.append('file', file)
      return fetch(`${API_URL}/skills/${skillId}/assets`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }))
          throw new Error((err as { error?: string }).error ?? res.statusText)
        }
        return res.json()
      })
    },
    delete(skillId: string, assetId: string): Promise<{ ok: boolean }> {
      return request(`/skills/${skillId}/assets/${assetId}`, { method: 'DELETE' })
    },
    async download(skillId: string, assetId: string, fileName: string): Promise<void> {
      const res = await fetch(`${API_URL}/skills/${skillId}/assets/${assetId}/download`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      })
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)
    },
  },

  versions: {
    list(skillId: string): Promise<{ versions: SkillVersion[]; current: string }> {
      return request(`/skills/${skillId}/versions`)
    },
    create(skillId: string, version: string, changelog?: string, promptTemplate?: string): Promise<SkillVersion> {
      return request(`/skills/${skillId}/versions`, { method: 'POST', body: JSON.stringify({ version, changelog, promptTemplate }) })
    },
    promote(skillId: string, version: string): Promise<{ ok: boolean; promoted: string }> {
      return request(`/skills/${skillId}/versions/${version}/promote`, { method: 'POST' })
    },
    remove(skillId: string, version: string): Promise<{ ok: boolean }> {
      return request(`/skills/${skillId}/versions/${version}`, { method: 'DELETE' })
    },
  },

  evals: {
    list(skillId: string): Promise<{ cases: SkillTestCase[]; skillVersion: string }> {
      return request(`/skills/${skillId}/evals`)
    },
    create(skillId: string, data: { description?: string; inputVars?: Record<string, string>; expectedOutput: string }): Promise<SkillTestCase> {
      return request(`/skills/${skillId}/evals`, { method: 'POST', body: JSON.stringify(data) })
    },
    remove(skillId: string, caseId: string): Promise<{ ok: boolean }> {
      return request(`/skills/${skillId}/evals/${caseId}`, { method: 'DELETE' })
    },
    runAll(skillId: string): Promise<{ results: EvalResult[]; passed: number; total: number; version: string }> {
      return request(`/skills/${skillId}/evals/run`, { method: 'POST' })
    },
    runOne(skillId: string, caseId: string): Promise<EvalResult> {
      return request(`/skills/${skillId}/evals/${caseId}/run`, { method: 'POST' })
    },
  },

  members: {
    list(): Promise<{ members: User[] }> {
      return request('/members')
    },
    changeRole(id: string, role: 'member' | 'curator' | 'admin'): Promise<{ ok: boolean }> {
      return request(`/members/${id}`, { method: 'PATCH', body: JSON.stringify({ role }) })
    },
    remove(id: string): Promise<{ ok: boolean }> {
      return request(`/members/${id}`, { method: 'DELETE' })
    },
    changeName(name: string): Promise<{ ok: boolean }> {
      return request('/me', { method: 'PATCH', body: JSON.stringify({ name }) })
    },
    invites: {
      list(): Promise<{ invites: Invite[] }> {
        return request('/members/invites')
      },
      create(email: string, role: string): Promise<{ token: string; inviteUrl: string }> {
        return request('/members/invites', { method: 'POST', body: JSON.stringify({ email, role }) })
      },
      revoke(token: string): Promise<{ ok: boolean }> {
        return request(`/members/invites/${token}`, { method: 'DELETE' })
      },
      lookup(token: string): Promise<{ role: string; orgName: string; token: string }> {
        return request(`/members/invites/lookup/${token}`)
      },
    },
  },

  updateOrg(slug: string, data: { name?: string; approvalThreshold?: number }): Promise<Org> {
    return request(`/orgs/${slug}`, { method: 'PATCH', body: JSON.stringify(data) })
  },

  resolve(query: string): Promise<ResolveResult> {
    return request('/resolve', { method: 'POST', body: JSON.stringify({ query }) })
  },

  logUsage(data: {
    skillId: string | null
    queryText: string
    matchScore: number | null
    tokensUsed: number
    tokensSaved: number
    outcome: 'used' | 'skipped' | 'fallback'
  }): Promise<{ ok: boolean }> {
    return request('/usage', { method: 'POST', body: JSON.stringify(data) })
  },

  billing: {
    order(plan: 'pro_monthly' | 'pro_annual'): Promise<{
      orderId: string; amount: number; currency: string; keyId: string; plan: string
      prefill: { name: string; email: string }
    }> {
      return request('/billing/order', { method: 'POST', body: JSON.stringify({ plan }) })
    },
    verify(data: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; plan: string }): Promise<{ ok: boolean; plan: string }> {
      return request('/billing/verify', { method: 'POST', body: JSON.stringify(data) })
    },
    status(): Promise<{ plan: string; hasPayment: boolean; renewsAt: number | null }> {
      return request('/billing/status')
    },
  },

  loginUrl(invite?: string): string {
    const base = `${API_URL}/auth/github`
    return invite ? `${base}?invite=${invite}` : base
  },

  googleLoginUrl(invite?: string): string {
    const base = `${API_URL}/auth/google`
    return invite ? `${base}?invite=${invite}` : base
  },

  share: {
    generate(skillId: string): Promise<{ shareToken: string }> {
      return request(`/skills/${skillId}/share`, { method: 'POST' })
    },
    revoke(skillId: string): Promise<{ ok: boolean }> {
      return request(`/skills/${skillId}/share`, { method: 'DELETE' })
    },
  },

  public: {
    skills(params?: { page?: number; search?: string; tag?: string; limit?: number }): Promise<{ skills: Skill[]; page: number; limit: number }> {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', String(params.page))
      if (params?.search) q.set('search', params.search)
      if (params?.tag) q.set('tag', params.tag)
      if (params?.limit) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request(`/public/skills${qs ? '?' + qs : ''}`)
    },
    vote(skillId: string, direction: 'up' | 'down'): Promise<{ action: string; direction: string }> {
      return request(`/public/skills/${skillId}/vote`, { method: 'POST', body: JSON.stringify({ direction }) })
    },
    sharedSkill(token: string): Promise<{ skill: Skill }> {
      return request(`/public/s/${token}`)
    },
    library(): Promise<{ skills: LibraryItem[] }> {
      return request('/public/library')
    },
    librarySkill(slug: string): Promise<{ skill: Skill & { seoSlug: string }; related: Array<{ seoSlug: string; name: string; description: string }> }> {
      return request(`/public/library/${encodeURIComponent(slug)}`)
    },
    collabEdit(token: string, data: Partial<Pick<Skill, 'name' | 'description' | 'promptTemplate' | 'tags' | 'triggers'>>): Promise<{ skill: Skill }> {
      return request(`/public/s/${token}`, { method: 'PATCH', body: JSON.stringify(data) })
    },
    submit(data: { name: string; description: string; promptTemplate: string; tags?: string[]; triggers?: string[] }): Promise<{ ok: boolean; id: string; message: string }> {
      return request('/public/submit', { method: 'POST', body: JSON.stringify(data) })
    },
    contact(data: { name: string; email: string; message: string }): Promise<{ ok: boolean; message: string }> {
      return request('/public/contact', { method: 'POST', body: JSON.stringify(data) })
    },
  },

  chat: {
    config(): Promise<{ provider: string; model: string; hasApiKey: boolean; systemPrompt: string; widgetEnabled: boolean; widgetToken: string | null; widgetAllowedOrigins: string; workflowId: string | null; workflowName: string | null; chatTitle: string; botName: string; welcomeMessage: string; inputPlaceholder: string; accentColor: string; showPoweredBy: boolean }> {
      return request('/chat/config')
    },
    updateConfig(data: { provider?: string; model?: string; apiKey?: string; systemPrompt?: string; widgetEnabled?: boolean; widgetAllowedOrigins?: string; regenerateToken?: boolean; workflowId?: string | null; workflowName?: string | null; chatTitle?: string; botName?: string; welcomeMessage?: string; inputPlaceholder?: string; accentColor?: string; showPoweredBy?: boolean }): Promise<{ ok: boolean; widgetToken: string | null; widgetEnabled: boolean }> {
      return request('/chat/config', { method: 'PATCH', body: JSON.stringify(data) })
    },
    send(data: { message: string; history?: Array<{ role: string; content: string }> }): Promise<{ reply: string; skillsUsed: string[]; provider: string; outputType?: 'text' | 'image' | 'audio' }> {
      return request('/chat', { method: 'POST', body: JSON.stringify(data) })
    },
  },

  playground: {
    usage(): Promise<{ requestsUsed: number; requestsRemaining: number; limit: number; isPro: boolean }> {
      return request('/playground/usage')
    },
    run(prompt: string): Promise<{ reply: string; model: string; requestsUsed: number; requestsRemaining: number; limit: number }> {
      return request('/playground/run', { method: 'POST', body: JSON.stringify({ prompt }) })
    },
  },

  secrets: {
    list(): Promise<{ secrets: OrgSecret[] }> {
      return request('/secrets')
    },
    create(data: { name: string; value: string; scope?: 'org' | 'user' }): Promise<OrgSecret> {
      return request('/secrets', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id: string, value: string): Promise<{ ok: boolean }> {
      return request(`/secrets/${id}`, { method: 'PUT', body: JSON.stringify({ value }) })
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/secrets/${id}`, { method: 'DELETE' })
    },
  },

  chatEndpoints: {
    list(): Promise<{ endpoints: ChatEndpoint[] }> {
      return request('/chat-endpoints')
    },
    create(data: { name: string; workflowId?: string; config?: Partial<ChatEndpointConfig> }): Promise<{ endpoint: { id: string; token: string; name: string } }> {
      return request('/chat-endpoints', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id: string, data: { name?: string; workflowId?: string | null; config?: Partial<ChatEndpointConfig>; regenerateToken?: boolean }): Promise<{ ok: boolean; token: string }> {
      return request(`/chat-endpoints/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/chat-endpoints/${id}`, { method: 'DELETE' })
    },
  },

  skillBuilder: {
    upload(file: File): Promise<{ jobId: string; text: string; charCount: number }> {
      const token = getToken()
      const form = new FormData()
      form.append('file', file)
      return fetch(`${API_URL}/skill-builder/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      }).then(async res => {
        if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error((e as {error?:string}).error ?? res.statusText) }
        return res.json()
      })
    },
    fromUrl(url: string): Promise<{ jobId: string; text: string; charCount: number }> {
      return request('/skill-builder/url', { method: 'POST', body: JSON.stringify({ url }) })
    },
    generate(jobId: string, topicFocus?: string): Promise<{ skills: Array<{ name: string; description: string; promptTemplate: string; triggers: string[]; tags: string[] }>; error?: string }> {
      return request('/skill-builder/generate', { method: 'POST', body: JSON.stringify({ jobId, topicFocus }) })
    },
    create(data: { skills: Array<{ name: string; description: string; promptTemplate: string; triggers: string[]; tags: string[] }> }): Promise<{ skills: Array<{ id: string; name: string; slug: string; description: string; status: string }> }> {
      return request('/skill-builder/create', { method: 'POST', body: JSON.stringify(data) })
    },
    buildOrchestrator(data: { skillIds: string[]; goal: string; name: string }): Promise<{ workflow: { id: string; name: string; type: string; status: string } }> {
      return request('/skill-builder/orchestrator', { method: 'POST', body: JSON.stringify(data) })
    },
    buildSupervisor(data: { orchestratorIds: string[]; name: string; description: string }): Promise<{ workflow: { id: string; name: string; type: string; status: string } }> {
      return request('/skill-builder/supervisor', { method: 'POST', body: JSON.stringify(data) })
    },
  },

  workflows: {
    list(params?: { search?: string; page?: number; limit?: number; type?: string }): Promise<{ workflows: Workflow[]; total: number; page: number; limit: number }> {
      const q = new URLSearchParams()
      if (params?.search) q.set('search', params.search)
      if (params?.page != null) q.set('page', String(params.page))
      if (params?.limit != null) q.set('limit', String(params.limit))
      if (params?.type) q.set('type', params.type)
      const qs = q.toString()
      return request(`/workflows${qs ? '?' + qs : ''}`)
    },
    get(id: string): Promise<Workflow> {
      return request(`/workflows/${id}`)
    },
    create(data: { name: string; description: string; type: 'orchestrator' | 'supervisor'; tags: string[]; definition: WorkflowDefinition }): Promise<Workflow> {
      return request('/workflows', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id: string, data: Partial<Pick<Workflow, 'name' | 'description' | 'tags'> & { definition: WorkflowDefinition }>): Promise<Workflow> {
      return request(`/workflows/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    },
    delete(id: string): Promise<{ ok: boolean }> {
      return request(`/workflows/${id}`, { method: 'DELETE' })
    },
    publish(id: string): Promise<{ ok: boolean }> {
      return request(`/workflows/${id}/publish`, { method: 'POST' })
    },
    versions(id: string): Promise<{ versions: WorkflowVersion[] }> {
      return request(`/workflows/${id}/versions`)
    },
    saveVersion(id: string, version: string, changelog: string): Promise<WorkflowVersion> {
      return request(`/workflows/${id}/versions`, { method: 'POST', body: JSON.stringify({ version, changelog }) })
    },
    runs(id: string): Promise<{ runs: WorkflowRun[] }> {
      return request(`/workflows/${id}/runs`)
    },
    run(id: string, inputVars: Record<string, string>): Promise<{ run: WorkflowRun }> {
      return request(`/workflows/${id}/run`, { method: 'POST', body: JSON.stringify({ inputVars }) })
    },
    aiBuild(id: string, prompt: string): Promise<{ definition: WorkflowDefinition }> {
      return request(`/workflows/${id}/ai-build`, { method: 'POST', body: JSON.stringify({ prompt }) })
    },
  },
}
