import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Workflow, type Org } from '../lib/api'

const PAGE_SIZE = 20

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WorkflowsPage() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'orchestrator' | 'supervisor'>('all')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [userId, setUserId] = useState('')
  const [confirmWf, setConfirmWf] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newType, setNewType] = useState<'orchestrator' | 'supervisor'>('orchestrator')
  const [createError, setCreateError] = useState('')

  function handleSearchInput(val: string) {
    setSearchInput(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setSearch(val); setPage(0) }, 350)
  }

  useEffect(() => {
    api.me().then(r => { setUserId(r.user.id); setOrg(r.org) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (org?.plan === 'free') return
    setLoading(true)
    api.workflows.list({ search: search || undefined, type: filter === 'all' ? undefined : filter, page, limit: PAGE_SIZE })
      .then(r => { setWorkflows(r.workflows); setTotal(r.total) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [search, filter, page, org?.plan])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  async function deleteWorkflow(wf: Workflow) {
    setConfirmWf(null)
    setDeleting(wf.id)
    try {
      await api.workflows.delete(wf.id)
      setWorkflows(prev => prev.filter(w => w.id !== wf.id))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  async function createWorkflow(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError('')
    try {
      const wf = await api.workflows.create({
        name: newName,
        description: newDesc,
        type: newType,
        tags: [],
        definition: { nodes: [], edges: [] },
      })
      setShowCreate(false)
      setNewName(''); setNewDesc(''); setNewType('orchestrator')
      navigate(`/workflows/${wf.id}`)
    } catch (e: unknown) {
      setCreateError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  if (org?.plan === 'free') {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Workflows require Pro</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">Build multi-step AI workflows with skill orchestration. Upgrade to unlock this feature.</p>
          <button
            onClick={() => navigate('/upgrade')}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6 md:mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Workflows</h1>
          <p className="text-sm text-gray-500 mt-1">Build and manage multi-step AI workflows for your team</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 h-10 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white rounded-lg text-sm font-semibold transition-all duration-150 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Workflow
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={searchInput}
            onChange={e => handleSearchInput(e.target.value)}
            placeholder="Search workflows…"
            className="w-full pl-9 pr-4 py-2 h-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'orchestrator', 'supervisor'] as const).map(v => (
            <button
              key={v}
              onClick={() => { setFilter(v); setPage(0) }}
              className={`px-3.5 py-1.5 h-10 rounded-lg text-sm font-medium transition-all duration-150 ${
                filter === v
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading workflows…</p>
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </div>
          <p className="text-gray-700 font-semibold mb-1">No workflows yet</p>
          <p className="text-sm text-gray-400 mb-4">Create your first workflow to get started</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Create your first workflow
          </button>
        </div>
      ) : (
        <>
        {total > 0 && <p className="text-xs text-gray-400 mb-3">{total} workflow{total !== 1 ? 's' : ''}{search ? ` matching "${search}"` : ''}</p>}
        <div className="space-y-3">
          {workflows.map(wf => (
            <div key={wf.id} className="group relative bg-white rounded-xl border border-gray-200 hover:border-violet-300 hover:-translate-y-px hover:shadow-md transition-all duration-200">
              <button
                onClick={() => navigate(`/workflows/${wf.id}`)}
                className="w-full text-left block p-5 pr-14"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                      <h3 className="font-semibold text-gray-900 group-hover:text-violet-700 transition-colors">{wf.name}</h3>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
                        wf.type === 'orchestrator'
                          ? 'bg-blue-50 text-blue-700 border-blue-100'
                          : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}>
                        {wf.type}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium border ${
                        wf.status === 'published'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-gray-50 text-gray-500 border-gray-100'
                      }`}>
                        {wf.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">{wf.description}</p>
                    {wf.tags.length > 0 && (
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {wf.tags.map(tag => (
                          <span key={tag} className="text-xs bg-violet-50 text-violet-600 border border-violet-100 px-2.5 py-0.5 rounded-full font-medium">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium text-gray-700">{wf.runCount}</span>
                      <span className="text-gray-400">runs</span>
                    </div>
                    <div className="text-xs text-gray-400">{fmtDate(wf.createdAt)}</div>
                    <svg className="w-4 h-4 text-gray-300 group-hover:text-violet-400 transition-colors mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>

              {wf.status !== 'published' && wf.authorId === userId && (
                <button
                  onClick={() => setConfirmWf(wf)}
                  disabled={deleting === wf.id}
                  title="Delete workflow"
                  className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all duration-150 disabled:opacity-50"
                >
                  {deleting === wf.id
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
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium">
                Previous
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium">
                Next
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {/* Delete confirmation modal */}
      {confirmWf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmWf(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Delete workflow?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              <span className="font-medium text-gray-700">"{confirmWf.name}"</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmWf(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              <button onClick={() => deleteWorkflow(confirmWf)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-[fadeIn_0.15s_ease]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">New Workflow</h2>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={createWorkflow} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Name</label>
                <input required value={newName} onChange={e => setNewName(e.target.value)} placeholder="My workflow" className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Description</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What does this workflow do?" rows={2} className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['orchestrator', 'supervisor'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setNewType(t)}
                      className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${newType === t ? 'bg-violet-600 border-violet-600 text-white shadow-sm' : 'border-gray-200 text-gray-600 hover:border-violet-200 hover:text-violet-600'}`}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {createError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                  {creating ? 'Creating…' : 'Create & Edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
