// Build "use this skill with an AI app" deep links.
// All targets are plain https URLs: on mobile they open the installed app via universal
// links (ChatGPT, Claude, WhatsApp, Perplexity...), on desktop they open the web app.

export interface AiTarget {
  id: string
  label: string
  /** Max length of the URL-encoded prompt we are willing to put in the link. */
  maxEncoded: number
  /** Build the launch URL. `text` is the (already trimmed) prompt, `shareUrl` the skill link. */
  url: (text: string, shareUrl: string) => string
  /** App has no prefill URL: we copy the prompt and just open the app. */
  copyOnly?: boolean
}

const enc = encodeURIComponent

export const AI_TARGETS: AiTarget[] = [
  { id: 'chatgpt', label: 'ChatGPT', maxEncoded: 6000, url: t => `https://chatgpt.com/?q=${enc(t)}` },
  { id: 'claude', label: 'Claude', maxEncoded: 6000, url: t => `https://claude.ai/new?q=${enc(t)}` },
  { id: 'gemini', label: 'Gemini', maxEncoded: 0, copyOnly: true, url: () => 'https://gemini.google.com/app' },
  { id: 'perplexity', label: 'Perplexity', maxEncoded: 6000, url: t => `https://www.perplexity.ai/search?q=${enc(t)}` },
  { id: 'copilot', label: 'Copilot', maxEncoded: 6000, url: t => `https://copilot.microsoft.com/?q=${enc(t)}` },
  { id: 'grok', label: 'Grok', maxEncoded: 6000, url: t => `https://grok.com/?q=${enc(t)}` },
  // Meta AI has its own WhatsApp number, so the chat opens straight to it.
  { id: 'meta-ai', label: 'Meta AI (WhatsApp)', maxEncoded: 3500, url: t => `https://wa.me/13135550002?text=${enc(t)}` },
  // Pick any chat/group; "@Meta AI" prefix summons Meta AI in a group (plain text, not a real mention).
  { id: 'whatsapp', label: 'WhatsApp chat or group', maxEncoded: 3500, url: t => `https://wa.me/?text=${enc('@Meta AI ' + t)}` },
]

/** The prompt handed to the AI: the skill plus a short instruction wrapper. */
export function buildPrompt(skill: { name: string; promptTemplate: string }): string {
  const hasVars = /\{\{[^}]+\}\}/.test(skill.promptTemplate)
  return [
    `Use the skill "${skill.name}" below. Follow its instructions for my request.`,
    hasVars ? 'Ask me for the value of any {{placeholder}} before you start.' : '',
    '',
    '--- SKILL ---',
    skill.promptTemplate.trim(),
    '--- END SKILL ---',
    '',
    // Some apps (ChatGPT) send the prompt immediately, others let the user edit it first.
    // This ending works for both: edit it to add a request, or send it as-is to be asked.
    'My request: (none yet - confirm in one line that you have the skill, then ask what I need.)',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

export interface LaunchResult {
  /** Full prompt was copied to the clipboard (link too long, or app has no prefill). */
  copied: boolean
  /** Opening failed (e.g. popup blocked) */
  blocked: boolean
}

/**
 * Open `target` with the prompt. Must be called directly from a click handler so the
 * browser (especially mobile Safari) allows window.open.
 */
export function launch(target: AiTarget, prompt: string, shareUrl: string): LaunchResult {
  const fits = !target.copyOnly && enc(prompt).length <= target.maxEncoded
  let copied = false

  let text = prompt
  if (!fits) {
    // Too long for a link (or no prefill support): copy the full prompt, send a short pointer.
    try { void navigator.clipboard?.writeText(prompt); copied = true } catch { /* ignore */ }
    text = `Use this skill: ${shareUrl}\n(The full skill text is on my clipboard - paste it here if you cannot open the link.)\n\nMy request: (none yet - confirm in one line that you have the skill, then ask what I need.)`
  }

  const href = target.copyOnly ? target.url('', shareUrl) : target.url(text, shareUrl)
  const w = window.open(href, '_blank', 'noopener,noreferrer')
  return { copied, blocked: !w }
}

/** Native share sheet (mobile): lets the user pick any installed app. */
export async function nativeShare(prompt: string, title: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false
  try {
    await navigator.share({ title, text: prompt })
    return true
  } catch {
    return false // user cancelled
  }
}
