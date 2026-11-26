import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type OrgSecret, type Org } from '../lib/api'

export default function SecretsPage() {
  const navigate = useNavigate()
  const [org, setOrg] = useState<Org | null>(null)
  const [secrets, setSecrets] = useState<OrgSecret[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'org' | 'user'>('org')

  // Create form
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newScope, setNewScope] = useState<'org' | 'user'>('org')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [nameError, setNameError] = useState('')

  // Edit
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editing, setEditing] = useState(false)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.me(), api.secrets.list()])
      .then(([{ org }, { secrets }]) => { setOrg(org); setSecrets(secrets) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const isPro = !!(org && (org.plan === 'pro' || org.plan === 'enterprise' || (org.trialEndsAt && org.trialEndsAt > Date.now())))

  function validateName(name: string) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      setNameError('Must be UPPER_SNAKE_CASE (e.g. MY_API_KEY)')
    } else {
      setNameError('')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (nameError || !newName || !newValue) return
    setCreating(true); setCreateError('')
    try {
      const secret = await api.secrets.create({ name: newName, value: newValue, scope: newScope })
      setSecrets(prev => [...prev, secret])
      setNewName(''); setNewValue(''); setShowCreate(false)
    } catch (err: unknown) {
      setCreateError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function handleUpdate(id: string) {
    setEditing(true)
    try {
      await api.secrets.update(id, editValue)
      setEditId(null); setEditValue('')
    } catch (err: unknown) {
      alert((err as Error).message)
    } finally {
      setEditing(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true)
    try {
      await api.secrets.delete(id)
      setSecrets(prev => prev.filter(s => s.id !== id))
      setDeleteId(null)
    } catch (err: unknown) {
      alert((err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-full">
      <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!isPro) return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white p-8 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center max-w-md shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Secrets Manager is a Pro feature</h2>
        <p className="text-gray-500 text-sm mb-6">Store API keys and credentials securely. Reference them in workflow nodes as <code className="bg-gray-100 px-1 rounded">{'{{secret:MY_KEY}}'}</code></p>
        <button onClick={() => navigate('/upgrade')} className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors">
          Upgrade to Pro
        </button>
      </div>
    </div>
  )

  const displayedSecrets = secrets.filter(s => s.scope === activeTab)

  return (
    <div className="min-h-full bg-gradient-to-b from-slate-50 to-white p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Secrets Manager</h1>
          <p className="text-gray-500 text-sm mt-1">Store API keys and credentials securely. Reference them in workflow nodes as <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">{'{{secret:MY_KEY}}'}</code></p>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit">
          {(['org', 'user'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {tab === 'org' ? 'Org Secrets' : 'My Secrets'}
            </button>
          ))}
        </div>

        {/* Secrets table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
          {displayedSecrets.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No {activeTab === 'org' ? 'org' : 'personal'} secrets yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Scope</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-600">Created</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayedSecrets.map(secret => (
                  <tr key={secret.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3 font-mono text-gray-800 text-xs">{secret.name}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        secret.scope === 'org' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                      }`}>{secret.scope}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-400">{new Date(secret.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {editId === secret.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              placeholder="New value"
                              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300"
                            />
                            <button onClick={() => handleUpdate(secret.id)} disabled={editing || !editValue} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors">
                              {editing ? '…' : 'Save'}
                            </button>
                            <button onClick={() => { setEditId(null); setEditValue('') }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs transition-colors">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <button onClick={() => { setEditId(secret.id); setEditValue('') }} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                              Edit value
                            </button>
                            <button onClick={() => setDeleteId(secret.id)} className="px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors">
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Add secret button */}
        {!showCreate ? (
          <button
            onClick={() => { setShowCreate(true); setNewScope(activeTab) }}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add secret
          </button>
        ) : (
          <form onSubmit={handleCreate} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-semibold text-gray-900 mb-4">New secret</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Name</label>
                <input
                  required
                  value={newName}
                  onChange={e => { setNewName(e.target.value.toUpperCase()); validateName(e.target.value.toUpperCase()) }}
                  placeholder="MY_API_KEY"
                  className={`w-full border rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all ${nameError ? 'border-red-300' : 'border-gray-200'}`}
                />
                {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5 block">Value</label>
                <input
                  required
                  type="password"
                  value={newValue}
                  onChange={e => setNewValue(e.target.value)}
                  placeholder="sk-..."
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 transition-all"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 block">Scope</label>
              <div className="flex gap-2">
                {(['org', 'user'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setNewScope(s)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${newScope === s ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-200 text-gray-600 hover:border-brand-200'}`}
                  >
                    {s === 'org' ? 'Org (shared)' : 'Personal (only me)'}
                  </button>
                ))}
              </div>
            </div>
            {createError && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-3">{createError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowCreate(false); setCreateError('') }} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={creating || !!nameError} className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                {creating ? 'Saving…' : 'Save secret'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete secret?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone. Any workflows using this secret will stop working.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition-colors">Cancel</button>
              <button onClick={() => handleDelete(deleteId)} disabled={deleting} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
