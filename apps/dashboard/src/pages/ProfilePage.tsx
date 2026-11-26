import { useEffect, useState } from 'react'
import { api, type User, type Org } from '../lib/api'

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [org, setOrg] = useState<Org | null>(null)
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [threshold, setThreshold] = useState<number>(1)
  const [savingOrg, setSavingOrg] = useState(false)
  const [orgMsg, setOrgMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    api.me().then(r => {
      setUser(r.user)
      setOrg(r.org)
      setName(r.user.name)
      setOrgName(r.org.name)
      setThreshold(r.org.settings?.approvalThreshold ?? 1)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!name.trim() || !user) return
    setSaving(true); setMsg(null)
    try {
      await api.updateMe({ name: name.trim() })
      setUser(u => u ? { ...u, name: name.trim() } : u)
      setMsg({ text: 'Name updated.', ok: true })
    } catch (e: unknown) {
      setMsg({ text: (e as Error).message, ok: false })
    } finally {
      setSaving(false)
    }
  }

  async function saveOrgSettings() {
    if (!org) return
    setSavingOrg(true); setOrgMsg(null)
    try {
      const updated = await api.updateOrg(org.slug, {
        name: orgName.trim(),
        approvalThreshold: threshold,
      })
      setOrg(updated)
      setOrgName(updated.name)
      setOrgMsg({ text: 'Organisation settings saved.', ok: true })
    } catch (e: unknown) {
      setOrgMsg({ text: (e as Error).message, ok: false })
    } finally {
      setSavingOrg(false)
    }
  }

  function revealKey() {
    if (apiKey) { setShowKey(s => !s); return }
    api.myApiKey().then(r => { setApiKey(r.apiKey); setShowKey(true) }).catch(() => {})
  }

  function copyKey() {
    if (!apiKey) { api.myApiKey().then(r => { setApiKey(r.apiKey); navigator.clipboard.writeText(r.apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}); return }
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return (
    <div className="p-8 flex items-center gap-3 text-sm text-gray-400">
      <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      Loading…
    </div>
  )

  if (!user) return <div className="p-8 text-sm text-red-500">Could not load profile.</div>

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your display name and API credentials</p>
      </div>

      {/* Identity card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800">Account</h2>
        </div>
        <div className="px-6 py-5 space-y-5">

          {/* Avatar placeholder */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{user.name}</p>
              <p className="text-sm text-gray-400">{user.email}</p>
            </div>
          </div>

          {/* Editable name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display name</label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && save()}
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
                maxLength={100}
              />
              <button
                onClick={save}
                disabled={saving || !name.trim() || name.trim() === user.name}
                className="px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {msg && (
              <p className={`text-xs mt-2 ${msg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{msg.text}</p>
            )}
          </div>

          {/* Read-only fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email</label>
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">{user.email}</p>
              <p className="text-[10px] text-gray-400 mt-1">Set by your OAuth provider — cannot be changed here</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role</label>
              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 capitalize">{user.role}</p>
            </div>
          </div>

          {org && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Organisation</label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5">
                <p className="text-sm text-gray-700 font-medium">{org.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide ${
                  org.plan === 'pro' ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-500'
                }`}>{org.plan}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Org settings — admin only */}
      {user.role === 'admin' && org && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Organisation Settings</h2>
              <p className="text-xs text-gray-400 mt-0.5">Applies to all skills in <span className="font-medium text-gray-600">{org.name}</span></p>
            </div>
            <span className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">Admin only</span>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Organisation name</label>
              <input
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
                maxLength={100}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 transition-all"
              />
              <p className="text-[10px] text-gray-400 mt-1">Shown to users in the chat widget and skill listings.</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Approval threshold</label>
              <p className="text-xs text-gray-400 mb-3">
                Number of curator/admin approvals required before a skill is published.
                Set to <span className="font-medium text-gray-600">0</span> to auto-publish without review.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={threshold}
                  onChange={e => setThreshold(Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
                  className="w-24 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400 text-center font-semibold transition-all"
                />
                <span className="text-sm text-gray-500">
                  {threshold === 0 ? 'Auto-approve (no review required)' : `approval${threshold === 1 ? '' : 's'} required`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              {orgMsg && (
                <p className={`text-xs ${orgMsg.ok ? 'text-emerald-600' : 'text-red-500'}`}>{orgMsg.text}</p>
              )}
              <button
                onClick={saveOrgSettings}
                disabled={savingOrg || (!orgName.trim() || (orgName.trim() === org.name && threshold === (org.settings?.approvalThreshold ?? 1)))}
                className="ml-auto px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl disabled:opacity-40 transition-colors"
              >
                {savingOrg ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API key card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">API Key</h2>
            <p className="text-xs text-gray-400 mt-0.5">Used for MCP integration and direct API calls</p>
          </div>
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">Keep secret</span>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 overflow-hidden">
              {showKey && apiKey ? apiKey : `sk-${'•'.repeat(32)}`}
            </div>
            <button
              onClick={revealKey}
              className="px-3 py-2.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-xl text-sm transition-colors"
              title={showKey ? 'Hide' : 'Reveal'}
            >
              {showKey ? '🙈' : '👁'}
            </button>
            <button
              onClick={copyKey}
              className="px-3 py-2.5 border border-gray-200 text-gray-500 hover:text-brand-600 hover:bg-brand-50 rounded-xl text-sm transition-colors"
              title="Copy"
            >
              {copied ? '✓' : '⧉'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Never share this key. If compromised, contact <a href="mailto:hello@raxteam.com" className="text-brand-600 hover:underline">hello@raxteam.com</a> to rotate it.
          </p>
        </div>
      </div>
    </div>
  )
}
