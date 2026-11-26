import { useEffect, useState } from 'react'
import { api, type User, type Invite } from '../lib/api'

const ROLES = ['member', 'curator', 'admin'] as const
type Role = typeof ROLES[number]

const roleColors: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-700 border-violet-200',
  curator: 'bg-brand-100 text-brand-700 border-brand-200',
  member: 'bg-gray-100 text-gray-600 border-gray-200',
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleColors[role] ?? roleColors.member}`}>
      {role}
    </span>
  )
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

export default function MembersPage() {
  const [members, setMembers] = useState<User[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [me, setMe] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Role>('member')
  const [inviting, setSaving] = useState(false)
  const [newInviteUrl, setNewInviteUrl] = useState('')

  // Role change
  const [changingRole, setChangingRole] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.me().then(r => setMe(r.user)),
      api.members.list().then(r => setMembers(r.members)),
      api.members.invites.list().then(r => setInvites(r.invites)).catch(() => {}),
    ])
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNewInviteUrl('')
    try {
      const result = await api.members.invites.create(inviteEmail, inviteRole)
      setNewInviteUrl(result.inviteUrl)
      setInvites(prev => [...prev, { id: '', email: inviteEmail, role: inviteRole, token: result.token, expiresAt: Date.now() + 7 * 86400000 }])
      setInviteEmail('')
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function changeRole(userId: string, role: Role) {
    setChangingRole(userId)
    try {
      await api.members.changeRole(userId, role)
      setMembers(prev => prev.map(m => m.id === userId ? { ...m, role } : m))
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setChangingRole(null)
    }
  }

  async function removeMember(userId: string) {
    if (!confirm('Remove this member from the org?')) return
    try {
      await api.members.remove(userId)
      setMembers(prev => prev.filter(m => m.id !== userId))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  async function revokeInvite(token: string) {
    try {
      await api.members.invites.revoke(token)
      setInvites(prev => prev.filter(i => i.token !== token))
    } catch (e: unknown) {
      setError((e as Error).message)
    }
  }

  const isAdmin = me?.role === 'admin'
  const filteredMembers = search
    ? members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()))
    : members

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Members</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage who has access to your organization</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowInvite(s => !s); setNewInviteUrl('') }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Invite Member
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">{error}</div>
      )}

      {/* Invite form */}
      {showInvite && isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Invite a new member</h2>
          <form onSubmit={sendInvite} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Email</label>
              <input
                required
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
            <div className="w-full sm:w-36">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">Role</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 bg-white"
              >
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="w-full sm:w-auto px-5 py-2.5 h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {inviting ? 'Sending…' : 'Send Invite'}
            </button>
          </form>

          {newInviteUrl && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-semibold text-emerald-700 mb-2">Invite link created — share this with the invitee:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2 text-emerald-800 truncate">{newInviteUrl}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(newInviteUrl)}
                  className="shrink-0 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-emerald-600 mt-2">Expires in 7 days</p>
            </div>
          )}
        </div>
      )}

      {/* Members table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-700 shrink-0">{members.length} member{members.length !== 1 ? 's' : ''}</h2>
          {members.length > 5 && (
            <div className="relative max-w-xs w-full">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
              />
            </div>
          )}
        </div>
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredMembers.map(member => (
              <div key={member.id} className="flex items-center gap-4 px-6 py-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {member.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                    {member.id === me?.id && (
                      <span className="text-xs text-gray-400">(you)</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{member.email}</p>
                </div>
                <div className="text-xs text-gray-400 shrink-0 hidden md:block">
                  {member.lastActiveAt ? `Active ${timeAgo(member.lastActiveAt)}` : ''}
                </div>
                <div className="shrink-0">
                  {isAdmin && member.id !== me?.id ? (
                    <select
                      value={member.role}
                      onChange={e => changeRole(member.id, e.target.value as Role)}
                      disabled={changingRole === member.id}
                      className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:opacity-50"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <RoleBadge role={member.role} />
                  )}
                </div>
                {isAdmin && member.id !== me?.id && (
                  <button
                    onClick={() => removeMember(member.id)}
                    className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                    title="Remove member"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending invites */}
      {isAdmin && invites.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Pending invites</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {invites.map(invite => (
              <div key={invite.token} className="flex items-center gap-4 px-6 py-3">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{invite.email}</p>
                  <p className="text-xs text-gray-400">Expires {timeAgo(invite.expiresAt - Date.now() * 2 + invite.expiresAt)}</p>
                </div>
                <RoleBadge role={invite.role} />
                <button
                  onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join?token=${invite.token}`)}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                >
                  Copy link
                </button>
                <button
                  onClick={() => revokeInvite(invite.token)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
