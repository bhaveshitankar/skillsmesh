import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, isLoggedIn, type LibraryItem } from '../lib/api'
import RaxTeamLogo from '../components/RaxTeamLogo'

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    document.title = 'Free AI Prompt Templates for Developers & Teams | RaxTeam'
    api.public.library().then(r => setItems(r.skills)).finally(() => setLoading(false))
  }, [])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? items.filter(i => `${i.name} ${i.description} ${i.tags.join(' ')}`.toLowerCase().includes(n)) : items
  }, [items, q])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <RaxTeamLogo size={28} />
          <span className="font-semibold text-gray-800 text-sm">RaxTeam</span>
        </Link>
        <Link to={isLoggedIn() ? '/skills' : '/login'} className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">{isLoggedIn() ? 'My dashboard' : 'Sign in'}</Link>
      </header>

      <main className="max-w-3xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900">Free AI prompt templates for developers and teams</h1>
        <p className="mt-2 text-sm text-gray-600">
          {items.length > 0 ? `${items.length} curated, ready-to-use prompt templates. ` : ''}
          Open any of them in ChatGPT, Claude, Gemini or Perplexity with one click.
        </p>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search prompt templates…"
          aria-label="Search prompt templates"
          className="mt-5 w-full text-sm border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {loading ? (
          <div className="mt-10 flex justify-center"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
        ) : (
          <ul className="mt-6 space-y-3">
            {shown.map(s => (
              <li key={s.seoSlug} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-colors">
                <Link to={`/library/${s.seoSlug}`} className="text-sm font-semibold text-indigo-700 hover:underline">{s.name}</Link>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{s.description}</p>
                {s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {s.tags.slice(0, 4).map(t => <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>)}
                  </div>
                )}
              </li>
            ))}
            {shown.length === 0 && <li className="text-sm text-gray-500">No prompt templates match “{q}”.</li>}
          </ul>
        )}
      </main>
    </div>
  )
}
