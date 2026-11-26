// SEO-friendly, stable, collision-free slugs for public skills.
// Derived from the skill NAME (not the stored `slug`, which has seed ids / triple dashes).

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/, '') || 'skill'
}

interface SlugInput { id: string; name: string; createdAt: number }

/** id -> unique seo slug. Oldest skill keeps the plain slug; later ones get -2, -3 ... */
export function assignSlugs<T extends SlugInput>(skills: T[]): Map<string, string> {
  const ordered = [...skills].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const s of ordered) {
    const base = slugify(s.name)
    let slug = base
    for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`
    used.add(slug)
    out.set(s.id, slug)
  }
  return out
}

/** Remove fields that must never be public. */
export function publicSkill<T extends Record<string, unknown>>(s: T) {
  const { shareToken: _t, ...rest } = s as T & { shareToken?: unknown }
  return rest
}
