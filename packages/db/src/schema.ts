import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: text('plan', { enum: ['free', 'pro', 'enterprise'] }).notNull().default('free'),
  settings: text('settings', { mode: 'json' }).$type<{
    approvalThreshold: number
    embeddingDim: 384 | 768
    byokEndpoint?: string
    chat?: {
      provider: 'cloudflare' | 'openai' | 'anthropic' | 'gemini' | 'groq'
      model?: string
      apiKey?: string
      systemPrompt?: string
      widgetEnabled?: boolean
      widgetToken?: string
      widgetAllowedOrigins?: string
    }
  }>().notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  trialEndsAt: integer('trial_ends_at'),
  createdAt: integer('created_at', ).notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  role: text('role', { enum: ['member', 'curator', 'admin'] }).notNull().default('member'),
  apiKey: text('api_key').notNull().unique(),
  githubId: text('github_id').unique(),
  googleId: text('google_id').unique(),
  lastActiveAt: integer('last_active_at', ).notNull(),
})

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  authorId: text('author_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  version: text('version').notNull().default('1.0.0'),
  description: text('description').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  toolsRequired: text('tools_required', { mode: 'json' }).$type<string[]>().notNull().default([]),
  triggers: text('triggers', { mode: 'json' }).$type<string[]>().notNull().default([]),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  visibility: text('visibility', { enum: ['private', 'shared', 'public'] }).notNull().default('private'),
  status: text('status', { enum: ['draft', 'pending', 'approved', 'deprecated'] }).notNull().default('draft'),
  tokenEstimate: integer('token_estimate').notNull().default(0),
  avgTokenSavings: real('avg_token_savings').notNull().default(0),
  useCount: integer('use_count').notNull().default(0),
  upvotes: integer('upvotes').notNull().default(0),
  downvotes: integer('downvotes').notNull().default(0),
  shareToken: text('share_token').unique(),
  createdAt: integer('created_at', ).notNull(),
  publishedAt: integer('published_at', ),
  deprecatedAt: integer('deprecated_at', ),
  mcpTools: text('mcp_tools', { mode: 'json' }).$type<Array<{
    name: string
    serverUrl: string
    toolName: string
    description: string
    authHeader?: string
  }>>().notNull().default([]),
}, t => ({
  orgStatusIdx: index('skills_org_status_idx').on(t.orgId, t.status),
  visibilityStatusIdx: index('skills_visibility_status_idx').on(t.visibility, t.status),
}))

export const skillVersions = sqliteTable('skill_versions', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  version: text('version').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  changelog: text('changelog').notNull().default(''),
  createdAt: integer('created_at', ).notNull(),
})

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  reviewerId: text('reviewer_id').notNull().references(() => users.id),
  verdict: text('verdict', { enum: ['approved', 'rejected'] }).notNull(),
  comment: text('comment').notNull().default(''),
  createdAt: integer('created_at', ).notNull(),
})

export const ciChecks = sqliteTable('ci_checks', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  checkType: text('check_type', { enum: ['schema', 'safety', 'token_test', 'similarity'] }).notNull(),
  status: text('status', { enum: ['pass', 'fail', 'warn'] }).notNull(),
  output: text('output').notNull(),
  ranAt: integer('ran_at', ).notNull(),
})

export const usageEvents = sqliteTable('usage_events', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').references(() => skills.id),
  userId: text('user_id').notNull().references(() => users.id),
  orgId: text('org_id').notNull().references(() => orgs.id),
  matchedAt: integer('matched_at', ).notNull(),
  queryText: text('query_text').notNull(),
  matchScore: real('match_score'),
  tokensUsed: integer('tokens_used'),
  tokensSaved: integer('tokens_saved'),
  outcome: text('outcome', { enum: ['used', 'skipped', 'fallback'] }).notNull(),
}, t => ({
  orgIdx: index('usage_events_org_idx').on(t.orgId),
  userIdx: index('usage_events_user_idx').on(t.userId),
}))

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  email: text('email').notNull(),
  role: text('role', { enum: ['member', 'curator', 'admin'] }).notNull().default('member'),
  token: text('token').notNull().unique(),
  invitedBy: text('invited_by').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
  acceptedAt: integer('accepted_at'),
}, t => ({
  tokenIdx: index('invites_token_idx').on(t.token),
}))

// Premium: files/images/scripts attached to a skill
export const skillAssets = sqliteTable('skill_assets', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  orgId: text('org_id').notNull().references(() => orgs.id),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  r2Key: text('r2_key').notNull(),
  assetType: text('asset_type', { enum: ['document', 'image', 'script', 'data'] }).notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
})

// RAG chunks extracted from skill assets (text/script content)
export const skillChunks = sqliteTable('skill_chunks', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  assetId: text('asset_id').notNull().references(() => skillAssets.id),
  orgId: text('org_id').notNull().references(() => orgs.id),
  content: text('content').notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  vectorId: text('vector_id'),
  createdAt: integer('created_at').notNull(),
})

export const orgShares = sqliteTable('org_shares', {
  id: text('id').primaryKey(),
  fromOrgId: text('from_org_id').notNull().references(() => orgs.id),
  toOrgId: text('to_org_id').notNull().references(() => orgs.id),
  skillId: text('skill_id').notNull().references(() => skills.id),
  grantedAt: integer('granted_at', ).notNull(),
}, t => ({
  toOrgIdx: index('org_shares_to_org_idx').on(t.toOrgId),
}))

