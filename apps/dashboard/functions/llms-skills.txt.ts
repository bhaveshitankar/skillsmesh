import { SITE, type LibrarySkill, fetchJson, truncate } from './_lib/seo'

// llms.txt-style index of every public skill, linking to the markdown version of each.
export const onRequestGet: PagesFunction = async () => {
  const data = await fetchJson<{ skills: LibrarySkill[] }>('/public/library')
  const skills = data?.skills ?? []
  const text = [
    '# RaxTeam prompt library',
    '',
    '> Free, curated AI prompt templates (skills) for engineering teams. Each link below is a plain-markdown version of one template; the HTML page is at the same path without ".md".',
    '',
    `Site: ${SITE}  |  Overview: ${SITE}/llms.txt  |  API docs: ${SITE}/api-docs`,
    '',
    '## Prompt templates',
    '',
    ...skills.map(s => `- [${s.name}](${SITE}/library/${s.seoSlug}.md): ${truncate(s.description, 160)}`),
    '',
  ].join('\n')
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
  })
}
