import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api, type Skill } from '../lib/api'
import StatusBadge from '../components/StatusBadge'

const PAGE_SIZE = 20

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmSkill, setConfirmSkill] = useState<Skill | null>(null)
  const [userId, setUserId] = useState('')

  async function deleteSkill(skill: Skill) {
    setConfirmSkill(null)
    setDeleting(skill.id)
    try {
      await api.skills.delete(skill.id)
      setSkills(prev => prev.filter(s => s.id !== skill.id))
      setTotal(t => t - 1)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  function handleSearchInput(val: string) {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(0) }, 350)
  }

  useEffect(() => {
    api.me().then(r => setUserId(r.user.id)).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    api.skills.list({ visibility: filter === 'all' ? undefined : filter, search: search || undefined, page, limit: PAGE_SIZE })
      .then(r => { setSkills(r.skills); setTotal(r.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [filter, search, page])

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const filters = ['all', 'private', 'shared', 'public']

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Skills</h1>
          <p className="text-sm text-gray-500 mt-1">Manage and review AI prompt skills for your team</p>
        </div>
        <Link
          to="/skills/new"
          className="flex items-center gap-2 px-4 py-2.5 h-10 bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-all duration-150 shadow-sm shadow-brand-200"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Skill
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Search skills…"
            className="w-full pl-9 pr-4 py-2 h-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filters.map(v => (
            <button
              key={v}
              onClick={() => { setFilter(v); setPage(0) }}
              className={`px-3.5 py-1.5 h-10 rounded-lg text-sm font-medium transition-all duration-150 ${
                filter === v
                  ? 'bg-brand-600 text-white shadow-sm shadow-brand-200'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-300 hover:text-brand-600'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading skills…</p>
        </div>
      ) : skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-gray-700 font-semibold mb-1">No skills yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first skill to get started</p>
          <Link
            to="/skills/new"
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Create your first skill
          </Link>
        </div>
      ) : (
        <>
        {total > 0 && <p className="text-xs text-gray-400 mb-3">{total} skill{total !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}</p>}
        <div className="space-y-3">
          {skills.map(skill => (
            <div key={skill.id} className="group relative bg-white rounded-xl border border-gray-200 hover:border-brand-300 hover:-translate-y-px hover:shadow-card-hover transition-all duration-200">
              <Link to={`/skills/${skill.id}`} className="block p-5 pr-14">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{skill.name}</h3>
                      <StatusBadge status={skill.status} />
                      <span className="text-xs text-gray-400 capitalize bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">{skill.visibility}</span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{skill.description}</p>
                    {skill.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {skill.tags.map(tag => (
                          <span key={tag} className="text-xs bg-brand-50 text-brand-600 border border-brand-100 px-2.5 py-0.5 rounded-full font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="font-medium text-gray-700">{skill.useCount}</span>
                      <span className="text-gray-400">uses</span>
                    </div>
                    {skill.tokenEstimate > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        ~{skill.tokenEstimate} tokens
                      </div>
                    )}
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>

              {/* Delete button — outside the Link, only visible to the author */}
              {skill.status !== 'approved' && skill.authorId === userId && (
                <button
                  onClick={() => setConfirmSkill(skill)}
                  disabled={deleting === skill.id}
                  title="Delete skill"
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150 disabled:opacity-50"
                >
                  {deleting === skill.id
                    ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                  }
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">Page {page + 1} of {totalPages}</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
        </>
      )}
      {/* Delete confirmation modal */}
      {confirmSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmSkill(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Delete skill?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              <span className="font-medium text-gray-700">"{confirmSkill.name}"</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSkill(null)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSkill(confirmSkill)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
