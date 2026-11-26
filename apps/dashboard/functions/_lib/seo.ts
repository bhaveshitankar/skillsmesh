// Shared helpers for the server-rendered (SEO/GEO) Pages Functions.
// Files in functions/_lib export no route handlers, so they are not routes themselves.

export const SITE = 'https://raxteam.com'
export const API = 'https://api.raxteam.com'
export const OG_IMAGE = `${SITE}/og-image.png`

export interface LibrarySkill {
  id?: string
  seoSlug: string
  name: string
  description: string
  promptTemplate?: string
  tags: string[]
  version?: string
  upvotes?: number
  createdAt?: number
  publishedAt?: number | null
  updatedAt?: number
}

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** JSON for a <script type="application/ld+json"> block: never lets "</script>" through. */
export const jsonLd = (obj: unknown) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

export function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max - 1).replace(/[\s,.;:–-]+$/, '') + '…'
}

/** Page <title>: keyword-rich but aims to stay under ~62 chars so it is not cut in results. */
export function skillTitle(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim()
  for (const cand of [`${n} – AI Prompt Template | RaxTeam`, `${n} – AI Prompt Template`, `${n} | RaxTeam`]) {
    if (cand.length <= 62) return cand
  }
  return truncate(n, 58) + ' | RaxTeam'
}

/** Meta description (~155 chars): what it is + how to use it. */
export function skillDescription(s: LibrarySkill): string {
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const desc = (s.description || '').replace(/\s+/g, ' ').trim()
  // Many skills have a description that just repeats the name: don't repeat it twice.
  const useful = desc.length >= 25 && norm(desc) !== norm(s.name)
  const lead = useful ? desc : `${s.name}: a ready-to-use AI prompt template`
  const sentence = /[.!?…]$/.test(lead) ? lead : `${lead}.`
  // Add the call-to-action only when it fits; otherwise the description alone fills the snippet.
  for (const cta of [' Free for ChatGPT, Claude and Gemini. Copy it or open it in one click.', ' Free for ChatGPT, Claude and Gemini.']) {
    if (sentence.length + cta.length <= 158) return sentence + cta
  }
  return truncate(sentence, 158)
}

export const iso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : undefined)

export async function getShell(request: Request, env: { ASSETS: { fetch: typeof fetch } }): Promise<string> {
  // Pages redirects /index.html -> / (no body), so fetch the SPA shell from /
  const res = await env.ASSETS.fetch(new Request(new URL('/', request.url).toString()))
  return res.text()
}

export interface HeadOptions {
  title: string
  description: string
  canonical?: string
  robots: string
  ogType?: string
  jsonLd?: unknown
  alternates?: Array<{ type: string; href: string; title?: string }>
}

/** Replace the generic homepage head tags in the SPA shell with page-specific ones. */
export function renderPage(shell: string, head: HeadOptions, bodyHtml: string): string {
  const t = esc(head.title)
  const d = esc(head.description)
  const tags = [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="${esc(head.robots)}" />`,
    head.canonical ? `<link rel="canonical" href="${esc(head.canonical)}" />` : '',
    `<meta property="og:type" content="${esc(head.ogType ?? 'article')}" />`,
    head.canonical ? `<meta property="og:url" content="${esc(head.canonical)}" />` : '',
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:site_name" content="RaxTeam" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    ...(head.alternates ?? []).map(a => `<link rel="alternate" type="${esc(a.type)}" href="${esc(a.href)}"${a.title ? ` title="${esc(a.title)}"` : ''} />`),
    head.jsonLd ? `<script type="application/ld+json">${jsonLd(head.jsonLd)}</script>` : '',
  ].filter(Boolean).join('\n    ')

  const stripped = shell
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<meta\s+name="(description|keywords|robots|twitter:[^"]*)"[^>]*>/g, '')
    .replace(/<meta\s+property="og:[^"]*"[^>]*>/g, '')
    .replace(/<link\s+rel="canonical"[^>]*>/g, '')
    .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')

  return stripped
    .replace('</head>', `    ${tags}\n  </head>`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${bodyHtml}</div>`)
}

