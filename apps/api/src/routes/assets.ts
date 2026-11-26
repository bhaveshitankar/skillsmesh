import { Hono } from 'hono'
import { createDb, schema } from '@skillmesh/db'
import { eq, and } from 'drizzle-orm'
import { authMiddleware } from '../middleware/auth'
import { generateEmbedding } from '../lib/embed'
import { EMBEDDING_MODEL_PAID } from '@skillmesh/shared'

type AssetsEnv = {
  Bindings: {
    DB: D1Database
    ASSETS: R2Bucket
    VECTORIZE_768: VectorizeIndex
    AI: Ai
  }
  Variables: { userId: string; orgId: string; role: string }
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const CHUNK_SIZE = 1200 // characters per chunk (~300 tokens)
const CHUNK_OVERLAP = 150

const ALLOWED_TEXT_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/javascript',
  'text/typescript',
  'text/x-python',
  'application/x-python-code',
  'text/html',
  'text/xml',
  'application/xml',
  'text/yaml',
  'application/yaml',
])

const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function detectAssetType(mime: string): 'document' | 'image' | 'script' | 'data' {
  if (ALLOWED_IMAGE_TYPES.has(mime)) return 'image'
  if (mime.includes('javascript') || mime.includes('typescript') || mime.includes('python')) return 'script'
  if (mime === 'text/csv' || mime === 'application/json') return 'data'
  return 'document'
}

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    chunks.push(text.slice(start, end).trim())
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks.filter(c => c.length > 40) // skip tiny chunks
}

const assets = new Hono<AssetsEnv>()

// GET /skills/:id/assets — list assets for a skill
assets.get('/:id/assets', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, c.get('orgId')))).get()
  if (!skill) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  const rows = await db.select().from(schema.skillAssets)
    .where(eq(schema.skillAssets.skillId, skill.id)).all()
  return c.json({ assets: rows })
})

