const DEFAULT_API_URL = 'https://api.raxteam.com'

export interface Skill {
  id: string
  name: string
  description: string
  promptTemplate: string
  triggers: string[]
  tags: string[]
  visibility: string
  status: string
  tokenEstimate: number
  useCount: number
}

export interface RagChunk {
  content: string
  chunkIndex: number
  fileName: string
  score: number
}

export interface ResolveSkillResponse {
  found: boolean
  match?: {
    skill: Skill
    score: number
  }
  topCandidates: Array<{ skill: Skill; score: number }>
  ragContext?: RagChunk[]
}

export class SkillMeshClient {
  private apiKey: string
  private baseUrl: string

  constructor(apiKey: string, baseUrl = DEFAULT_API_URL) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  private async fetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers as Record<string, string> ?? {}),
      },
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string }
      throw new Error(`SkillMesh API error ${res.status}: ${err.error}`)
    }
    return res.json() as Promise<T>
  }

  resolveSkill(query: string): Promise<ResolveSkillResponse> {
    return this.fetch<ResolveSkillResponse>('/resolve', {
      method: 'POST',
      body: JSON.stringify({ query }),
    })
  }

  listSkills(visibility?: string): Promise<{ skills: Skill[] }> {
    const q = visibility ? `?visibility=${visibility}` : ''
    return this.fetch<{ skills: Skill[] }>(`/skills${q}`)
  }

  submitSkill(skill: {
    name: string
    description: string
    promptTemplate: string
    triggers: string[]
    tags: string[]
    toolsRequired: string[]
    tokenEstimate: number
    visibility?: 'private' | 'shared' | 'public'
  }): Promise<{ id: string; status: string }> {
    return this.fetch('/skills', { method: 'POST', body: JSON.stringify(skill) })
  }

  logUsage(event: {
    skillId?: string | null
    queryText: string
    matchScore?: number | null
    tokensUsed?: number
    tokensSaved?: number
    outcome: 'used' | 'skipped' | 'fallback'
  }): Promise<void> {
    return this.fetch('/usage', { method: 'POST', body: JSON.stringify(event) })
  }
}
