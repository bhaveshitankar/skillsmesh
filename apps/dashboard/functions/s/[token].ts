// Share links (/s/<token>).
//  - Public + approved skills: 301 to the canonical /library/<slug> page (one URL to rank, one to share).
//  - Everything else (private / shared / draft): server-rendered for link previews and AI readers,
//    but marked noindex so it never shows up in search results.
import { SITE, type LibrarySkill, fetchJson, getShell, pageHeaders, renderPage, skillBody, skillDescription } from '../_lib/seo'

interface Env { ASSETS: { fetch: typeof fetch } }
type SharedSkill = LibrarySkill & { visibility: string; status: string }

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env }) => {
  const token = String(params.token)
  const data = await fetchJson<{ skill: SharedSkill }>(`/public/s/${encodeURIComponent(token)}`)
  const shell = await getShell(request, env)

  if (!data) {
    return new Response(shell, {
      status: 200, // let the SPA render its own "link not found" state
      headers: pageHeaders({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=60' }),
    })
  }

  const skill = data.skill
  if (skill.visibility === 'public' && skill.status === 'approved' && skill.seoSlug) {
    return Response.redirect(`${SITE}/library/${skill.seoSlug}`, 301)
  }

  const html = renderPage(
    shell,
    {
      title: `${skill.name} | RaxTeam`,
      description: skillDescription({ ...skill, seoSlug: '' }),
      robots: 'noindex, nofollow',
      ogType: 'article',
    },
    skillBody({ ...skill, seoSlug: '' }, [], { markdown: false }),
  )
  return new Response(html, { headers: pageHeaders({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, max-age=60' }) })
}
