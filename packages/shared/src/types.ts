export type Plan = 'free' | 'pro' | 'enterprise'
export type SkillStatus = 'draft' | 'pending' | 'approved' | 'deprecated'
export type Visibility = 'private' | 'shared' | 'public'
export type Role = 'member' | 'curator' | 'admin'
export type CICheckType = 'schema' | 'safety' | 'token_test' | 'similarity'
export type CICheckStatus = 'pass' | 'fail' | 'warn'
export type UsageOutcome = 'used' | 'skipped' | 'fallback'

export interface OrgSettings {
  approvalThreshold: number
  embeddingDim: 384 | 768
  byokEndpoint?: string
}

export interface Org {
  id: string
  name: string
  slug: string
  plan: Plan
  settings: OrgSettings
  createdAt: number
}

export interface User {
  id: string
  email: string
  name: string
  orgId: string
  role: Role
  apiKey: string
  lastActiveAt: number
}

export interface Skill {
  id: string
  orgId: string
  authorId: string
  name: string
  slug: string
  version: string
  description: string
  promptTemplate: string
  toolsRequired: string[]
  triggers: string[]
  tags: string[]
  visibility: Visibility
  status: SkillStatus
  tokenEstimate: number
  avgTokenSavings: number
  useCount: number
  createdAt: number
  publishedAt?: number
  deprecatedAt?: number
}

export interface SkillMatch {
  skill: Skill
  score: number
}

export interface RagChunk {
  content: string
  chunkIndex: number
  fileName: string
  score: number
}

export interface ResolveSkillResponse {
  found: boolean
  match?: SkillMatch
  topCandidates: SkillMatch[]
  ragContext?: RagChunk[]  // premium: relevant chunks from skill assets
}

export interface CICheckResult {
  checkType: CICheckType
  status: CICheckStatus
  output: string
}

export interface CIRunResult {
  passed: boolean
  checks: CICheckResult[]
}

export interface ApiError {
  error: string
  code: string
}
