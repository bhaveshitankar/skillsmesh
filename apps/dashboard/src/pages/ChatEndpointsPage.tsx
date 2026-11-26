import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type Org, type ChatEndpoint, type Workflow } from '../lib/api'

const API_URL = import.meta.env.VITE_API_URL ?? 'https://api.raxteam.com'

export default function ChatEndpointsPage() {
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [endpoints, setEndpoints] = useState<ChatEndpoint[]>([])
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [loading, setLoading] = useState(true)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createWorkflowId, setCreateWorkflowId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit modal
  const [editEp, setEditEp] = useState<ChatEndpoint | null>(null)
  const [editName, setEditName] = useState('')
  const [editWorkflowId, setEditWorkflowId] = useState('')
  const [saving, setSaving] = useState(false)

  // Copied token
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.me().then(({ org }) => setOrg(org)),
      api.chatEndpoints.list().then(r => setEndpoints(r.endpoints)).catch(() => {}),
      api.workflows.list({ limit: 200 }).then(r => setWorkflows(r.workflows)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const isPro = !!(org && (org.plan === 'pro' || org.plan === 'enterprise' || (org.trialEndsAt && org.trialEndsAt > Date.now())))

  async function handleCreate() {
    if (!createName.trim()) return
    setCreating(true); setCreateError('')
    try {
      const res = await api.chatEndpoints.create({
        name: createName.trim(),
        workflowId: createWorkflowId || undefined,
      })
      setEndpoints(prev => [...prev, {
        id: res.endpoint.id,
        orgId: org!.id,
        name: res.endpoint.name,
        token: res.endpoint.token,
        workflowId: createWorkflowId || null,
        config: {},
        createdAt: Date.now(),
      }])
      setShowCreate(false); setCreateName(''); setCreateWorkflowId('')
    } catch (e: unknown) {
      setCreateError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveEdit() {
    if (!editEp) return
    setSaving(true)
    try {
      await api.chatEndpoints.update(editEp.id, {
        name: editName.trim() || editEp.name,
        workflowId: editWorkflowId || null,
      })
      setEndpoints(prev => prev.map(e => e.id === editEp.id
        ? { ...e, name: editName.trim() || e.name, workflowId: editWorkflowId || null }
        : e
      ))
      setEditEp(null)
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this chat endpoint? The embed link will stop working.')) return
    await api.chatEndpoints.delete(id).catch(() => {})
    setEndpoints(prev => prev.filter(e => e.id !== id))
  }

  async function handleRotateToken(ep: ChatEndpoint) {
    if (!confirm('Regenerate token? The old embed link will stop working.')) return
    const res = await api.chatEndpoints.update(ep.id, { regenerateToken: true })
    setEndpoints(prev => prev.map(e => e.id === ep.id ? { ...e, token: res.token } : e))
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  function widgetUrl(token: string) {
    return `${window.location.origin}/chat/e/${token}`
  }

  function embedCode(token: string) {
    return `<script src="${API_URL}/widget.js" data-token="${token}" defer></script>`
  }

  if (loading || !org) return (
    <div className="flex items-center justify-center min-h-full">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!isPro) return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-5 text-2xl">💬</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Chat Endpoints is Pro</h2>
        <p className="text-sm text-gray-500 mb-6">Create multiple chat endpoints, each powered by a different supervisor — for external users, dev teams, or sales.</p>
        <Link to="/upgrade" className="px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-colors">
          Upgrade to Pro →
        </Link>
      </div>
    </div>
  )

  const supervisors = workflows.filter(w => w.type === 'supervisor' || w.type === 'orchestrator')

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">💬</span>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Chat Endpoints</h1>
            <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-semibold rounded-full">PRO</span>
          </div>
          <p className="text-sm text-gray-500 ml-11">Each endpoint is a standalone chat widget backed by a supervisor — for different audiences or use cases.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="shrink-0 px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Endpoint
        </button>
      </div>

      {/* Info strip */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center text-xs text-blue-700">
        <div><p className="font-bold mb-0.5">🏢 External Facing</p><p className="text-blue-500">Customer support chatbot powered by your support supervisor</p></div>
        <div><p className="font-bold mb-0.5">👩‍💻 Dev Team</p><p className="text-blue-500">Internal tool backed by your engineering knowledge base</p></div>
        <div><p className="font-bold mb-0.5">📈 Sales Team</p><p className="text-blue-500">Sales assistant with product knowledge and CRM integration</p></div>
      </div>

      {endpoints.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center">
          <div className="text-4xl mb-3">💬</div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">No chat endpoints yet</h3>
          <p className="text-sm text-gray-400 mb-4">Create your first endpoint and assign a supervisor to power it.</p>
          <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-semibold transition-colors">
            Create Endpoint
          </button>
          {workflows.filter(w => w.type === 'supervisor').length === 0 && (
            <p className="text-xs text-gray-400 mt-4">No supervisors yet. <Link to="/supervisor-builder" className="text-brand-600 underline">Build one first →</Link></p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {endpoints.map(ep => {
            const linkedWf = workflows.find(w => w.id === ep.workflowId)
            return (
              <div key={ep.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900">{ep.name}</h3>
                    {linkedWf ? (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Powered by <Link to={`/workflows/${linkedWf.id}`} className="text-brand-600 hover:underline">{linkedWf.name}</Link>
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${linkedWf.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-600'}`}>{linkedWf.status}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-0.5">No supervisor — uses skill context</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { setEditEp(ep); setEditName(ep.name); setEditWorkflowId(ep.workflowId ?? '') }}
                      className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg transition-colors"
                    >Edit</button>
                    <button onClick={() => handleDelete(ep.id)} className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-lg transition-colors">Delete</button>
                  </div>
                </div>

                {/* Widget URL */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Widget URL</p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate">{widgetUrl(ep.token)}</code>
                    <button onClick={() => copy(widgetUrl(ep.token), `url-${ep.id}`)} className="shrink-0 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium transition-colors">
                      {copied === `url-${ep.id}` ? '✓ Copied' : 'Copy'}
                    </button>
                    <button onClick={() => navigate(`/chat/e/${ep.token}`)} className="shrink-0 px-3 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-medium transition-colors">
                      Open →
                    </button>
                  </div>
                </div>

                {/* Embed code */}
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1.5">Embed Code</p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate font-mono">{embedCode(ep.token)}</code>
                    <button onClick={() => copy(embedCode(ep.token), `embed-${ep.id}`)} className="shrink-0 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium transition-colors">
                      {copied === `embed-${ep.id}` ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Token */}
                <div className="flex items-center gap-3">
                  <p className="text-xs text-gray-400">Token: <code className="font-mono text-gray-600">{ep.token.slice(0, 12)}…</code></p>
                  <button onClick={() => handleRotateToken(ep)} className="text-xs text-amber-600 hover:text-amber-700 underline transition-colors">Rotate token</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Create Chat Endpoint</h2>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Endpoint name *</label>
              <input
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="e.g. Customer Support, Dev Team Chat"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Supervisor / Orchestrator <span className="font-normal text-gray-400">(optional)</span></label>
              <select
                value={createWorkflowId}
                onChange={e => setCreateWorkflowId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
              >
                <option value="">None — use skill context</option>
                {supervisors.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                ))}
              </select>
              {supervisors.length === 0 && (
                <p className="text-xs text-gray-400 mt-1.5">No supervisors yet. <Link to="/supervisor-builder" className="text-brand-600">Build one →</Link></p>
              )}
            </div>

            {createError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2 mb-4">{createError}</p>}

            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={!createName.trim() || creating} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editEp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditEp(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Endpoint</h2>

            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Name</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                autoFocus
              />
            </div>

            <div className="mb-6">
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Supervisor / Orchestrator</label>
              <select
                value={editWorkflowId}
                onChange={e => setEditWorkflowId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
              >
                <option value="">None — use skill context</option>
                {supervisors.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.type})</option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditEp(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