// Eval test cases — expected inputs/outputs for a skill
export const skillTestCases = sqliteTable('skill_test_cases', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  description: text('description').notNull().default(''),
  inputVars: text('input_vars', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  expectedOutput: text('expected_output').notNull(),
  createdAt: integer('created_at').notNull(),
})

// Eval run results — one row per (test case, skill version) run
export const skillEvalRuns = sqliteTable('skill_eval_runs', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  testCaseId: text('test_case_id').notNull().references(() => skillTestCases.id),
  skillVersion: text('skill_version').notNull(),
  rendered: text('rendered').notNull(),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  score: real('score'),
  ranAt: integer('ran_at').notNull(),
}, t => ({
  skillRanAtIdx: index('skill_eval_runs_skill_ran_idx').on(t.skillId, t.ranAt),
}))

// Votes on public skills — one vote per identity per skill
export const skillVotes = sqliteTable('skill_votes', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  // userId if logged in, else fingerprint (IP+UA hash stored by API)
  voterId: text('voter_id').notNull(),
  direction: text('direction', { enum: ['up', 'down'] }).notNull(),
  createdAt: integer('created_at').notNull(),
})

// Skill-level donations — Stripe one-time, 10% platform / 90% creator
export const skillDonations = sqliteTable('skill_donations', {
  id: text('id').primaryKey(),
  skillId: text('skill_id').notNull().references(() => skills.id),
  donorEmail: text('donor_email'),
  amountCents: integer('amount_cents').notNull(),
  platformFeeCents: integer('platform_fee_cents').notNull(),
  creatorPayoutCents: integer('creator_payout_cents').notNull(),
  stripeSessionId: text('stripe_session_id').notNull(),
  status: text('status', { enum: ['pending', 'completed', 'failed'] }).notNull().default('pending'),
  createdAt: integer('created_at').notNull(),
})

// ── Workflows (Orchestrators & Supervisors) ───────────────────────────────────

type WorkflowNodeData = {
  label?: string
  description?: string
  // skill node
  skillId?: string
  skillName?: string
  // condition node
  condition?: string  // JS expression evaluated against context vars
  // mcp_tool node
  mcpServerUrl?: string
  mcpTool?: string
  mcpHeaders?: Record<string, string>
  mcpInput?: string  // template with {{vars}}
  // sub-workflow node
  workflowId?: string
  workflowName?: string
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

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  authorId: text('author_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type', { enum: ['orchestrator', 'supervisor'] }).notNull().default('orchestrator'),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  version: text('version').notNull().default('1.0.0'),
  definition: text('definition', { mode: 'json' }).$type<WorkflowDefinition>().notNull().default({ nodes: [], edges: [] }),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  publishedAt: integer('published_at'),
}, t => ({
  orgIdx: index('workflows_org_idx').on(t.orgId),
}))

export const workflowVersions = sqliteTable('workflow_versions', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id),
  version: text('version').notNull(),
  definition: text('definition', { mode: 'json' }).$type<WorkflowDefinition>().notNull(),
  changelog: text('changelog').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export const orgSecrets = sqliteTable('org_secrets', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  userId: text('user_id').references(() => users.id),
  scope: text('scope', { enum: ['org', 'user'] }).notNull().default('org'),
  name: text('name').notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: integer('created_at').notNull(),
}, t => ({
  orgNameIdx: index('org_secrets_org_name_idx').on(t.orgId, t.name),
}))

type ChatEndpointConfig = {
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

export const chatEndpoints = sqliteTable('chat_endpoints', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull().references(() => orgs.id),
  workflowId: text('workflow_id'),
  name: text('name').notNull(),
  token: text('token').notNull(),
  config: text('config', { mode: 'json' }).notNull().$type<ChatEndpointConfig>().default({}),
  createdAt: integer('created_at').notNull(),
}, t => ({
  orgIdx: index('chat_endpoints_org_idx').on(t.orgId),
  tokenIdx: index('chat_endpoints_token_idx').on(t.token),
}))

export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(),
  workflowId: text('workflow_id').notNull().references(() => workflows.id),
  orgId: text('org_id').notNull().references(() => orgs.id),
  triggeredBy: text('triggered_by').notNull().references(() => users.id),
  status: text('status', { enum: ['running', 'completed', 'failed'] }).notNull().default('running'),
  inputVars: text('input_vars', { mode: 'json' }).$type<Record<string, string>>().notNull().default({}),
  output: text('output'),
  steps: text('steps', { mode: 'json' }).$type<Array<{
    nodeId: string
    nodeType: string
    label: string
    status: 'running' | 'completed' | 'failed' | 'skipped'
    output?: string
    error?: string
    startedAt: number
    completedAt?: number
  }>>().notNull().default([]),
  error: text('error'),
  startedAt: integer('started_at').notNull(),
  completedAt: integer('completed_at'),
}, t => ({
  workflowIdx: index('workflow_runs_workflow_idx').on(t.workflowId),
  orgIdx: index('workflow_runs_org_idx').on(t.orgId),
}))

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
})