// POST /skills/:id/assets — upload a file (premium only)
assets.post('/:id/assets', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  // Premium gate
  const org = await db.select().from(schema.orgs).where(eq(schema.orgs.id, orgId)).get()
  if (org?.plan === 'free') {
    return c.json({ error: 'Rich skill assets require a Pro plan. Upgrade to attach files, images, and scripts.', code: 'PLAN_LIMIT' }, 402)
  }

  const skill = await db.select().from(schema.skills)
    .where(and(eq(schema.skills.id, c.req.param('id')), eq(schema.skills.orgId, orgId))).get()
  if (!skill) return c.json({ error: 'Skill not found', code: 'NOT_FOUND' }, 404)

  if (!c.env.ASSETS) {
    return c.json({ error: 'File storage not configured. Enable R2 in Cloudflare dashboard.', code: 'UNAVAILABLE' }, 503)
  }

  const formData = await c.req.formData()
  const file = formData.get('file') as File | null
  if (!file) return c.json({ error: 'file field required', code: 'BAD_REQUEST' }, 400)

  if (file.size > MAX_FILE_SIZE) {
    return c.json({ error: 'File too large (max 10 MB)', code: 'BAD_REQUEST' }, 400)
  }

  const mime = file.type || 'application/octet-stream'
  if (!ALLOWED_TEXT_TYPES.has(mime) && !ALLOWED_IMAGE_TYPES.has(mime)) {
    return c.json({ error: `Unsupported file type: ${mime}`, code: 'BAD_REQUEST' }, 400)
  }

  const assetId = crypto.randomUUID()
  const r2Key = `${orgId}/${skill.id}/${assetId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const assetType = detectAssetType(mime)

  // Upload to R2
  const bytes = await file.arrayBuffer()
  await c.env.ASSETS.put(r2Key, bytes, {
    httpMetadata: { contentType: mime },
    customMetadata: { orgId, skillId: skill.id, assetId, fileName: file.name },
  })

  let chunkCount = 0

  // For text-based assets: chunk + vectorize
  if (ALLOWED_TEXT_TYPES.has(mime)) {
    const text = new TextDecoder().decode(bytes)
    const chunks = chunkText(text)
    chunkCount = chunks.length

    // Insert chunks and vectorize in parallel batches of 5
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = chunks.slice(i, i + 5)
      const chunkRows = batch.map((content, j) => ({
        id: crypto.randomUUID(),
        skillId: skill.id,
        assetId,
        orgId,
        content,
        chunkIndex: i + j,
        vectorId: null as string | null,
        createdAt: Date.now(),
      }))

      // Vectorize chunks (context = skill name + chunk content for better retrieval)
      const vectors = await Promise.all(
        chunkRows.map(async (row) => {
          const text = `${skill.name}: ${row.content}`
          const embedding = await generateEmbedding(c.env.AI, text, EMBEDDING_MODEL_PAID)
          return { id: `chunk_${row.id}`, values: embedding, metadata: { orgId, skillId: skill.id, assetId, chunkIndex: row.chunkIndex, type: 'chunk' } }
        })
      )

      if (c.env.VECTORIZE_768) {
        await c.env.VECTORIZE_768.upsert(vectors)
        // Store vectorIds back into chunk rows
        vectors.forEach((v, idx) => { chunkRows[idx].vectorId = v.id })
      }

      await db.insert(schema.skillChunks).values(chunkRows)
    }
  }

  // Save asset record
  await db.insert(schema.skillAssets).values({
    id: assetId,
    skillId: skill.id,
    orgId,
    fileName: file.name,
    mimeType: mime,
    sizeBytes: file.size,
    r2Key,
    assetType,
    chunkCount,
    createdAt: Date.now(),
  })

  const asset = await db.select().from(schema.skillAssets).where(eq(schema.skillAssets.id, assetId)).get()
  return c.json({ asset }, 201)
})

// DELETE /skills/:id/assets/:assetId
assets.delete('/:id/assets/:assetId', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const orgId = c.get('orgId')

  const asset = await db.select().from(schema.skillAssets)
    .where(and(
      eq(schema.skillAssets.id, c.req.param('assetId')),
      eq(schema.skillAssets.orgId, orgId),
      eq(schema.skillAssets.skillId, c.req.param('id')),
    )).get()
  if (!asset) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  // Delete chunks from vectorize + DB
  const chunks = await db.select().from(schema.skillChunks)
    .where(eq(schema.skillChunks.assetId, asset.id)).all()
  const chunkVectorIds = chunks.map(c => c.vectorId).filter(Boolean) as string[]
  if (chunkVectorIds.length > 0 && c.env.VECTORIZE_768) {
    await c.env.VECTORIZE_768.deleteByIds(chunkVectorIds)
  }
  await db.delete(schema.skillChunks).where(eq(schema.skillChunks.assetId, asset.id))

  // Delete from R2
  if (c.env.ASSETS) await c.env.ASSETS.delete(asset.r2Key)

  // Delete asset record
  await db.delete(schema.skillAssets).where(eq(schema.skillAssets.id, asset.id))

  return c.json({ ok: true })
})

// GET /skills/:id/assets/:assetId/download — signed-ish URL (stream from R2)
assets.get('/:id/assets/:assetId/download', authMiddleware, async (c) => {
  const db = createDb(c.env.DB)
  const asset = await db.select().from(schema.skillAssets)
    .where(and(
      eq(schema.skillAssets.id, c.req.param('assetId')),
      eq(schema.skillAssets.orgId, c.get('orgId')),
    )).get()
  if (!asset) return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404)

  if (!c.env.ASSETS) return c.json({ error: 'Storage unavailable', code: 'UNAVAILABLE' }, 503)

  const obj = await c.env.ASSETS.get(asset.r2Key)
  if (!obj) return c.json({ error: 'File not found in storage', code: 'NOT_FOUND' }, 404)

  return new Response(obj.body, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Disposition': `attachment; filename="${asset.fileName}"`,
    },
  })
})

export default assets
