import { SITE, type LibrarySkill, esc, fetchJson, iso } from './_lib/seo'

// Dynamic sitemap: static pages + every public approved skill.
const STATIC: Array<[string, string, string]> = [
  ['/', '1.0', 'daily'],
  ['/library', '0.9', 'daily'],
  ['/api-docs', '0.8', 'weekly'],
  ['/badge', '0.5', 'monthly'],
  ['/login', '0.4', 'monthly'],
  ['/llms.txt', '0.5', 'weekly'],
  ['/llms-skills.txt', '0.5', 'daily'],
]

export const onRequestGet: PagesFunction = async () => {
  const data = await fetchJson<{ skills: LibrarySkill[] }>('/public/library')
  const skills = data?.skills ?? []
  const urls = [
    ...STATIC.map(([p, pr, cf]) => `<url><loc>${SITE}${p}</loc><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`),
    ...skills.map(s => {
      const lm = iso(s.updatedAt)
      return `<url><loc>${esc(`${SITE}/library/${s.seoSlug}`)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.7</priority></url>`
    }),
  ]
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900, s-maxage=1800' },
  })
}