export const pageHeaders = (extra: Record<string, string> = {}) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300, s-maxage=600',
  ...extra,
})

export async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' } })
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

const bodyStyle = 'max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif;line-height:1.6;color:#111827'

export function skillBody(
  s: LibrarySkill,
  related: Array<{ seoSlug: string; name: string; description: string }>,
  opts: { markdown?: boolean } = { markdown: true },
): string {
  const url = `${SITE}/library/${s.seoSlug}`
  const tags = (s.tags ?? []).map(t => esc(t)).join(', ')
  return `
<main style="${bodyStyle}">
  <nav aria-label="Breadcrumb"><a href="/">RaxTeam</a> › <a href="/library">Prompt library</a> › ${esc(s.name)}</nav>
  <article>
    <h1>${esc(s.name)}</h1>
    <p><strong>${esc(s.name)}</strong> is a free AI prompt template you can use in ChatGPT, Claude, Gemini, Perplexity and any MCP-compatible assistant. ${esc(s.description)}</p>
    <h2>How to use this prompt template</h2>
    <ol>
      <li>Copy the prompt below, or use the “Use with AI” button to open it in your AI app.</li>
      <li>Replace any <code>{{placeholders}}</code> with your own details.</li>
      <li>Send it and refine the result.</li>
    </ol>
    <h2>Prompt template</h2>
    <pre style="white-space:pre-wrap;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:1rem">${esc(s.promptTemplate)}</pre>
    ${tags ? `<p>Topics: ${tags}</p>` : ''}
    ${opts.markdown ? `<p>Plain-text version for AI tools: <a href="${url}.md">${url}.md</a></p>` : ''}
  </article>
  ${related.length ? `<section><h2>Related prompt templates</h2><ul>${related.map(r => `<li><a href="/library/${esc(r.seoSlug)}">${esc(r.name)}</a> – ${esc(truncate(r.description, 110))}</li>`).join('')}</ul></section>` : ''}
  <p>Shared via <a href="${SITE}">RaxTeam</a> · <a href="/library">Browse all prompt templates</a></p>
</main>`
}

export function skillJsonLd(s: LibrarySkill, url: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${url}#article`,
        headline: s.name,
        description: s.description,
        url,
        mainEntityOfPage: url,
        inLanguage: 'en',
        isAccessibleForFree: true,
        keywords: (s.tags ?? []).join(', ') || undefined,
        datePublished: iso(s.publishedAt ?? s.createdAt),
        dateModified: iso(s.publishedAt ?? s.createdAt),
        image: OG_IMAGE,
        author: { '@type': 'Organization', name: 'RaxTeam', url: SITE },
        publisher: { '@type': 'Organization', name: 'RaxTeam', url: SITE },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'RaxTeam', item: SITE },
          { '@type': 'ListItem', position: 2, name: 'Prompt library', item: `${SITE}/library` },
          { '@type': 'ListItem', position: 3, name: s.name, item: url },
        ],
      },
    ],
  }
}

/** Markdown rendition of a skill, for LLMs and agents. */
export function skillMarkdown(s: LibrarySkill): string {
  const url = `${SITE}/library/${s.seoSlug}`
  return [
    `# ${s.name}`,
    '',
    `> ${s.description}`,
    '',
    `Source: ${url}`,
    (s.tags ?? []).length ? `Topics: ${s.tags.join(', ')}` : '',
    '',
    '## Prompt template',
    '',
    '````text',
    (s.promptTemplate ?? '').trim(),
    '````',
    '',
    '## How to use',
    '',
    '1. Copy the prompt template above into ChatGPT, Claude, Gemini or any AI assistant.',
    '2. Replace any `{{placeholders}}` with your own details.',
    '3. Send it and refine the result.',
    '',
    `More prompt templates: ${SITE}/library`,
    '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
