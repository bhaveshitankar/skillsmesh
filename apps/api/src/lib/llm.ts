export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type LLMConfig = {
  provider?: string
  apiKey?: string
  model?: string
}

export type LLMResult = {
  content: string
  outputType: 'text' | 'image' | 'audio'
}

const IMAGE_MODEL_PATTERNS = [
  'stable-diffusion',
  'dreamshaper',
  'flux-',
]

export function isImageModel(model: string): boolean {
  const lower = model.toLowerCase()
  return IMAGE_MODEL_PATTERNS.some(p => lower.includes(p))
}

export async function callLLM(
  ai: Ai,
  messages: Message[],
  cfg: LLMConfig,
): Promise<LLMResult> {
  const provider = cfg.provider ?? 'cloudflare'

  if (provider === 'cloudflare' || !cfg.apiKey) return callCloudflareAI(ai, messages, cfg.model ?? '')
  if (provider === 'openai') return wrapText(await callOpenAI(cfg.apiKey, messages, cfg.model ?? ''))
  if (provider === 'anthropic') return wrapText(await callAnthropic(cfg.apiKey, messages, cfg.model ?? ''))
  if (provider === 'gemini') return wrapText(await callGemini(cfg.apiKey, messages, cfg.model ?? ''))
  if (provider === 'groq') return wrapText(await callGroq(cfg.apiKey, messages, cfg.model ?? ''))
  return callCloudflareAI(ai, messages, cfg.model ?? '')
}

function wrapText(content: string): LLMResult {
  return { content, outputType: 'text' }
}

async function callCloudflareAI(ai: Ai, messages: Message[], model: string): Promise<LLMResult> {
  const m = model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

  // Detect image generation models
  if (isImageModel(m)) {
    const userMessage = messages.filter(msg => msg.role === 'user').pop()?.content ?? ''
    const res = await ai.run(m as Parameters<typeof ai.run>[0], { prompt: userMessage } as never) as unknown

    // Image models return a ReadableStream of binary PNG data
    if (res instanceof ReadableStream) {
      const reader = res.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
      const combined = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      // Convert to base64
      let binary = ''
      for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i])
      }
      const base64 = btoa(binary)
      return { content: `data:image/png;base64,${base64}`, outputType: 'image' }
    }

    // Fallback: if it's not a stream, try to handle as text
    throw new Error('Unexpected response from image model')
  }

  const res = await ai.run(m as Parameters<typeof ai.run>[0], { messages } as never) as unknown
  let reply = ''
  if (typeof res === 'string') {
    reply = res
  } else if (res !== null && typeof res === 'object') {
    const obj = res as Record<string, unknown>
    if (typeof obj.response === 'string') {
      // Standard Workers AI format: { response: string }
      reply = obj.response
    } else if (Array.isArray(obj.response)) {
      reply = (obj.response as string[]).join('')
    } else if (Array.isArray(obj.choices)) {
      // OpenAI-compatible format some CF models return: { choices: [{ message: { content } }] }
      const choices = obj.choices as Array<{ message?: { content?: string } }>
      reply = choices[0]?.message?.content ?? ''
    }
  }
  reply = reply.trim()
  if (!reply) throw new Error('Empty response from Cloudflare AI')
  return { content: reply, outputType: 'text' }
}

async function callOpenAI(apiKey: string, messages: Message[], model: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages, max_tokens: 1024 }),
  })
  const data = await res.json() as { choices?: Array<{ message: { content: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}

async function callAnthropic(apiKey: string, messages: Message[], model: string): Promise<string> {
  const system = messages.find(m => m.role === 'system')?.content ?? ''
  const convo = messages.filter(m => m.role !== 'system')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'claude-haiku-4-5-20251001', max_tokens: 1024, system, messages: convo }),
  })
  const data = await res.json() as { content?: Array<{ text: string }> }
  return data.content?.[0]?.text ?? ''
}

async function callGemini(apiKey: string, messages: Message[], model: string): Promise<string> {
  const m = model || 'gemini-2.0-flash'
  const contents = messages.filter(r => r.role !== 'system').map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))
  const systemInstruction = messages.find(m => m.role === 'system')?.content
  const body: Record<string, unknown> = { contents }
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] }
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json() as { candidates?: Array<{ content: { parts: Array<{ text: string }> } }> }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callGroq(apiKey: string, messages: Message[], model: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'llama-3.3-70b-versatile', messages, max_tokens: 1024 }),
  })
  const data = await res.json() as { choices?: Array<{ message: { content: string } }> }
  return data.choices?.[0]?.message?.content ?? ''
}
