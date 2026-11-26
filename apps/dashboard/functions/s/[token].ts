// Cloudflare Pages Function: server-render shared skill pages so that crawlers and
// LLM fetchers (ChatGPT, Claude, etc.) that don't execute JavaScript can read the content.
// Browsers still get the normal SPA: React replaces #root on load.

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const API_URL = 'https://api.raxteam.com'

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const token = String(params.token)
  const url = new URL(request.url)

  // Fetch the SPA shell
  const shellRes = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
  let html = await shellRes.text()

  let skill: any = null
  try {
    const r = await fetch(`${API_URL}/public/s/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    })
    if (r.ok) skill = ((await r.json()) as any).skill
  } catch {
    /* fall through to plain SPA */
  }

  if (!skill) {
    return new Response(html, {
      status: shellRes.status,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const title = `${skill.name} — RaxTeam`
  const desc = String(skill.description ?? '').slice(0, 300)
  const canonical = `${url.origin}/s/${token}`
  const tags: string[] = Array.isArray(skill.tags) ? skill.tags : []

  const body = `
<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
  <p>Status: ${esc(skill.status)}</p>
  <h1>${esc(skill.name)}</h1>
  <h2>Description</h2>
  <p>${esc(skill.description)}</p>
  <h2>Prompt Template</h2>
  <pre style="white-space:pre-wrap">${esc(skill.promptTemplate)}</pre>
  ${tags.length ? `<p>Tags: ${tags.map(esc).join(', ')}</p>` : ''}
  <p>Shared via <a href="https://raxteam.com">RaxTeam</a></p>
</main>`

  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}" />`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}" />`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(canonical)}" />`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(canonical)}" />`)
    .replace(/<div id="root">\s*<\/div>/, `<div id="root">${body}</div>`)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
    },
  })
}
