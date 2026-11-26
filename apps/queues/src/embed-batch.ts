import { createDb, schema } from '@skillmesh/db'
import { eq } from 'drizzle-orm'
import { EMBEDDING_MODEL_FREE } from '@skillmesh/shared'

interface EmbedMessage {
  skillId: string
  orgId: string
}

interface Env {
  DB: D1Database
  VECTORIZE_384: VectorizeIndex
  AI: Ai
}

function buildEmbeddingText(skill: { description: string; triggers: unknown; tags: unknown }): string {
  const triggers = Array.isArray(skill.triggers) ? (skill.triggers as string[]) : []
  const tags = Array.isArray(skill.tags) ? (skill.tags as string[]) : []
  return [skill.description, ...triggers, ...tags].join(' ')
}

async function generateEmbedding(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run(EMBEDDING_MODEL_FREE as Parameters<Ai['run']>[0], { text: [text] } as never) as { data: number[][] }
  if (!result.data?.[0]) throw new Error('No embedding returned')
  return result.data[0]
}

export default {
  async queue(batch: MessageBatch<EmbedMessage>, env: Env): Promise<void> {
    const db = createDb(env.DB)

    for (const message of batch.messages) {
      const { skillId } = message.body
      try {
        const skill = await db.select().from(schema.skills).where(eq(schema.skills.id, skillId)).get()
        if (!skill || skill.status !== 'approved') {
          message.ack()
          continue
        }

        const embText = buildEmbeddingText(skill)
        const vector = await generateEmbedding(env.AI, embText)
        await env.VECTORIZE_384.upsert([{
          id: skillId,
          values: vector,
          metadata: { orgId: skill.orgId, name: skill.name, visibility: skill.visibility },
        }])

        await db.insert(schema.skillVersions).values({
          id: crypto.randomUUID(),
          skillId,
          version: skill.version,
          promptTemplate: skill.promptTemplate,
          changelog: 'Initial indexed version',
          createdAt: Date.now(),
        }).onConflictDoNothing()

        message.ack()
      } catch (_err) {
        message.retry()
      }
    }
  },
}
