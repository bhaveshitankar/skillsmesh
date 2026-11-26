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

// Calls Jina AI embeddings API — free tier: 1M tokens on sign-up, 100K TPM ongoing.
// Uses Matryoshka at 384 dims so vectors are drop-in compatible with the skills-384 index.
export async function generateEmbeddingJina(
  apiKey: string,
  text: string,
): Promise<number[]> {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      dimensions: 384,
      input: [text],
      task: 'retrieval.query',
    }),
  })
  if (!res.ok) throw new Error(`Jina API error: ${res.status}`)
  const json = await res.json() as { data: Array<{ embedding: number[] }> }
  const vector = json.data?.[0]?.embedding
  if (!vector?.length) throw new Error('No embedding returned from Jina')
  return vector
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
  JINA_API_KEY?: string
}

// Tries providers in order, falling back on any error:
//   1. Jina AI (free 10M tokens, 384-dim Matryoshka — no Workers AI neurons used)
//   2. Cloudflare Workers AI BGE-small (384-dim, always available)
export async function generateEmbeddingWithFallback(
  env: { AI: Ai; JINA_API_KEY?: string },
  text: string,
): Promise<number[]> {
  if (env.JINA_API_KEY) {
    try {
      return await generateEmbeddingJina(env.JINA_API_KEY, text)
    } catch {
      // Jina exhausted or unavailable — fall through to Workers AI
    }
  }
  return generateEmbedding(env.AI, text, EMBEDDING_MODEL_FREE)
}

// Runs embedding synchronously — used when EMBED_QUEUE is unavailable (free tier).
export async function embedSkillSync(env: EmbedEnv, skill: EmbedSkill): Promise<void> {
  const triggers = Array.isArray(skill.triggers) ? (skill.triggers as string[]) : []
  const tags = Array.isArray(skill.tags) ? (skill.tags as string[]) : []
  const text = [skill.description, ...triggers, ...tags].join(' ')
  const vector = await generateEmbeddingWithFallback(env, text)
  await env.VECTORIZE_384.upsert([{
    id: skill.id,
    values: vector,
    metadata: { orgId: skill.orgId, name: skill.name, visibility: skill.visibility },
  }])
}
