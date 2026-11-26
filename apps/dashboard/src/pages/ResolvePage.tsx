import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Skill } from '../lib/api'

type Result =
  | { found: false }
  | { found: true; skill: Skill; score: number }

export default function ResolvePage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  async function resolve(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    setError('')
    try {
      const r = await api.resolve(query)
      setResult(r)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const scoreColor = (score: number) =>
    score >= 0.9 ? 'text-emerald-600' : score >= 0.82 ? 'text-brand-600' : 'text-amber-600'

  const scoreBarColor = (score: number) =>
    score >= 0.9 ? 'bg-emerald-500' : score >= 0.82 ? 'bg-brand-500' : 'bg-amber-500'

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Resolve</h1>
        <p className="text-sm text-gray-500 mt-1">Vector search — describe a task to find a matching skill</p>
      </div>

      {/* Search bar */}
      <form onSubmit={resolve} className="relative mb-6">
        <div className={`flex items-center gap-3 bg-white border-2 rounded-2xl px-4 py-3.5 transition-all duration-200 shadow-card ${
          loading ? 'border-brand-300' : 'border-gray-200 focus-within:border-brand-400 focus-within:shadow-glow'
        }`}>
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="e.g. summarize a pull request"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 sm:px-5 py-2 h-10 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-all duration-150 shrink-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Searching
              </span>
            ) : 'Resolve'}
          </button>
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-5 fade-in">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Result */}
      {result !== null && (
        <div className="fade-in">
          {result.found ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
              {/* Result header */}
              <div className="px-5 py-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-emerald-800 text-sm">Skill found</span>
                  <p className="text-xs text-emerald-600 mt-0.5">A matching skill exists in your library</p>
                </div>
                {/* Score pill */}
                <div className="text-right shrink-0">
                  <span className={`font-mono text-lg font-bold ${scoreColor(result.score)}`}>
                    {(result.score * 100).toFixed(1)}%
                  </span>
                  <p className="text-xs text-gray-400">match</p>
                </div>
              </div>

              {/* Score bar */}
              <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 shrink-0">Similarity</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${scoreBarColor(result.score)}`}
                      style={{ width: `${result.score * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Skill card */}
              <div className="p-5">
                <Link
                  to={`/skills/${result.skill.id}`}
                  className="block bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-300 rounded-xl p-4 mb-4 transition-all duration-150 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{result.skill.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{result.skill.description}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-400 shrink-0 mt-0.5 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {result.skill.triggers.length > 0 && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      {result.skill.triggers.map(t => (
                        <span key={t} className="text-xs bg-brand-50 text-brand-700 border border-brand-100 px-2.5 py-0.5 rounded-full font-medium">{t}</span>
                      ))}
                    </div>
                  )}
                </Link>

                {/* Prompt template preview */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Prompt Template</p>
                  <pre className="p-4 bg-slate-950 rounded-xl text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed border border-slate-800 overflow-x-auto max-h-48">
                    {result.skill.promptTemplate}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-card p-6 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800">No matching skill found</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  No approved skill scored above the similarity threshold for this query.
                </p>
                <Link
                  to="/skills/new"
                  className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium mt-3 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Create a skill for this
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works panel */}
      <div className="mt-8 bg-gradient-to-br from-brand-50 to-violet-50/60 rounded-2xl border border-brand-100 p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wider">How it works</p>
        </div>
        <ul className="text-xs text-brand-700/80 space-y-2">
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
            Your query is embedded using Workers AI and compared against approved skills
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
            Free tier threshold: 82% similarity &mdash; Pro: 85%
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
            Free tier: embeddings are processed async (up to ~1 min after approval)
          </li>
          <li className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
            Rate limit: 500 resolves/month on free tier
          </li>
        </ul>
      </div>
    </div>
  )
}
