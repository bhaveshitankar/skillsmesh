import {
  SITE, type LibrarySkill, esc, fetchJson, getShell, pageHeaders, renderPage,
  skillBody, skillDescription, skillJsonLd, skillMarkdown, skillTitle,
} from '../_lib/seo'

interface Env { ASSETS: { fetch: typeof fetch } }
interface Related { seoSlug: string; name: string; description: string }

// GET /library/<slug>      -> server-rendered HTML page (SEO)
// GET /library/<slug>.md   -> plain-markdown version (GEO: easy for LLMs/agents to ingest)
export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const raw = String(params.slug)
  const wantsMd = raw.endsWith('.md')
  const slug = (wantsMd ? raw.slice(0, -3) : raw)

  // One canonical, lowercase URL per skill
  if (slug !== slug.toLowerCase()) {
    return Response.redirect(`${SITE}/library/${slug.toLowerCase()}${wantsMd ? '.md' : ''}`, 301)
  }

  const data = await fetchJson<{ skill: LibrarySkill; related: Related[] }>(`/public/library/${encodeURIComponent(slug)}`)
  const shell = await getShell(request, env)

  if (!data) {
    // Unknown skill: real 404 so search engines drop it; SPA still shows its own message
    if (wantsMd) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    return new Response(
      renderPage(shell, { title: 'Prompt template not found | RaxTeam', description: 'This prompt template does not exist or is no longer public.', robots: 'noindex, follow' },
        `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif"><h1>Prompt template not found</h1><p><a href="/library">Browse the RaxTeam prompt library</a></p></main>`),
      { status: 404, headers: pageHeaders({ 'Cache-Control': 'public, max-age=60' }) },
    )
  }

  const { skill, related } = data
  const url = `${SITE}/library/${skill.seoSlug}`

  if (wantsMd) {
    return new Response(skillMarkdown(skill), {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        Link: `<${url}>; rel="canonical"`,
        'X-Robots-Tag': 'noindex', // the HTML page is the canonical, indexable one
      },
    })
  }

  const html = renderPage(
    shell,
    {
      title: skillTitle(skill.name),
      description: skillDescription(skill),
      canonical: url,
      robots: 'index, follow, max-snippet:-1, max-image-preview:large',
      ogType: 'article',
      jsonLd: skillJsonLd(skill, url),
      alternates: [{ type: 'text/markdown', href: `${url}.md`, title: `${esc(skill.name)} (markdown)` }],
    },
    skillBody(skill, related),
  )
  return new Response(html, { headers: pageHeaders() })
}
