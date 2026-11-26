import { SITE, type LibrarySkill, esc, fetchJson, getShell, pageHeaders, renderPage, truncate } from '../_lib/seo'

interface Env { ASSETS: { fetch: typeof fetch } }

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const data = await fetchJson<{ skills: LibrarySkill[] }>('/public/library')
  const skills = data?.skills ?? []
  const shell = await getShell(request, env)
  const url = `${SITE}/library`

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: 'AI Prompt Template Library',
        description: 'Free, curated AI prompt templates for engineering teams. Copy them or open them directly in ChatGPT, Claude and Gemini.',
        isPartOf: { '@type': 'WebSite', name: 'RaxTeam', url: SITE },
      },
      {
        '@type': 'ItemList',
        itemListElement: skills.slice(0, 100).map((s, i) => ({
          '@type': 'ListItem', position: i + 1, url: `${SITE}/library/${s.seoSlug}`, name: s.name,
        })),
      },
    ],
  }

  const body = `
<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif;line-height:1.6;color:#111827">
  <nav aria-label="Breadcrumb"><a href="/">RaxTeam</a> › Prompt library</nav>
  <h1>Free AI prompt templates for developers and teams</h1>
  <p>${skills.length} curated, ready-to-use prompt templates. Open any of them in ChatGPT, Claude, Gemini or Perplexity with one click.</p>
  <ul>${skills.map(s => `<li><a href="/library/${esc(s.seoSlug)}">${esc(s.name)}</a> – ${esc(truncate(s.description, 140))}</li>`).join('')}</ul>
  <p>AI agents: a plain-text index is available at <a href="/llms-skills.txt">/llms-skills.txt</a>.</p>
</main>`

  return new Response(
    renderPage(shell, {
      title: 'Free AI Prompt Templates for Developers & Teams | RaxTeam',
      description: truncate(`Browse ${skills.length} free, curated AI prompt templates for engineering teams: code review, testing, docs, debugging and more. Open them in ChatGPT, Claude or Gemini.`, 158),
      canonical: url,
      robots: 'index, follow, max-snippet:-1, max-image-preview:large',
      ogType: 'website',
      jsonLd: ld,
    }, body),
    { headers: pageHeaders() },
  )
}
